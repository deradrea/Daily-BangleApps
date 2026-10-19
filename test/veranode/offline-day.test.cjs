const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../apps/veranode/core.js');
const runtime = require('../../apps/veranode/runtime.js');
const {MemoryStorage, platform} = require('./helpers.cjs');

test('startup inventories StorageFiles once and reports real recovery progress without changing rows',()=>{
 const p=platform(core), before=new core.Journal(p.storage,'veranode.s',{maxSegments:8,segmentRecords:32});
 for(let i=0;i<67;i++)before.append('sample',i*30000,{values:{battito:70}});
 const raw=[...p.storage.files.entries()],steps=[];
 let inventories=0;const list=p.storage.list.bind(p.storage);
 p.storage.list=(...args)=>{inventories++;return list(...args);};
 p.env.progress=(phase,done,total)=>steps.push({phase,done,total});
 const n=runtime.create(p.env);
 assert.equal(inventories,1);assert.deepEqual([...p.storage.files.entries()],raw);
 assert.equal(n.samples.checkpoint.epoch,before.checkpoint.epoch);
 assert.deepEqual(steps.filter(s=>s.phase==='Campioni').map(s=>[s.done,s.total]),[[0,3],[1,3],[2,3],[3,3]]);
 assert.equal(steps.at(-1).phase,'Profilo');n.start();assert.equal(steps.at(-1).phase,'Pronto');n.dispose();
});

test('expanded journal retains legacy full archive and continues its epoch and sequence', () => {
 const p=platform(core), old=new core.Journal(p.storage,'veranode.s',{maxSegments:8,segmentRecords:32});
 for(let i=0;i<256;i++) old.append('sample',i*30000,{scope:'unprovisioned',values:{}});
 const bytes=[...p.storage.files.entries()], epoch=old.checkpoint.epoch;
 const node=runtime.create(p.env);node.start();
 assert.equal(node.samples.stats().capacity,2944);
 assert.equal(node.samples.checkpoint.epoch,epoch);
 assert.equal(node.samples.next,258);
 for(const [name,raw] of bytes) assert.equal(p.storage.files.get(name),raw);
 assert.deepEqual(node.samples.readBatch(248,8).map(r=>r.seq),[249,250,251,252,253,254,255,256]);
 node.dispose();
});

test('a smaller requested quota discovers existing high numbered segments without hiding data',()=>{
 const storage=new MemoryStorage(), large=new core.Journal(storage,'s',{maxSegments:12,segmentRecords:2});
 for(let i=0;i<24;i++) large.append('sample',i,{});
 const before=[...storage.files.entries()], epoch=large.checkpoint.epoch;
 const reboot=new core.Journal(storage,'s',{maxSegments:8,segmentRecords:2});
 assert.equal(reboot.pending(),24);assert.equal(reboot.next,25);
 assert.equal(reboot.checkpoint.epoch,epoch);
 assert.equal(reboot.readBatch(20,4).at(-1).seq,24);
 assert.deepEqual([...storage.files.entries()],before);
 reboot.ack(epoch,24);assert.equal(reboot.pending(),0);
 assert.ok(reboot.append('sample',25,{}));
});

for(const recordMs of [10000,30000,45000]) test('24h offline cadence '+recordMs+' preserves every sample and survives reboot',async()=>{
 const p=platform(core);p.clock.time=Date.UTC(2026,9,16);
 p.storage.write('veranode.config.json',JSON.stringify({recordMs}));
 let node=runtime.create(p.env);node.start();await Promise.resolve();
 const count=Math.ceil(86400000/recordMs);
 for(let i=0;i<count;i++) {
  p.bus.emit('HRM',{bpm:72,confidence:99});
  p.clock.advance(recordMs);await Promise.resolve();
 }
 assert.equal(node.samples.pending(),count+1);
 assert.equal(node.state.paused,false);assert.equal(node.state.running,true);
 assert.ok(node.samples.stats().available>=32);
 const epoch=node.samples.checkpoint.epoch,high=node.samples.next-1,bytes=[...p.storage.files.values()].reduce((n,s)=>n+Buffer.byteLength(s),0);
 assert.ok(bytes<5700000,'measured raw fixture must fit the previous device free flash');
 node.dispose();node=runtime.create(p.env);
 assert.equal(node.samples.next-1,high);assert.equal(node.samples.checkpoint.epoch,epoch);
 let after=0,read=0;
 while(after<high){const rows=node.samples.readBatch(after,16);assert.ok(rows.length);read+=rows.length;after=rows.at(-1).seq;}
 assert.equal(read,count+1);
 node.samples.ack(epoch,high);assert.equal(node.samples.pending(),0);
 assert.ok(node.samples.stats().available>=count);
 node.dispose();
});


test('explicit preparation pause preserves journals and management listeners, then resumes',()=>{
 const f=platform(core),node=runtime.create(f.env);let changes=0;
 node.onChange(()=>changes++);node.start();
 const high=node.samples.next, epoch=node.samples.checkpoint.epoch;
 node.pauseRecording(true);const afterPause=changes;
 f.clock.advance(90000);
 assert.equal(node.samples.next,high);assert.equal(node.samples.checkpoint.epoch,epoch);
 assert.equal(node.state.maintenancePaused,true);assert.equal(f.power.at(-1),false);
 node.changed();assert.ok(changes>afterPause);
 node.pauseRecording(false);assert.equal(node.state.maintenancePaused,false);
 assert.ok(node.samples.next>high);assert.equal(f.power.at(-1),true);node.dispose();
});
