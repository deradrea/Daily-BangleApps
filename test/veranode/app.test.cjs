const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../../apps/veranode/core.js');
const {Clock} = require('./helpers.cjs');
const {Graphics} = require('./graphics.cjs');
function fixture(savedStyle, batteryValue = 80, boot = false) {
  let face = savedStyle ? {style:savedStyle} : {};
  let ble = {enabled:true};
  const storage = {readJSON: name => name === "setting.json" ? {brightness:1} : name === "veranode.ble.json" ? ble : face, write: (name,value) => {if(name === "veranode.face.json") face = JSON.parse(value);if(name === "veranode.ble.json") ble = JSON.parse(value);}};
  const radio=[];
  let charging = false; const listeners = new Map();
  const security = {connected: true, connected_addr: "11:22:33:44:55:66 random", encrypted: true, bonded: true};
  const clock = new Clock(Date.now()), graphics = new Graphics(), changes = [], power = [], responses = [], locks = [], brightness = [], backlight = [];
  const state = {mac: 'AA:BB:CC:DD:A2:44', connected: true, running: false, queue: [], policy: {revision: 1},
    recordIntervalMs: 30000, nextRecordAt: clock.now()+30000,
    values: {battito: {value: 72, at: clock.now()}, temperatura: {value: 23.4, at: clock.now()}}};
  if (boot && typeof boot === 'object') Object.assign(state,boot);
  let update, input, statsReads = 0;
  const stats = {pending: 123, stored: 128, capacity: 2944, available: 2816, full: false};
  const options = {wakeOnBTN1: true};
  const context = {require: name => name === "Storage" ? storage : core, global: {__FILE__: boot ? 'veranode.app.js' : undefined, VeraNode: {state,
    start: () => {state.running = true;},
    samples: {pending: () => stats.pending, stats: () => {statsReads++; return {...stats};}},
    onChange: fn => {update = fn; return () => {update = null;};},
    respond: id => {responses.push(id); state.queue.shift(); update(); return true;}}},
    Bangle: {isCharging: () => charging, on: (event, fn) => listeners.set(event, fn),
      removeListener: (event, fn) => {if (listeners.get(event) === fn) listeners.delete(event);}, getOptions: () => options, setOptions: v => changes.push(v), setLCDTimeout: () => {},
      setBacklight: on => backlight.push(on), setLCDPower: on => power.push(on), setLocked: v => locks.push(v), setLCDBrightness: v => brightness.push(v),
      setUI: v => {input = v;}},
    NRF: {getSecurityStatus: () => security, sleep: () => {radio.push(false);security.connected=false;}, wake: () => radio.push(true)}, E: {getBattery: () => batteryValue}, g: graphics, Date: class extends Date {constructor(...args) {super(...(args.length ? args : [clock.now()]));} static now() {return clock.now();}}, setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout, setInterval: clock.setInterval, clearInterval: clock.clearInterval};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../apps/veranode/app.js'), 'utf8'), context);
  return {clock, graphics, state, radio, stats, consentTrace: () => context.global.VeraNode.uiConsentTrace, statsReads: () => statsReads, update: () => update(), input, power, locks, brightness, backlight, changes, responses, options, listeners, security, charging: value => {charging = value; if (listeners.has("charging")) listeners.get("charging")(value);}};
}
test('actual clock has no hidden redraw, uses requested label and cleans up UI only', () => {
  const f = fixture(); assert.equal(f.state.running, true); assert.equal(f.power.at(-1), false); assert.equal(f.locks.at(-1), false); assert.equal(f.graphics.commands.length, 0);
  f.update(); f.clock.advance(5000); assert.equal(f.graphics.commands.length, 0);
  f.input.btnRelease(); f.clock.advance(401); assert.equal(f.brightness.at(-1), 1);
  assert.ok(f.graphics.commands.some(c => c.type === 'text' && c.args[0] === '23.4'));
  assert.ok(f.graphics.commands.some(c => c.type === 'text' && c.args[0] === 'A244'));
  const time = f.graphics.commands.find(c => c.type === 'text' && /^\d\d:\d\d$/.test(c.args[0]));
  assert.equal(time.align, 0); assert.equal(time.size, 12);
  assert.equal(f.backlight.at(-1), true);
  f.clock.advance(10000); assert.equal(f.power.at(-1), false); assert.equal(f.backlight.at(-1), false);
  f.input.remove(); assert.equal(f.clock.timers.size, 0); assert.equal(f.changes.at(-1), f.options);
});
test('touch outside the action cannot acknowledge; correct target is durable response', () => {
  const f = fixture(); f.state.queue.push({id: 'alert-one', metric: 'battito', value: 110, severity: 'warning'});
  f.update(); assert.equal(f.power.at(-1), true); assert.equal(f.brightness.at(-1), 1);
  assert.ok(f.graphics.commands.some(c => c.type === 'text' && c.args[0] === 'Chiudi'));
  assert.ok(!f.graphics.commands.some(c => c.type === 'text' && ['Si', 'No', 'Ho visto'].includes(c.args[0])));
  f.input.touch(1, {x: 40, y: 40}); assert.equal(f.responses.length, 0);
  f.input.touch(1, {x: 40, y: 160}); assert.deepEqual(f.responses, ['alert-one']); f.input.remove();
});
module.exports = {fixture};

