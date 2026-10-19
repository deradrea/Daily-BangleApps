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

test('Vera server reference retains distinct provenance, expiry and immutable samples',()=>{
  const f=setup(); f.samples.append('sample',100000,{value:72});
  const original=f.storage.files.get('s0'), req={...request(f),source:'vera_server'};
  assert.equal(f.tracker.sync(req).quality,'vera_server');
  const rows=f.history.readBatch(0,16);
  assert.equal(rows.at(-1).data.source,'vera_server');
  assert.equal(rows.at(-2).data.source,'vera_server');
  assert.equal(f.storage.files.get('s0'),original);
  assert.throws(()=>f.tracker.sync({...req,source:'phone_auto'}),/conflitto/);
  f.clock.time+=86400001; assert.equal(f.tracker.status().quality,'stale');
  assert.equal(setup(f.storage).tracker.status().quality,'unverified');
});

test('unknown sources and excessive server uncertainty cannot change clock',()=>{
  for(const patch of [{source:'pc_auto'},{source:'server'},{source:'vera_server',uncertaintyMs:5001}]) {
    const f=setup(), before=f.clock.now();
    assert.throws(()=>f.tracker.sync({...request(f),...patch}));
    assert.equal(f.clock.now(),before);
  }
});
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
  const p=platform(core);p.env.timeFactory=clockModule.create;
  let wallOffset=0;p.env.clock={...p.clock,now:()=>p.clock.now()+wallOffset,
    setWall:ms=>{wallOffset=ms-p.clock.now();}};
  const node=runtime.create(p.env);node.start();p.bus.emit('HRM',{bpm:72,confidence:99});
  const state=node.readClock();node.syncClock({utcMs:1792051200000,timezoneMinutes:120,uncertaintyMs:2000,source:'phone_auto',
    syncId:'11111111-1111-4111-8111-111111111111',epoch:state.epoch,revision:state.revision,boot:state.boot});
  assert.deepEqual(node.state.values,{});assert.equal(node.state.running,true);
  node.tick();assert.ok(node.samples.readBatch(0,16).at(-1).at>1577836800000);node.dispose();
});
