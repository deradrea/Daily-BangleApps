const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../../apps/veranode/core.js'),runtime=require('../../apps/veranode/runtime.js');
const {platform}=require('./helpers.cjs');
test('display reads update real sensors without samples, events or BLE publication',async()=>{
 const f=platform(core),n=runtime.create(f.env);n.start();
 assert.equal(n.startDisplayRead(),true);f.bus.emit('HRM',{bpm:71,confidence:99});await Promise.resolve();
 assert.equal(n.state.values.battito.value,71);assert.equal(n.state.values.temperatura.value,23.4);
 f.clock.advance(30000);await Promise.resolve();
 assert.equal(n.samples.pending(),0);assert.equal(n.events.pending(),0);assert.equal(f.sent.length,0);
 assert.equal(n.state.lastRecordAt,null);assert.equal(n.health().displayReadActive,true);
 n.endDisplayRead();const count=n.health().tickCount;f.clock.advance(90000);
 assert.equal(n.health().hrmRequested,false);assert.equal(n.health().scheduled,false);
 assert.equal(n.health().tickCount,count);n.dispose();
});
test('display off does not stop an App session or continuous collection',()=>{
 for(const mode of ['app','active']){
  const f=platform(core),n=runtime.create(f.env);n.start();n.setCollectionMode(mode);
  if(mode==='app')n.setAppSession(120,'fixture');
  n.startDisplayRead();n.endDisplayRead();const high=n.samples.next;
  f.clock.advance(30000);assert.equal(n.samples.next,high+1);assert.equal(n.health().hrmRequested,true);n.dispose();
 }
});
test('installer takes over a display probe and remains alive when display goes off',()=>{
 const f=platform(core),n=runtime.create(f.env);n.start();n.startDisplayRead();assert.equal(n.probeSensors(),true);
 assert.equal(n.endDisplayRead(),false);assert.equal(n.health().hrmRequested,true);
 f.clock.advance(90000);assert.equal(n.health().scheduled,false);assert.equal(n.samples.pending(),0);n.dispose();
});
test('disabled collection rejects a display probe',()=>{
 const f=platform(core),n=runtime.create(f.env);n.start();n.setCollectionMode('off');
 assert.equal(n.startDisplayRead(),false);assert.equal(n.health().hrmRequested,false);n.dispose();
});

test('quick display wake reuses HRM and valid readings without recording',()=>{
 const f=platform(core),n=runtime.create(f.env);n.start();n.startDisplayRead();
 f.bus.emit('HRM',{bpm:72,confidence:99});n.endDisplayRead();
 f.clock.advance(10000);const powers=f.power.length;
 assert.equal(n.startDisplayRead(),true);
 assert.equal(f.power.length,powers);assert.equal(n.state.values.battito.value,72);
 f.clock.advance(6000);assert.equal(n.health().hrmRequested,true);
 assert.equal(n.samples.pending(),0);assert.equal(n.events.pending(),0);assert.equal(f.sent.length,0);
 n.endDisplayRead();f.clock.advance(15000);
 assert.equal(n.health().hrmRequested,false);assert.equal(n.health().scheduled,false);n.dispose();
});

test('display grace cannot stop a new App session or survive disposal',()=>{
 const f=platform(core),n=runtime.create(f.env);n.start();n.startDisplayRead();n.endDisplayRead();
 n.setAppSession(120,'fixture');f.clock.advance(16000);
 assert.equal(n.appSessionActive(),true);assert.equal(n.health().hrmRequested,true);
 n.dispose();assert.equal(n.startDisplayRead(),false);const count=f.clock.timers.size;f.clock.advance(90000);
 assert.equal(f.clock.timers.size,count);assert.equal(n.health().hrmRequested,false);
});

test('standby grace is bounded and repeated standby does not extend it',()=>{
 const f=platform(core),n=runtime.create(f.env);n.start();n.startDisplayRead();n.endDisplayRead();
 f.clock.advance(14000);n.endDisplayRead();f.clock.advance(1000);
 assert.equal(n.health().hrmRequested,false);assert.equal(n.samples.pending(),0);
 assert.equal(n.startDisplayRead(),true);f.bus.emit('HRM',{bpm:74,confidence:99});
 n.endDisplayRead();n.probeSensors();f.clock.advance(16000);
 assert.equal(n.health().sensorProbeActive,true);assert.equal(n.health().hrmRequested,true);n.dispose();
});