test('management consent preempts but never acknowledges a queued sensor alert', () => {
  const f=fixture(), decisions=[];
  f.state.queue.push({id:'retained',metric:'battito',value:110,severity:'warning'});
  f.update();
  f.state.consent={id:'manage',user:'11111111-1111-4111-8111-111111111111',decide:v=>{
    decisions.push(v);f.state.consent=null;f.update();return true;
  }};
  f.update();
  assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Vera App?'));
  f.input.btn();f.input.btnRelease();f.clock.advance(21000);
  assert.equal(f.power.at(-1),true);assert.equal(f.state.queue.length,1);
  f.input.touch(1,{x:40,y:157});
  assert.deepEqual(decisions,[true]);assert.deepEqual(f.responses,[]);
  assert.equal(f.state.queue[0].id,'retained');
  assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Chiudi'));
  f.input.remove();assert.equal(f.clock.timers.size,0);
});

test('charging status refreshes only visible screen without extending wake time', () => {
  const f = fixture();
  const bolt = () => f.graphics.commands.some(c => c.type === 'fillPoly' && c.args[0][0] === 113);
  f.charging(true); assert.equal(f.graphics.commands.length, 0); assert.equal(f.power.at(-1), false);
  f.input.btnRelease(); f.clock.advance(401); assert.equal(bolt(), true);
  f.charging(false); assert.equal(bolt(), false);
  f.clock.advance(5000); f.charging(true); assert.equal(bolt(), true);
  f.clock.advance(5000); assert.equal(f.power.at(-1), false);
  const commands = f.graphics.commands.length;
  f.charging(false); assert.equal(f.graphics.commands.length, commands);
  f.input.remove(); assert.equal(f.listeners.size, 0); assert.equal(f.clock.timers.size, 0);
});

test('a delayed system lock cannot suppress button wake after archive recovery', () => {
  const f=fixture(), powers=f.power.length;
  f.listeners.get('lock')(true);
  assert.equal(f.locks.at(-1),false);assert.equal(f.power.length,powers);
  f.input.btnRelease();f.clock.advance(401);assert.equal(f.power.at(-1),true);
  f.clock.advance(10000);assert.equal(f.power.at(-1),false);
  f.listeners.get('lock')(true);
  f.input.btnRelease();f.clock.advance(401);assert.equal(f.power.at(-1),true);
  f.input.remove();assert.equal(f.listeners.size,0);assert.equal(f.clock.timers.size,0);
});

test('management consent wakes the display and only the explicit choice authorizes', () => {
  const f = fixture(), decisions = [];
  f.state.consent = {id: 'request', user: '11111111-1111-4111-8111-111111111111',
    decide: value => {decisions.push(value); f.state.consent = null; return true;}};
  f.update();
  assert.equal(f.power.at(-1), true);
  assert.ok(f.graphics.commands.some(c => c.type === 'text' && c.args[0]==='Consentire'));
  assert.ok(f.graphics.commands.some(c => c.type === 'text' && c.args[0]==='Vera App?'));
  f.input.touch(1, {x: 88, y: 100});
  assert.deepEqual(decisions, []);
  f.clock.advance(400);
  f.input.touch(1, {x: 40, y: 157});
  assert.deepEqual(decisions, [true]);
  assert.equal(f.state.consent, null);
  f.input.remove();
});

test('Bluetooth page shows actual peer and security without inventing a phone name', () => {
  const f = fixture(); f.input.swipe(-1); assert.equal(f.graphics.commands.length, 0);
  f.input.btnRelease(); f.clock.advance(401);
  f.input.touch(1,{x:30,y:155});
  const has = text => f.graphics.commands.some(c=>c.type==='text' && c.args[0]===text);
  assert.equal(has('Bluetooth'), true); assert.equal(has('11:22:33:44:55:66'),true);
  assert.equal(has('Scollega'),true);
  assert.equal(f.graphics.commands.filter(c=>c.type==='text'&&[62,80].includes(c.args[2])).map(c=>c.args[0]).join(' '),'Nome non comunicato');
  f.security.connected = false; f.state.connected = false; f.update(); f.clock.advance(2000);
  assert.equal(has('11:22:33:44:55:66'),false); assert.equal(has('Nessun dispositivo'),true);
  f.input.touch(1,{x:16,y:15}); assert.equal(has('23.4'),true);
  f.input.swipe(-1); assert.equal(has('Bluetooth'),true);
  f.input.swipe(1); assert.equal(has('72'),true);
  f.input.remove();
});
test('Bluetooth navigation cannot replace an active alert or acknowledge it', () => {
  const f=fixture(); f.state.queue.push({id:'a',metric:'battito',value:110,severity:'warning'});f.update();
  f.input.swipe(-1); assert.equal(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='ALERT'),true);
  assert.equal(f.responses.length,0); f.input.remove();
});

