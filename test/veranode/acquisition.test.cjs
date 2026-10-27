const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../../apps/veranode/core.js'),runtime=require('../../apps/veranode/runtime.js');
const {platform}=require('./helpers.cjs'),{Graphics}=require('./graphics.cjs');

test('repeated maintenance transitions do not duplicate samples or restart HRM; failed resume stays paused',()=>{
 const f=platform(core),node=runtime.create(f.env);node.start();
 node.pauseRecording(true);const high=node.samples.next,power=f.power.length;
 node.pauseRecording(true);assert.equal(f.power.length,power);
 f.env.hrm=on=>{if(on)return false;};
 assert.throws(()=>node.pauseRecording(false),/non riavviato/);
 assert.equal(node.health().maintenancePaused,true);assert.equal(node.health().hrmRequested,false);
 assert.equal(node.samples.next,high);
 f.env.hrm=on=>{f.power.push(on);return on;};node.pauseRecording(false);
 const resumed=node.samples.next,calls=f.power.length;
 node.pauseRecording(false);assert.equal(node.samples.next,resumed);assert.equal(f.power.length,calls);
 assert.equal(resumed,high+1);node.dispose();
});

test('disconnect cancels queued BLE notification but offline acquisition continues',async()=>{
 const f=platform(core),node=runtime.create(f.env);node.start();await Promise.resolve();
 f.bus.emit('connect');f.bus.emit('HRM',{bpm:72,confidence:99});
 const withNotification=f.clock.timers.size;
 f.bus.emit('disconnect');assert.equal(f.clock.timers.size,withNotification-1);
 const high=node.samples.next,sent=f.sent.length;
 f.clock.advance(60000);await Promise.resolve();
 assert.equal(f.sent.length,sent);assert.equal(node.samples.next,high+2);node.dispose();
});

test('a pressure reply from before maintenance cannot contaminate resumed sensor state',async()=>{
 const f=platform(core),pending=[];f.env.pressure=()=>new Promise(resolve=>pending.push(resolve));
 const node=runtime.create(f.env);node.start();node.pauseRecording(true);
 pending[0]({temperature:99});await Promise.resolve();
 assert.equal(node.health().temperatureReads,0);assert.equal(node.state.values.temperatura,undefined);
 node.pauseRecording(false);assert.equal(pending.length,2);
 pending[1]({temperature:23});await Promise.resolve();
 assert.equal(node.state.values.temperatura.value,23);node.dispose();
});

test('failed HRM startup rolls back flag, listeners and timers, and permits a clean retry',()=>{
 const f=platform(core);let fail=true;
 f.env.hrm=on=>{if(on&&fail)throw Error('HRM unavailable');f.power.push(on);};
 const node=runtime.create(f.env);
 assert.throws(()=>node.start(),/HRM unavailable/);
 assert.equal(node.state.running,false);assert.equal(node.health().scheduled,false);
 assert.equal(node.health().hrmRequested,false);assert.match(node.health().startError,/HRM unavailable/);
 assert.equal(f.bus.listenerCount('HRM'),0);assert.equal(f.clock.timers.size,0);
 fail=false;node.start();assert.equal(node.health().scheduled,true);
 assert.equal(f.bus.listenerCount('HRM'),1);assert.equal(node.health().startError,null);
 node.start();assert.equal(f.bus.listenerCount('HRM'),1);node.dispose();
});

test('actual boot plus actual clock starts sensors and records offline through standby and reconnect',async()=>{
 const f=platform(core),graphics=new Graphics();let input,screen=false;
 const release=require('../../bin/build-veranode-release.cjs').build();
 const files=Object.fromEntries(release.bundle.files.map(f=>[f.name,Buffer.from(f.base64,'base64').toString()]));
 const modules={};
 function moduleFor(name){if(!modules[name]){const e={exports:{}};vm.runInNewContext(files[name],e);modules[name]=e.exports;}return modules[name];}
 const context=vm.createContext({global:{},bleServices:{},bleServiceOptions:{},g:graphics,
 Date:class extends Date {static now(){return f.clock.now();}},
 process:{env:{BOARD:'BANGLEJS2',VERSION:'2v29'}},
 setTimeout:f.clock.setTimeout,clearTimeout:f.clock.clearTimeout,setInterval:f.clock.setInterval,clearInterval:f.clock.clearInterval,
 require:n=>n==='Storage'?f.storage:moduleFor(n),
 Bangle:{setLCDPower:on=>screen=on,setLCDBrightness:()=>{},setBacklight:()=>{},setLocked:()=>{},setLCDTimeout:()=>{},
 getOptions:()=>({}),setOptions:()=>{},setUI:ui=>input=ui,isCharging:()=>false,
 setHRMPower:on=>{f.power.push(on);return on;},getAccel:f.env.accel,getPressure:f.env.pressure,buzz:()=>{},
 on:(e,fn)=>f.bus.on(e,fn),removeListener:(e,fn)=>f.bus.off(e,fn)},
 NRF:{getAddress:()=>f.env.mac,getSecurityStatus:()=>({connected:false}),setServices:()=>{},updateServices:()=>{},
 on:(e,fn)=>f.bus.on(e,fn),removeListener:(e,fn)=>f.bus.off(e,fn)},E:{getBattery:()=>80}});
 const run=name=>vm.runInContext(files[name],context);
 run('veranode.boot.js');run('veranode.app.js'); // Start synchronously even before the deferred boot callback.
 f.clock.advance(0);await Promise.resolve();
 const node=context.global.VeraNode;
 assert.equal(node.health().scheduled,true);assert.equal(node.health().hrmRequested,true);
 assert.equal(f.bus.listenerCount('HRM'),1);assert.equal(screen,false);
 f.bus.emit('HRM',{bpm:73,confidence:99});f.clock.advance(30000);await Promise.resolve();
 let row=node.samples.readBatch(1,1)[0];
 assert.equal(row.data.values.battito.value,73);assert.equal(row.data.values.temperatura.value,23.4);
 const legacy=core.frames(node.state.values,f.clock.now());assert.ok(legacy['2a37']);assert.ok(legacy['2a1f']);
 f.bus.emit('connect');f.bus.emit('disconnect');
 const before=node.samples.next;
 input.remove(); // Removing UI must not remove collector timers/listeners.
 f.clock.advance(60000);await Promise.resolve();
 assert.equal(node.samples.next,before+2);assert.equal(node.health().running,true);
 assert.ok(node.health().temperatureReads>=2);assert.equal(node.health().heartEvents,1);
 node.pauseRecording(true);const high=node.samples.next;
 assert.equal(node.health().hrmRequested,false);assert.equal(node.health().maintenancePaused,true);
 f.clock.advance(60000);assert.equal(node.samples.next,high);
 node.pauseRecording(false);assert.equal(node.health().hrmRequested,true);assert.ok(node.samples.next>high);
 node.dispose();assert.equal(node.health().scheduled,false);
});
