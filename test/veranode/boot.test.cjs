const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../../apps/veranode/core.js');
const runtime = require('../../apps/veranode/runtime.js');
const {platform} = require('./helpers.cjs');
test('system boot keeps Vera GATT services and starts sensors only after service registration', () => {
  const f = platform(core), setServices = [], updated = [], display = [];
  const graphics = new (require('./graphics.cjs').Graphics)();
  const context = {global: {}, bleServices: {'abcd': {}}, bleServiceOptions: {uart: false},
    g: graphics,
    require: name => { if (name === 'Storage') return f.storage;
      assert.ok(graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Avvio in corso'));
      return name === 'veranode.core.js' ? core : name === 'veranode.clock.js' ? require('../../apps/veranode/clock.js') : name === 'veranode.wire.js' ? require('../../apps/veranode/wire.js') : runtime; },
    Date, setTimeout: f.clock.setTimeout, clearTimeout: f.clock.clearTimeout,
    setInterval: f.clock.setInterval, clearInterval: f.clock.clearInterval,
    Bangle: {setLCDPower: on=>display.push(on),setLCDBrightness:()=>{},setBacklight:()=>{},
      setHRMPower: on => f.power.push(on), getAccel: f.env.accel, getPressure: f.env.pressure,
      buzz: () => {}, on: (e,fn) => f.bus.on(e,fn), removeListener: (e,fn) => f.bus.off(e,fn)},
    NRF: {getAddress: () => 'aa:bb:cc:dd:ee:02 random', getSecurityStatus: () => ({connected: false}),
      setServices: s => setServices.push(s), updateServices: s => updated.push(s),
      on: (e,fn) => f.bus.on(e,fn), removeListener: (e,fn) => f.bus.off(e,fn)}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../apps/veranode/boot.js'), 'utf8'), context);
  assert.ok(context.bleServices['180d']['2a37']); assert.ok(context.bleServices.abcd);
  assert.equal(setServices.length, 0); assert.equal(context.bleServiceOptions.uart, true);
  assert.equal(f.power.length, 0);
  f.clock.advance(0); assert.equal(f.power.at(-1), true);
  assert.equal(context.global.VeraBoot.phase,'Pronto');
  assert.ok(display.length>1);
  context.global.VeraNode.dispose();
});

test('startup shows a failure state instead of an indefinite loading message',()=>{
 const graphics=new (require('./graphics.cjs').Graphics)();
 const context={global:{},Date,g:graphics,
   Bangle:{setLCDPower:()=>{},setLCDBrightness:()=>{},setBacklight:()=>{}},
   require:()=>{throw Error('Storage unavailable');}};
 assert.throws(()=>vm.runInNewContext(fs.readFileSync(require.resolve('../../apps/veranode/boot.js'),'utf8'),context),/Storage unavailable/);
 assert.equal(context.global.VeraBoot.failed,true);
 assert.equal(context.global.VeraBoot.phase,'Errore avvio');
 assert.ok(graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Avvio interrotto'));
});

test('a graphics failure cannot prevent acquisition startup',()=>{
 const f=platform(core),graphics=new(require('./graphics.cjs').Graphics)();
 graphics.fillCircle=()=>{throw Error('Display unavailable');};
 const context={global:{},Date,g:graphics,bleServices:{},bleServiceOptions:{},
  setTimeout:f.clock.setTimeout,clearTimeout:f.clock.clearTimeout,
  setInterval:f.clock.setInterval,clearInterval:f.clock.clearInterval,
  require:n=>n==='Storage'?f.storage:n==='veranode.core.js'?core:n==='veranode.clock.js'?require('../../apps/veranode/clock.js'):n==='veranode.wire.js'?require('../../apps/veranode/wire.js'):runtime,
  Bangle:{setLCDPower:()=>{},setLCDBrightness:()=>{},setBacklight:()=>{},setHRMPower:()=>{},getAccel:f.env.accel,getPressure:f.env.pressure,
   on:(e,fn)=>f.bus.on(e,fn),removeListener:(e,fn)=>f.bus.off(e,fn)},
  NRF:{getAddress:()=> 'AA:BB:CC:DD:EE:02',getSecurityStatus:()=>({connected:false}),updateServices:()=>{},on:(e,fn)=>f.bus.on(e,fn),removeListener:(e,fn)=>f.bus.off(e,fn)}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../../apps/veranode/boot.js'),'utf8'),context);
 f.clock.advance(0);assert.equal(context.global.VeraNode.state.running,true);
 assert.equal(context.global.VeraBoot.phase,'Pronto');assert.equal(context.global.VeraBoot.displayError,true);
 assert.equal(context.global.VeraBoot.failed,undefined);context.global.VeraNode.dispose();
});