test('cycle ring uses runtime interval, advances visibly and stops while screen is off', () => {
  const f=fixture(); f.state.recordIntervalMs=30000; f.state.nextRecordAt=f.clock.now()+30000;
  f.input.btnRelease(); f.clock.advance(401);
  assert.equal(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Temperatura'),false);
  const partial = () => f.graphics.commands.filter(c=>c.type==='drawPoly'&&c.color==='#00ffff'&&c.args[0].length>4).at(-1);
  f.clock.advance(5000); assert.ok(partial().args[0].length >= 22);
  f.clock.advance(5000); assert.equal(f.power.at(-1),false);
  const count=f.graphics.commands.length;f.clock.advance(30000);assert.equal(f.graphics.commands.length,count);
  f.input.remove();assert.equal(f.clock.timers.size,0);
});

test('effects require explicit Apply, ignore gaps and rapid duplicate taps, then animate', () => {
  const f=fixture();f.input.btnRelease();f.clock.advance(401);f.input.swipe(0,-1);
  const has=text=>f.graphics.commands.some(c=>c.type==='text'&&c.args[0]===text);
  assert.equal(has('Effetti'),true);
  f.input.touch(1,{x:88,y:110});assert.equal(has('Ciclo sensori'),true); // gap
  f.clock.advance(301);f.input.touch(1,{x:134,y:105});assert.equal(has('Pulsazione'),true);
  f.input.touch(1,{x:134,y:105});assert.equal(has('Pulsazione'),true); // bounce
  f.clock.advance(301);f.input.touch(1,{x:134,y:105});assert.equal(has('Traccia'),true);
  f.clock.advance(301);f.input.touch(1,{x:88,y:155});
  f.clock.advance(250);let wave=f.graphics.commands.filter(c=>c.type==='drawPoly'&&c.args[0].length>=4&&c.args[0].length<=26).at(-1);
  assert.equal(wave.color,'#ff0000');
  const first=wave.args[0].slice();f.clock.advance(500);
  wave=f.graphics.commands.filter(c=>c.type==='drawPoly'&&c.args[0].length>=4&&c.args[0].length<=26).at(-1);
  assert.notDeepEqual(wave.args[0],first);
  f.state.values.battito.at=f.clock.now()-45001;f.clock.advance(250);
  wave=f.graphics.commands.filter(c=>c.type==='drawPoly'&&c.args[0].length>=4&&c.args[0].length<=26).at(-1);
  assert.equal(wave.color,'#ffffff');assert.deepEqual(Array.from(wave.args[0]),[18,110,158,110]);
  f.clock.advance(10000);let count=f.graphics.commands.length;f.clock.advance(1000);assert.equal(count,f.graphics.commands.length);
  f.input.remove();assert.equal(f.clock.timers.size,0);
});
test('pulsation changes geometry and cancelling preview retains active style', () => {
  const p=fixture('pulse');p.input.btnRelease();p.clock.advance(401);
  const ring=()=>p.graphics.commands.filter(c=>c.type==='drawPoly'&&c.color==='#ff0000'&&c.args[0].length===74).at(-1).args[0];
  const first=ring().slice();p.clock.advance(250);assert.notDeepEqual(ring(),first);
  p.input.swipe(0,-1);p.input.touch(1,{x:134,y:105});p.input.touch(1,{x:16,y:15});
  p.clock.advance(301);p.input.touch(1,{x:16,y:15});
  p.clock.advance(250);assert.ok(ring());p.input.remove();
});
test('still style has no animation timer and pulse style avoids drawing on internal pages', () => {
  const f=fixture('still');f.input.btnRelease();f.clock.advance(401);
  let count=f.graphics.commands.length;f.clock.advance(1000);assert.equal(f.graphics.commands.length,count);f.input.remove();
  const p=fixture('pulse');p.input.btnRelease();p.clock.advance(401);p.clock.advance(250);
  assert.ok(p.graphics.commands.some(c=>c.type==='drawPoly'&&c.color==='#ff0000'&&c.args[0].length===74));
  p.input.swipe(0,-1);count=p.graphics.commands.length;p.clock.advance(1000);assert.equal(p.graphics.commands.length,count);
  p.input.remove();assert.equal(p.clock.timers.size,0);
});

test('battery percentage is explicit, bounded and unknown does not mean empty', () => {
  for (const [level,label] of [[80,'80%'],[100.4,'100%'],[-2,'0%'],[NaN,'--%']]) {
    const f=fixture(undefined,level);f.input.btnRelease();f.clock.advance(401);
    const number=f.graphics.commands.find(c=>c.type==='text'&&c.args[0]===label);
    assert.ok(number);assert.equal(number.align,1);assert.equal(number.args[1],148);f.input.remove();
  }
});

test('double click pins without restarting animation and remains visible past timeout', () => {
  const f=fixture('trace');f.input.btnRelease();f.clock.advance(401);f.clock.advance(1250);
  const stroke=()=>f.graphics.commands.filter(c=>c.type==='drawPoly'&&c.color==='#ff0000').at(-1).args[0];
  const before=stroke().slice(), powers=f.power.length;
  f.input.btnRelease();const after=stroke();assert.equal(after.length,before.length);
  after.forEach((v,i)=>assert.ok(Math.abs(v-before[i])<0.5));assert.equal(f.power.length,powers);
  f.clock.advance(550);f.input.btnRelease();
  assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Fisso'));
  assert.equal(f.power.length,powers);f.clock.advance(15000);assert.equal(f.power.at(-1),true);
  f.input.btnRelease();assert.equal(f.power.at(-1),false);f.input.remove();
});

test('trace follows acquisition interval, holds at completion and resets only with the next cycle', () => {
  for (const interval of [30000,45000]) {
    const f=fixture('trace'), start=f.clock.now();
    f.state.recordIntervalMs=interval;f.state.nextRecordAt=start+interval;
    const dot=()=>f.graphics.commands.filter(c=>c.type==='fillCircle'&&c.args[1]===110&&c.args[2]===2).at(-1).args[0];
    f.clock.advance(interval/2-401);f.input.btnRelease();f.clock.advance(401);
    assert.ok(Math.abs(dot()-88)<0.01); // Wake halfway through the existing cycle.
    f.input.btnRelease();f.clock.advance(100);f.input.btnRelease();
    assert.ok(dot()>88); // Pinning does not reset the cycle.
    f.clock.advance(interval/2+500);f.state.values.battito.at=f.clock.now();f.update();f.clock.advance(2000);
    assert.equal(dot(),158); // No independent restart when a cycle is late.
    f.state.nextRecordAt=f.clock.now()+interval;f.update();f.clock.advance(1000);
    assert.ok(dot()>=18&&dot()<24); // Only a new acquisition cycle restarts it.
    f.input.remove();assert.equal(f.clock.timers.size,0);
  }
});

test('trace does not invent a moving cycle when acquisition timing is unavailable', () => {
  for (const value of [undefined,NaN,Infinity]) {
    const f=fixture('trace');f.state.nextRecordAt=value;
    f.input.btnRelease();f.clock.advance(401);f.clock.advance(1000);
    assert.equal(f.graphics.commands.some(c=>c.type==='fillCircle'&&c.args[1]===110&&c.args[2]===2),false);
    f.input.remove();
  }
});


test('watch can suspend reconnection and allow BLE again without stopping acquisition', () => {
  const f=fixture();f.input.btnRelease();f.clock.advance(401);f.input.swipe(-1);
  const has=text=>f.graphics.commands.some(c=>c.type==='text'&&c.args[0]===text);
  assert.ok(has('Scollega'));f.input.touch(1,{x:88,y:110});assert.deepEqual(f.radio,[]);
  f.clock.advance(301);f.input.touch(1,{x:88,y:138});
  assert.deepEqual(f.radio,[]);assert.ok(has('Sospendere BLE?'));
  f.clock.advance(301);f.input.touch(1,{x:88,y:106});
  assert.deepEqual(f.radio,[false]);assert.equal(f.state.bleEnabled,false);assert.equal(f.state.running,true);
  assert.ok(has('Abilita BLE'));assert.ok(has('BLE sospeso'));
  f.input.touch(1,{x:88,y:138});assert.deepEqual(f.radio,[false]);
  f.clock.advance(301);f.input.touch(1,{x:88,y:138});
  assert.deepEqual(f.radio,[false,true]);assert.equal(f.state.bleEnabled,true);assert.ok(has('Disponibile'));
  f.input.remove();assert.equal(f.clock.timers.size,0);
});

test('clock revision cancels stale click state and preserves display wake and pin',()=>{
  const f=fixture('trace');f.input.btnRelease();f.clock.advance(401);
  f.state.clockRevision=3;f.update();
  f.clock.advance(600);f.input.btnRelease();f.clock.advance(100);f.input.btnRelease();f.clock.advance(501);
  f.clock.advance(12000);assert.equal(f.power.at(-1),true);
  f.input.btnRelease();f.clock.advance(501);assert.equal(f.power.at(-1),false);
  f.input.remove();
});

test('scrolling menu keeps large labels and memory counts distinct',()=>{
  const f=fixture(),has=t=>f.graphics.commands.some(c=>c.type==='text'&&c.args[0]===t);
  f.input.btnRelease();f.clock.advance(401);f.input.swipe(0,1);
  assert.ok(has('Menu'));assert.ok(!has('1 / 2'));assert.ok(has('Raccolta'));
  f.input.touch(1,{x:88,y:89});assert.ok(has('Menu'));
  f.clock.advance(301);f.input.touch(1,{x:88,y:60});assert.ok(has('Attiva'));
  f.clock.advance(301);f.input.touch(1,{x:88,y:155});
  assert.ok(has('123'));assert.ok(has('Usati 128/2944'));assert.ok(has('Liberi 2816'));
  f.clock.advance(301);f.input.touch(1,{x:16,y:16});assert.ok(has('Attiva'));
  f.clock.advance(301);f.input.touch(1,{x:16,y:16});assert.ok(has('Menu'));
  assert.deepEqual(f.radio,[]);f.input.remove();
});

test('collection distinguishes BLE presence from delivery and flags blocked or stale recording', () => {
  const f=fixture(), has=text=>f.graphics.commands.some(c=>c.type==='text'&&String(c.args[0])===text);
  f.state.lastRecordAt=f.clock.now()-12000;
  f.input.btnRelease();f.clock.advance(401);f.input.touch(1,{x:88,y:155});
  assert.ok(has('BLE collegato'));assert.ok(has('Invio: vedi app'));
  f.security.connected=false;f.update();f.clock.advance(2000);assert.ok(has('Offline'));
  assert.ok(has('Senza telefono'));assert.ok(f.graphics.commands.some(c=>c.type==='text'&&/^Ultimo: [0-9][0-9]:[0-9][0-9]$/.test(c.args[0])));
  f.state.paused=true;f.state.storageError='Memoria campioni piena';f.update();f.clock.advance(2000);
  assert.ok(has('Da verificare'));assert.ok(has('Verifica memoria'));assert.ok(!has('Attiva'));
  f.input.remove();
});

test('settings and profile are reachable with back navigation and no radio or profile mutation', () => {
  const f=fixture(), has=text=>f.graphics.commands.some(c=>c.type==='text'&&c.args[0]===text);
  const original=JSON.stringify(f.state.policy);
  f.input.btnRelease();f.clock.advance(401);f.input.touch(1,{x:20,y:15});
  f.clock.advance(301);f.input.swipe(0,-1);f.input.swipe(0,-1);f.input.touch(1,{x:130,y:118});assert.ok(has('Sistema'));
  f.clock.advance(301);f.input.touch(1,{x:88,y:100});assert.ok(has('Profilo Vera'));
  f.clock.advance(301);f.input.touch(1,{x:16,y:15});assert.ok(has('Sistema'));
  assert.equal(JSON.stringify(f.state.policy),original);assert.deepEqual(f.radio,[]);f.input.remove();
});

test('collection screen adds no off-screen polling and cannot dismiss an incoming alert via menu', () => {
  const f=fixture();f.input.btnRelease();f.clock.advance(401);f.input.swipe(0,1);
  f.input.touch(1,{x:45,y:60});f.clock.advance(10000);
  const reads=f.statsReads(), commands=f.graphics.commands.length;
  f.clock.advance(3600000);f.update();assert.equal(f.statsReads(),reads);assert.equal(f.graphics.commands.length,commands);
  f.state.queue.push({id:'safety',metric:'battito',value:120,severity:'warning'});f.update();
  f.input.swipe(0,1);f.input.touch(1,{x:20,y:15});
  assert.equal(f.responses.length,0);assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='ALERT'));
  f.input.remove();assert.equal(f.clock.timers.size,0);
});

