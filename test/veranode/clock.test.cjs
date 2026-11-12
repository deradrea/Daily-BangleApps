const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../apps/veranode/core.js');
const clockModule = require('../../apps/veranode/clock.js');
const runtime = require('../../apps/veranode/runtime.js');
const {platform, Clock, MemoryStorage} = require('./helpers.cjs');
function setup(storage = new MemoryStorage()) {
  const clock = new Clock(100000), samples = new core.Journal(storage,'s'), history = new core.Journal(storage,'t',{maxSegments:4,segmentRecords:16});
  clock.setWall = ms => {clock.time=ms;};
  const tracker=clockModule.create({core,storage,clock,samples,history});tracker.start();
  return {clock,samples,history,tracker,storage};
}
function request(f) {
  const state=f.tracker.status();
  return {utcMs:1792051200000,timezoneMinutes:120,uncertaintyMs:2000,source:'phone_auto',
    syncId:'11111111-1111-4111-8111-111111111111',epoch:state.epoch,revision:state.revision,boot:state.boot};
}
test('clock sync is journaled before and after change and never rewrites existing samples',()=>{
  const f=setup();f.samples.append('sample',100000,{values:{battito:{value:72,at:100000}}});
  const original=f.storage.files.get('s0'), req=request(f);
  const result=f.tracker.sync(req);
  assert.equal(result.quality,'phone_auto');assert.equal(result.nowMs,req.utcMs);
  const rows=f.history.readBatch(0,16);
  assert.deepEqual(rows.map(r=>r.data.type),['boot','sync_intent','sync_applied']);
  assert.equal(rows[2].data.fromSequence,2);assert.equal(f.storage.files.get('s0'),original);
  const next=f.history.next;f.tracker.sync(req);assert.equal(f.history.next,next);
  assert.throws(()=>f.tracker.sync({...req,utcMs:req.utcMs+1}));
});
test('failed audit prevents time change; failed application remains uncertain',()=>{
  const f=setup(), req=request(f), before=f.clock.now();
  f.storage.fail=true;assert.throws(()=>f.tracker.sync(req));assert.equal(f.clock.now(),before);
  f.storage.fail=false;f.clock.setWall=()=>{throw Error('hardware failed');};
  assert.throws(()=>f.tracker.sync(req));assert.equal(f.tracker.status().quality,'unverified');
  assert.equal(f.history.readBatch(0,16).at(-1).data.type,'sync_intent');
});
test('reboot, stale references and time jumps cannot silently retain verified status',()=>{
  const f=setup();f.tracker.sync(request(f));f.clock.time+=86400001;
  assert.equal(f.tracker.status().quality,'stale');
  f.clock.time-=86404000;assert.equal(f.tracker.observe(),true);
  assert.equal(f.tracker.status().quality,'discontinuous');
  const reboot=setup(f.storage);assert.equal(reboot.tracker.status().quality,'unverified');
  assert.notEqual(reboot.tracker.status().boot,f.tracker.status().boot);
});
test('full time journal blocks sync without erasing history or stopping samples',()=>{
  const f=setup();while(f.history.append('clock',1,{type:'test'})) { /* Fill bounded audit. */ }
  const before=f.clock.now();assert.throws(()=>f.tracker.sync(request(f)));assert.equal(f.clock.now(),before);
  assert.ok(f.samples.append('sample',before,{}));assert.equal(f.history.pending(),64);
});
test('runtime sync clears stale sensor times and duration accumulators while preserving alert state',()=>{
  const p=platform(core);p.storage.write('veranode.collection',core.pack(true));p.env.timeFactory=clockModule.create;
  let wallOffset=0;p.env.clock={...p.clock,now:()=>p.clock.now()+wallOffset,
    setWall:ms=>{wallOffset=ms-p.clock.now();}};
  const node=runtime.create(p.env);node.start();p.bus.emit('HRM',{bpm:72,confidence:99});
  const state=node.readClock();node.syncClock({utcMs:1792051200000,timezoneMinutes:120,uncertaintyMs:2000,source:'phone_auto',
    syncId:'11111111-1111-4111-8111-111111111111',epoch:state.epoch,revision:state.revision,boot:state.boot});
  assert.deepEqual(node.state.values,{});assert.equal(node.state.running,true);
  node.tick();assert.ok(node.samples.readBatch(0,16).at(-1).at>1577836800000);node.dispose();
});

test('manual clock preserves original samples and cannot claim synchronized quality',()=>{
  const f=setup();f.tracker.sync(request(f));
  f.samples.append('sample',f.clock.now(),{bpm:72});
  const bytes=f.storage.files.get('s0'),s=f.tracker.status();
  const req={epoch:s.epoch,boot:s.boot,revision:s.revision,utcMs:1792054800000,timezoneMinutes:120};
  const result=f.tracker.manual(req);
  assert.equal(result.quality,'manual_device');assert.equal(result.validUntil,null);
  assert.equal(result.uncertaintyMs,null);assert.equal(f.storage.files.get('s0'),bytes);
  const rows=f.history.readBatch(0,16);
  assert.deepEqual(rows.slice(-2).map(r=>r.data.type),['manual_intent','manual_applied']);
  assert.equal(rows.at(-1).data.source,'device_manual');assert.equal(rows.at(-1).data.fromSequence,2);
  const next=f.history.next;f.tracker.manual(req);assert.equal(f.history.next,next);
  assert.throws(()=>f.tracker.manual({...req,utcMs:req.utcMs+1}));
  const fresh=f.tracker.status();f.tracker.sync({...request(f),epoch:fresh.epoch,boot:fresh.boot,revision:fresh.revision,
    syncId:'22222222-2222-4222-8222-222222222222'});
  assert.equal(f.tracker.status().quality,'phone_auto');
});

test('manual clock blocks stale forms and failed or full audit before changing time',()=>{
  for(const mutate of [r=>r.revision++,r=>r.boot='other',r=>r.utcMs=NaN,r=>r.timezoneMinutes=841]) {
    const f=setup(),s=f.tracker.status(),r={epoch:s.epoch,boot:s.boot,revision:s.revision,utcMs:1792054800000,timezoneMinutes:120};
    mutate(r);const before=f.clock.now();assert.throws(()=>f.tracker.manual(r));assert.equal(f.clock.now(),before);
  }
  for(const full of [true,false]) {
    const f=setup();if(full)while(f.history.append('clock',1,{})){}else f.storage.fail=true;
    const s=f.tracker.status(),before=f.clock.now();assert.throws(()=>f.tracker.manual({epoch:s.epoch,boot:s.boot,
      revision:s.revision,utcMs:1792054800000,timezoneMinutes:120}));assert.equal(f.clock.now(),before);
  }
});