test('long BLE names fit two measured lines with explicit truncation without changing peer identity', () => {
  const f=fixture(), name='W'.repeat(60);f.state.peerName=name;
  f.input.btnRelease();f.clock.advance(401);f.input.swipe(-1);
  const lines=f.graphics.commands.filter(c=>c.type==='text'&&[62,80].includes(c.args[2]));
  assert.equal(lines.length,2);assert.ok(lines[1].args[0].endsWith('...'));
  for(const line of lines) assert.ok(line.args[0].length*line.size*0.55<=160);
  assert.equal(f.state.peerName,name);f.input.remove();
});

test('consent from standby stays lit beyond LCD timeout and every side-button gesture preserves the question', () => {
  const f=fixture(), decisions=[];
  f.state.consent={id:'wake',user:'11111111-1111-4111-8111-111111111111',decide:value=>{decisions.push(value);f.state.consent=null;return true;}};
  f.update();assert.equal(f.power.at(-1),true);
  f.clock.advance(21000);assert.equal(f.power.at(-1),true);
  f.input.btnRelease();f.clock.advance(100);f.input.btnRelease();
  f.input.btn();f.clock.advance(1200);f.input.btnRelease();
  assert.deepEqual(decisions,[]);assert.ok(f.state.consent);
  assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Consentire'));
  assert.equal(f.power.at(-1),true);
  f.clock.advance(400);f.input.touch(1,{x:40,y:157});
  assert.deepEqual(decisions,[true]);assert.equal(f.power.at(-1),false);f.input.remove();
});

test('consent ignores wake-touch overlap, button gaps and margins; deliberate No remains possible', () => {
  const f=fixture(), decisions=[];
  f.state.consent={id:'safe-touch',user:'11111111-1111-4111-8111-111111111111',decide:value=>{decisions.push(value);f.state.consent=null;return true;}};
  f.update();f.input.touch(1,{x:40,y:157});assert.deepEqual(decisions,[]);
  f.clock.advance(500);f.input.btnRelease();f.input.touch(1,{x:130,y:157});assert.deepEqual(decisions,[]);
  f.clock.advance(400);
  for(const point of [{x:88,y:157},{x:40,y:133},{x:130,y:175},{x:172,y:157}]) f.input.touch(1,point);
  assert.deepEqual(decisions,[]);assert.ok(f.state.consent);
  f.input.touch(1,{x:130,y:157});assert.deepEqual(decisions,[false]);f.input.remove();
});

test('protocol cancellation closes a pinned consent without inventing an answer', () => {
  for(const pinned of [false,true]) {
    const f=fixture(), decisions=[];
    if(pinned){f.input.btnRelease();f.clock.advance(401);f.input.btnRelease();f.clock.advance(100);f.input.btnRelease();}
    f.state.consent={id:'expiry',user:'11111111-1111-4111-8111-111111111111',decide:value=>{decisions.push(value);return true;}};
    f.update();f.clock.advance(21000);assert.equal(f.power.at(-1),true);
    f.state.consent=null;f.update();assert.deepEqual(decisions,[]);
    assert.equal(f.power.at(-1),pinned);f.input.remove();assert.equal(f.clock.timers.size,0);
  }
});

test('a touch while gripping the side button cannot reject or accept consent before release', () => {
  const f=fixture(), decisions=[];
  f.state.consent={id:'grip',user:'11111111-1111-4111-8111-111111111111',decide:value=>{decisions.push(value);f.state.consent=null;return true;}};
  f.update();f.clock.advance(1000);f.input.btn();f.clock.advance(600);
  f.input.touch(1,{x:130,y:157});f.input.touch(1,{x:40,y:157});
  assert.deepEqual(decisions,[]);assert.ok(f.state.consent);assert.equal(f.power.at(-1),true);
  f.input.btnRelease();f.clock.advance(399);f.input.touch(1,{x:130,y:157});assert.deepEqual(decisions,[]);
  f.clock.advance(1);f.input.touch(1,{x:40,y:157});assert.deepEqual(decisions,[true]);f.input.remove();
});

test('consent diagnostic trace is bounded, excludes identity and distinguishes button and cancellation', () => {
  const f=fixture();
  f.state.consent={id:'private-request',user:'11111111-1111-4111-8111-111111111111',decide:()=>true};
  f.update();
  for(let i=0;i<20;i++){f.input.btn();f.input.btnRelease();}
  assert.equal(f.consentTrace().length,16);
  assert.equal(f.consentTrace().at(-1).event,'button-up');
  f.state.consent=null;f.update();
  assert.equal(f.consentTrace().at(-1).event,'cancelled');
  assert.ok(!JSON.stringify(f.consentTrace()).includes('private-request'));
  assert.ok(!JSON.stringify(f.consentTrace()).includes('11111111'));
  f.input.remove();assert.equal(f.clock.timers.size,0);
});

test('boot replaces the loader with a working face then returns to standby and accepts button wake', () => {
  const f=fixture('still',80,true);
  assert.equal(f.state.running,true);assert.equal(f.power.at(-1),true);
  assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='72'));
  f.clock.advance(10000);assert.equal(f.power.at(-1),false);
  const count=f.graphics.commands.length;f.clock.advance(60000);assert.equal(f.graphics.commands.length,count);
  f.input.btn();f.clock.advance(50);f.input.btnRelease();f.clock.advance(401);
  assert.equal(f.power.at(-1),true);f.input.remove();assert.equal(f.clock.timers.size,0);
});

test('boot readiness cannot replace a pending physical consent with the ordinary clock', () => {
  const f=fixture('still',80,{consent:{id:'boot-consent',user:'11111111-1111-4111-8111-111111111111',decide:()=>{throw Error('No automatic consent');}}});
  f.clock.advance(21000);
  assert.equal(f.power.at(-1),true);assert.ok(f.state.consent);
  assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Consentire'));
  f.input.btn();f.input.btnRelease();
  assert.equal(f.power.at(-1),true);f.input.remove();assert.equal(f.clock.timers.size,0);
});

test('expired consent clears its LCD image and explains termination on the next wake', () => {
  const f=fixture('still'),decisions=[];
  f.state.consent={id:'expires',user:'11111111-1111-4111-8111-111111111111',decide:v=>decisions.push(v)};
  f.update();f.clock.advance(60000);f.state.consent=null;f.update();
  assert.equal(f.power.at(-1),false);
  assert.deepEqual(f.graphics.commands.map(c=>c.type),['clear']);
  f.input.btn();f.input.btnRelease();f.clock.advance(401);
  assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='terminata'));
  assert.ok(!f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Consentire'));
  assert.deepEqual(decisions,[]);
  f.input.touch(1,{x:88,y:160});f.clock.advance(11000);
  f.input.btn();f.input.btnRelease();f.clock.advance(401);
  assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='bpm'));f.input.remove();
});

test('external LCD power loss cannot hide a still valid consent or answer on wake', () => {
  const f=fixture(),decisions=[];
  f.state.consent={id:'lcd',user:'11111111-1111-4111-8111-111111111111',decide:v=>{decisions.push(v);f.state.consent=null;return true;}};
  f.update();f.listeners.get('lcdPower')(false);
  assert.equal(f.power.at(-1),true);assert.equal(f.backlight.at(-1),true);
  f.input.btn();f.input.btnRelease();assert.deepEqual(decisions,[]);
  assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Consentire'));
  f.clock.advance(400);f.input.touch(1,{x:40,y:157});assert.deepEqual(decisions,[true]);
  f.input.btn();f.input.btnRelease();f.clock.advance(401);
  assert.ok(!f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='terminata'));f.input.remove();
});


test('Nielsen: large scrolling destinations have gaps and predictable back',()=>{
  const destinations=['Attiva','Da trasferire','Collegato','Sistema'];
  for(let i=0;i<4;i++){
    const f=fixture();f.input.btnRelease();f.clock.advance(401);f.input.swipe(0,1);
    for(const point of [{x:2,y:60},{x:88,y:89},{x:88,y:146}]){
      f.clock.advance(301);f.input.touch(1,point);
      assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Menu'));
    }
    if(i>=2){f.input.swipe(0,-1);f.input.swipe(0,-1);}
    assert.ok(!f.graphics.commands.some(c=>c.type==='text'&&/^[12] \/ 2$/.test(c.args[0])));
    assert.equal(f.graphics.commands.filter(c=>c.type==='drawRect'&&c.args[2]-c.args[0]===160&&c.args[3]-c.args[1]===50).length,2);
    f.clock.advance(301);f.input.touch(1,{x:88,y:60+(i%2)*58});
    assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]===destinations[i]));
    f.clock.advance(301);f.input.touch(1,{x:20,y:16});
    assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Menu'));
    assert.deepEqual(f.radio,[]);f.input.remove();assert.equal(f.clock.timers.size,0);
  }
});
test('Nielsen: preparation pause is visible and never misrepresented as active acquisition',()=>{
  const f=fixture('still',80,{maintenancePaused:true});
  f.input.btnRelease();f.clock.advance(401);f.input.touch(1,{x:88,y:155});
  const labels=f.graphics.commands.filter(c=>c.type==='text').map(c=>c.args[0]);
  assert.ok(labels.includes('In pausa'));assert.ok(labels.includes('Dati conservati'));
  assert.ok(!labels.includes('Attiva'));assert.equal(f.state.maintenancePaused,true);
  f.input.remove();
});
test('Nielsen: cancelling BLE suspension keeps transport and recording unchanged',()=>{
  const f=fixture();f.input.btnRelease();f.clock.advance(401);f.input.swipe(-1);
  f.input.touch(1,{x:88,y:138});assert.deepEqual(f.radio,[]);
  f.clock.advance(301);f.input.touch(1,{x:88,y:155});
  assert.deepEqual(f.radio,[]);assert.equal(f.state.running,true);assert.equal(f.state.bleEnabled,undefined);
  assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Scollega'));
  f.input.remove();
});


test('interaction renews idle but inactivity sleeps and wake preserves page and history',()=>{
  const f=fixture(),has=t=>f.graphics.commands.some(c=>c.type==='text'&&c.args[0]===t);
  f.input.btnRelease();f.clock.advance(401);f.input.swipe(0,1);
  for(let i=0;i<4;i++){
    f.clock.advance(9000);f.input.swipe(0,-1);
    assert.equal(f.power.at(-1),true);assert.ok(has('Menu'));
  }
  assert.ok(has('Bluetooth'));assert.ok(has('Sistema'));assert.ok(!has('Raccolta'));
  f.clock.advance(10000);assert.equal(f.power.at(-1),false);
  f.input.btnRelease();f.clock.advance(401);assert.ok(has('Sistema'));assert.ok(has('Menu'));
  f.input.touch(1,{x:88,y:60});assert.ok(has('Bluetooth'));
  f.clock.advance(9000);f.input.touch(1,{x:170,y:100});
  f.clock.advance(9000);assert.equal(f.power.at(-1),true);
  f.clock.advance(1000);assert.equal(f.power.at(-1),false);
  f.input.btnRelease();f.clock.advance(401);assert.ok(has('Bluetooth'));assert.ok(!has('Menu'));
  f.input.touch(1,{x:20,y:16});assert.ok(has('Menu'));assert.ok(has('Sistema'));
  f.input.swipe(0,1);assert.ok(has('Memoria'));f.input.swipe(0,1);assert.ok(has('Raccolta'));
  f.input.remove();assert.equal(f.clock.timers.size,0);
});


test('administrative erase view includes pending records but cannot destroy data or store a PIN',()=>{
  const f=fixture(), original=JSON.stringify(f.stats);
  const has=t=>f.graphics.commands.some(c=>c.type==='text'&&c.args[0]===t);
  f.input.btnRelease();f.clock.advance(401);f.input.swipe(0,1);
  f.input.touch(1,{x:88,y:118}); // memory
  f.clock.advance(301);f.input.touch(1,{x:88,y:156});
  assert.ok(has('Tutti i campioni'));assert.ok(has('123 non trasferiti'));
  assert.ok(has('Solo amministratore'));assert.ok(has('Da abilitare via Vera'));
  for(let i=0;i<6;i++){f.clock.advance(301);f.input.touch(1,{x:88,y:156});}
  assert.equal(JSON.stringify(f.stats),original);assert.deepEqual(f.radio,[]);
  assert.equal(f.state.running,true);f.input.remove();assert.equal(f.clock.timers.size,0);
});

test('system destinations scroll without pagination and expose honest time and software states',()=>{
  const f=fixture(),has=t=>f.graphics.commands.some(c=>c.type==='text'&&c.args[0]===t);
  f.input.btnRelease();f.clock.advance(401);f.input.swipe(0,1);
  f.input.swipe(0,-1);f.input.swipe(0,-1);f.input.touch(1,{x:88,y:118});
  f.input.swipe(0,-1);f.input.swipe(0,-1);
  f.clock.advance(301);f.input.touch(1,{x:88,y:60});assert.ok(has('Ora e data'));
  assert.ok(has('da Vera App'));assert.ok(has('Date originali conservate'));
  f.clock.advance(301);f.input.touch(1,{x:16,y:16});
  f.clock.advance(301);f.input.touch(1,{x:88,y:118});assert.ok(has('Versione: vedi app'));
  assert.ok(!has('Aggiornato'));f.input.remove();
});


test('face shortcuts open effects, collection and actual charging details without changing collection',()=>{
 const f=fixture(),has=t=>f.graphics.commands.some(c=>c.type==='text'&&c.args[0]===t);
 f.input.btnRelease();f.clock.advance(401);
 f.input.touch(1,{x:88,y:70});assert.ok(has('Effetti'));
 f.clock.advance(301);f.input.touch(1,{x:16,y:16});
 f.clock.advance(301);f.input.touch(1,{x:150,y:13});assert.ok(has('Batteria'));assert.ok(has('Non in carica'));
 f.charging(true);assert.ok(has('In ricarica'));
 f.clock.advance(301);f.input.touch(1,{x:16,y:16});
 f.clock.advance(301);f.input.touch(1,{x:88,y:132});assert.ok(has('Raccolta'));
 assert.equal(f.state.running,true);assert.deepEqual(f.radio,[]);f.input.remove();
});


test('long critical status and unverified dates fit the display and icon text region',()=>{
 const f=fixture('still'),texts=()=>f.graphics.commands.filter(c=>c.type==='text');
 f.state.paused=true;f.stats.full=true;
 f.input.btnRelease();f.clock.advance(401);f.input.touch(1,{x:88,y:132});
 const title=texts().find(c=>c.args[0]==='Da verificare');
 assert.ok(title.size*0.55*title.args[0].length<=112);
 f.input.remove();
});

test('software page shows runtime version and never fabricates a newer installed version',()=>{
 const f=fixture('still',80,{v:'0.2.0'});
 const tap=(x,y)=>{f.clock.advance(301);f.input.touch(1,{x,y});};
 f.input.swipe(0,1);f.input.swipe(0,-1);f.input.swipe(0,-1);tap(88,118);
 f.input.swipe(0,-1);f.input.swipe(0,-1);tap(88,118);
 assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Versione 0.2.0'));
 f.input.remove();
});


test('pinned pulse stops its repaint interval on stale data and resumes with fresh acquisition',()=>{
 const f=fixture('pulse');f.input.btnRelease();f.clock.advance(401);f.clock.advance(1000);
 f.input.btnRelease();f.clock.advance(100);f.input.btnRelease();
 assert.ok(f.graphics.commands.some(c=>c.type==='text'&&c.args[0]==='Fisso'));
 f.clock.advance(46000);assert.equal(f.power.at(-1),true);
 assert.ok(![...f.clock.timers.values()].some(t=>t.ms===250));
 const count=f.graphics.commands.length;f.clock.advance(1000);assert.equal(f.graphics.commands.length,count);
 f.state.values.battito.at=f.clock.now();f.update();
 assert.ok([...f.clock.timers.values()].some(t=>t.ms===250));
 f.clock.advance(250);assert.ok(f.graphics.commands.length>count);
 f.input.remove();assert.equal(f.clock.timers.size,0);
});
