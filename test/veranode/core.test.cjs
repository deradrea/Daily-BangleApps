const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../apps/veranode/core.js');
const runtime = require('../../apps/veranode/runtime.js');
const {MemoryStorage, Clock, platform, policy} = require('./helpers.cjs');

test('sequential transfer reads each record once, preserves bytes and supports retry and reboot', () => {
  const store = new MemoryStorage(), journal = new core.Journal(store, 's');
  for (let i=0;i<256;i++) journal.append('sample',i,{value:72});
  const before=[...store.files.entries()];
  let reads=0;const open=store.open.bind(store);
  store.open=(name,mode)=>{const f=open(name,mode),read=f.readLine;f.readLine=()=>{reads++;return read();};return f;};
  for(let after=0;after<256;after+=4) {
    const rows=journal.readBatch(after,4);
    assert.deepEqual(rows.map(r=>r.seq),[after+1,after+2,after+3,after+4]);
  }
  assert.equal(reads,256); // Previous reopening required 1152 record reads.
  assert.deepEqual([...store.files.entries()],before);
  assert.deepEqual(journal.readBatch(248,4).map(r=>r.seq),[249,250,251,252]);
  const rebooted=new core.Journal(store,'s');
  assert.equal(rebooted.reader,null);
  assert.equal(rebooted.readBatch(252,4)[0].seq,253);
});

test('reader invalidates on append, erased segment and read error; CRC still rejects corruption', () => {
  const store=new MemoryStorage(), journal=new core.Journal(store,'s',{segmentRecords:4});
  journal.append('sample',1,{value:72});journal.readBatch(0,1);
  journal.append('sample',2,{value:73});assert.equal(journal.reader,null);
  assert.equal(journal.readBatch(1,1)[0].seq,2);
  journal.append('sample',3,{value:74});journal.append('sample',4,{value:75});
  journal.readBatch(2,1);journal.reader.file.readLine=()=>{throw Error('read failed');};
  assert.throws(()=>journal.readBatch(3,1));assert.equal(journal.reader,null);
  // Corrupt the intended record body, never a coincidental digit in another
  // row's random epoch or CRC. Preserve the original checksum deliberately.
  store.files.set('s0',store.files.get('s0').split('\n').map(line=>{
    if(!line)return line;
    const envelope=JSON.parse(line);
    if(JSON.parse(envelope.body).seq===4) envelope.body=envelope.body.replace('"value":75','"value":76');
    return JSON.stringify(envelope);
  }).join('\n'));
  assert.deepEqual(journal.readBatch(3,1),[]);
  journal.ack(journal.checkpoint.epoch,3);assert.ok(journal.reader);
  journal.ack(journal.checkpoint.epoch,4);assert.equal(journal.reader,null);
});

test('policy and consent validation work without Number.isInteger on the watch', () => {
  const fs = require('node:fs'), vm = require('node:vm'), sandbox = {exports: {}, Number: {}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../apps/veranode/core.js'), 'utf8'), sandbox);
  const deviceCore = sandbox.exports, data = policy();
  assert.doesNotThrow(() => deviceCore.validatePolicy(data, data.mac));
  const presentation = {mode: 'question', question: 'Consentire Vera App?', light: false,
    sound: false, vibration: false, dismiss: 'either', repeats: 1, pulseMs: 150};
  assert.equal(deviceCore.validatePresentation(presentation).repeats, 1);
  for (const repeats of [1.5, NaN, Infinity, '1', 0, 4]) {
    assert.throws(() => deviceCore.validatePresentation({...presentation, repeats}));
  }
});

test('Espruino-compatible policy UUID validation keeps strict v4 shape and rule ID limits', () => {
  const good = policy();
  assert.doesNotThrow(() => core.validatePolicy(good, good.mac));
  for (const user of ['1111111-11111-4111-8111-111111111111',
    '11111111-1111-3111-8111-111111111111',
    '11111111-1111-4111-7111-111111111111',
    '11111111-1111-4111-8111-11111111111g']) {
    assert.throws(() => core.validatePolicy({...policy(), user}, good.mac));
  }
  for (const id of ['', 'x'.repeat(33), 'has.dot']) {
    const data = policy(); data.rules[0].id = id;
    assert.throws(() => core.validatePolicy(data, good.mac));
  }
});

test('single press wakes temporarily; double press pins; next press powers off', () => {
  const c = new Clock(), powers = [], displays = [];
  const ui = new core.DisplayState(c, s => displays.push(s.mode), on => powers.push(on));
  assert.equal(ui.mode, 'off');
  ui.press(); c.advance(401); assert.equal(ui.mode, 'temporary');
  c.advance(10000); assert.equal(ui.mode, 'off');
  ui.press(); c.advance(180); ui.press(); assert.equal(ui.mode, 'off');
  c.advance(500); assert.equal(ui.mode, 'off');
  ui.press(); c.advance(401);
  ui.press(); c.advance(180); ui.press(); assert.equal(ui.mode, 'pinned');
  c.advance(120000); assert.equal(ui.mode, 'pinned');
  ui.press(); assert.equal(ui.mode, 'off');
  assert.equal(powers.at(-1), false); ui.dispose(); assert.equal(c.timers.size, 0);
});
test('alert wakes screen; timeout/hardware dismissal never acknowledges it', () => {
  const c = new Clock(), ui = new core.DisplayState(c, () => {}, () => {});
  const first = {id: 'one'};
  ui.presentAlert(first); assert.equal(ui.mode, 'alert');
  assert.equal(ui.presentAlert({id: 'two'}), false);
  c.advance(20000); assert.equal(ui.mode, 'off'); assert.equal(ui.alert, first);
  ui.press(); c.advance(401); assert.equal(ui.mode, 'alert');
  ui.closeAlert(); assert.equal(ui.alert, null); ui.dispose();
});
test('journal survives reset, seals a torn tail and retains samples without ACK', () => {
  const store = new MemoryStorage();
  let journal = new core.Journal(store, 's', {maxSegments: 3, segmentRecords: 2});
  journal.append('sample', 10, {bpm: 70});
  store.open('s0', 'a').write('{torn');
  journal = new core.Journal(store, 's', {maxSegments: 3, segmentRecords: 2});
  journal.append('sample', 20, {bpm: 71});
  assert.deepEqual(journal.readBatch(0).map(r => r.seq), [1,2]);
  assert.equal(store.files.get('s0').endsWith('{torn'), true);
  assert.equal(journal.pending(), 2);
});
test('full journal does not overwrite; ACK validates epoch and persisted custody', () => {
  const store = new MemoryStorage();
  let journal = new core.Journal(store, 's', {maxSegments: 2, segmentRecords: 1});
  journal.append('sample', 10, 1); journal.append('sample', 20, 2);
  assert.equal(journal.append('sample', 30, 3), undefined);
  assert.deepEqual(journal.readBatch(0).map(r => r.data), [1,2]);
  assert.throws(() => journal.ack('wrong-device', 2));
  assert.throws(() => journal.ack(journal.checkpoint.epoch, 3));
  store.fail = true;
  assert.throws(() => journal.ack(journal.checkpoint.epoch, 2));
  assert.equal(store.files.size, 2); store.fail = false;
  journal.ack(journal.checkpoint.epoch, 2); assert.equal(store.files.size, 0);
  journal = new core.Journal(store, 's', {maxSegments: 2, segmentRecords: 1});
  assert.equal(journal.append('sample', 40, 3).seq, 3);
});
test('boot recovers all 256 samples from a full journal without changing stored bytes', () => {
  const store = new MemoryStorage(), options = {maxSegments:8,segmentRecords:32};
  let journal = new core.Journal(store,'s',options);
  for(let i=0;i<256;i++) journal.append('sample',i*30000,{values:{battito:{value:72,quality:99,at:i*30000},temperatura:{value:27.6,at:i*30000}},scope:'unprovisioned'});
  const before=[...store.files.entries()];
  journal=new core.Journal(store,'s',options);
  assert.equal(journal.pending(),256);
  let recovered=0;
  while(recovered<256) {
    const rows=journal.readBatch(recovered,16);
    assert.equal(rows.length,16);recovered=rows.at(-1).seq;
  }
  assert.equal(recovered,256);
  assert.equal(journal.append('sample',256*30000,{}),undefined);
  assert.deepEqual([...store.files.entries()],before);
});

test('sealed segment cache verifies content and falls back for corruption or missing index', () => {
  const store=new MemoryStorage();
  const segmentHash=name=>{const raw=store.files.get(name);return {hash:require('node:crypto').createHash('sha256').update(raw).digest('hex'),bytes:raw.length};};
  const options={maxSegments:2,segmentRecords:2,segmentHash};
  let journal=new core.Journal(store,'s',options);
  for(let i=0;i<4;i++) journal.append('sample',i,{bpm:72});
  const files=[...store.files.entries()];
  let lines=0;const open=store.open.bind(store);
  store.open=(name,mode)=>{const file=open(name,mode),read=file.readLine;file.readLine=()=>{lines++;return read();};return file;};
  journal=new core.Journal(store,'s',options);
  assert.equal(journal.pending(),4);assert.equal(lines,0);assert.deepEqual([...store.files.entries()],files);
  store.normal.delete('s0idx');journal=new core.Journal(store,'s',options);assert.ok(lines>0);
  lines=0;store.files.set('s1',store.files.get('s1').replace('72','73'));
  journal=new core.Journal(store,'s',options);assert.ok(lines>0);
  assert.equal(journal.readBatch(0,16).length,3); // Damaged record was not trusted via the old cache.
  store.normal.set('s0idx','{torn');lines=0;
  journal=new core.Journal(store,'s',options);assert.ok(lines>0);
  store.normal.delete('s0idx');store.fail=true;
  journal=new core.Journal(store,'s',options);
  assert.equal(journal.readBatch(0,16).length,3); // Cache write failure cannot hide data.
});

test('rules require fresh distinct samples, duration, quality and hysteresis', () => {
  const p = policy(), output = [], engine = new core.RuleEngine(p, e => output.push(e));
  const evaluate = (at, value, quality = 100) => engine.evaluate({battito: {at, value, quality}}, at);
  evaluate(1000, 110); engine.evaluate({battito: {at: 1000, value: 110, quality: 100}}, 4000);
  assert.equal(output.length, 0);
  evaluate(2000, 110); evaluate(3000, 110); assert.equal(output.length, 1);
  evaluate(4000, 95); assert.equal(output.length, 1);
  evaluate(5000, 89); assert.equal(output[1].type, 'returned');
  evaluate(6000, 110, 10); evaluate(7000, 110); evaluate(10000, 110);
  assert.equal(output.length, 2);
});
test('policy rejects another MAC, arbitrary rules and incorrectly sourced temperature', () => {
  assert.throws(() => core.validatePolicy(policy('other'), 'AA:BB:CC:DD:EE:02'));
  const p = policy(); p.rules[0].metric = 'temperatura';
  assert.throws(() => core.validatePolicy(p, p.mac));
  p.rules[0].source = 'barometer'; assert.equal(core.validatePolicy(p, p.mac).rules[0].source, 'barometer');
});
test('live BLE stays compatible; stale heart clears and temperature is not fabricated', () => {
  const frames = core.frames({battito: {value: 72, at: 1000}, temperatura: {value: -2.3, at: 1000},
    accelerometro: {value: {x: 0.1, y: -0.2, z: 1}, at: 1000}}, 1000);
  assert.deepEqual(frames['2a37'], [0,72]); assert.deepEqual(frames['2a1f'], [233,255]);
  assert.deepEqual(frames['e95d0753-251d-470a-a062-fa1922dfa9a8'], [100,0,56,255,232,3]);
  assert.deepEqual(core.frames({}, 1000), {'2a37': [0,0]});
  assert.deepEqual(core.frames({battito: {value: 72, at: 1000}}, 47000), {'2a37': [0,0]});
});
test('online acquisition continues after disconnect and stores offline data', async () => {
  const p = platform(core), node = runtime.create(p.env); node.start();
  await Promise.resolve();
  p.bus.emit('HRM', {bpm: 72, confidence: 90});
  p.bus.emit('connect'); assert.ok(p.sent.length);
  p.bus.emit('disconnect'); const before = p.sent.length;
  p.clock.advance(30000); await Promise.resolve();
  assert.equal(p.sent.length, before); assert.ok(node.samples.pending() >= 2);
  assert.equal(node.samples.readBatch(0).at(-1).data.values.battito.value, 72);
  assert.equal(node.state.running, true); assert.equal(p.power.at(-1), true);
  node.dispose(); assert.equal(p.power.at(-1), false);
});
test('offline local alert responds durably only to the current touch target', () => {
  const p = platform(core), node = runtime.create(p.env); node.start();
  assert.throws(() => node.installPolicy(policy(), false));
  node.installPolicy(policy(), true);
  [110,111,112].forEach(bpm => { p.bus.emit('HRM', {bpm, confidence: 90}); p.clock.advance(1000); });
  assert.equal(node.state.queue.length, 1); const alert = node.state.queue[0];
  assert.equal(node.respond('wrong'), false); assert.equal(node.state.queue.length, 1);
  p.storage.fail = true; assert.equal(node.respond(alert.id), false); assert.equal(node.state.queue.length, 1);
  p.storage.fail = false; assert.equal(node.respond(alert.id), true); assert.equal(node.state.queue.length, 0);
  assert.equal(node.events.readBatch(0).at(-1).kind, 'response'); node.dispose();
});
test('storage full is explicit while acquisition and rule evaluation remain alive', () => {
  const p = platform(core), node = runtime.create(p.env); node.start();
  p.storage.getFree = () => 100;
  p.clock.advance(30000);
  assert.equal(node.state.paused, true); assert.equal(node.state.storageError, 'Spazio insufficiente');
  assert.equal(node.state.running, true); node.dispose();
});
test('pending alerts and active rules survive reboot without reopening the same condition', () => {
  const p = platform(core); let node = runtime.create(p.env); node.start();
  node.installPolicy(policy(), true);
  [110,111,112].forEach(bpm => { p.bus.emit('HRM', {bpm, confidence: 90}); p.clock.advance(1000); });
  const id = node.state.queue[0].id, buzzes = p.buzz.length;
  node.dispose(); node = runtime.create(p.env); node.start();
  assert.equal(node.state.queue[0].id, id);
  p.bus.emit('HRM', {bpm: 113, confidence: 90});
  assert.equal(p.buzz.length, buzzes); assert.equal(node.state.queue.length, 1);
  assert.equal(node.respond(id), true);
  node.dispose(); node = runtime.create(p.env); node.start();
  assert.equal(node.state.queue.length, 0); node.dispose();
});
test('a torn latest alert checkpoint is recovered from the durable event journal', () => {
  const p = platform(core); let node = runtime.create(p.env); node.start();
  node.installPolicy(policy(), true);
  [110,111,112].forEach(bpm => { p.bus.emit('HRM', {bpm, confidence: 90}); p.clock.advance(1000); });
  const id = node.state.queue[0].id;
  p.storage.normal.set('veranode.al1', '{torn');
  node.dispose(); node = runtime.create(p.env);
  assert.equal(node.state.queue[0].id, id); node.dispose();
});
test('reserved IDs, another user, expired and older profiles cannot be silently installed', () => {
  const p = platform(core), node = runtime.create(p.env), data = policy();
  data.rules[0].id = '__proto__'; assert.throws(() => core.validatePolicy(data, data.mac));
  node.installPolicy(policy(), true); assert.throws(() => node.installPolicy(policy(), true));
  const other = policy(); other.revision = 2; other.user = '22222222-2222-4222-8222-222222222222';
  assert.throws(() => node.installPolicy(other, true));
  other.user = policy().user; other.expiresAt = 1;
  assert.throws(() => node.installPolicy(other, true)); node.dispose();
});
test('storage failure cannot silence a detected condition or fake its persisted response', () => {
  const p = platform(core), node = runtime.create(p.env); node.start(); node.installPolicy(policy(), true);
  p.storage.fail = true;
  [110,111,112].forEach(bpm => { p.bus.emit('HRM', {bpm, confidence: 90}); p.clock.advance(1000); });
  assert.equal(node.state.queue.length, 1); assert.equal(node.state.queue[0].persisted, false);
  assert.equal(node.state.queue[0].persisted, false); assert.equal(node.respond(node.state.queue[0].id), false); node.dispose();
});
test('a missing temperature sensor and corrupt interval cannot stop heart acquisition', () => {
  const p = platform(core);
  p.storage.write('veranode.config.json', JSON.stringify({recordMs: 'invalid'}));
  p.env.pressure = () => { throw Error('missing barometer'); };
  p.env.accel = () => { throw Error('missing accel'); };
  const node = runtime.create(p.env); node.start();
  p.bus.emit('HRM', {bpm: 72, confidence: 90}); p.clock.advance(30000);
  assert.equal(node.samples.pending(), 2);
  assert.equal(node.state.values.battito.value, 72); assert.equal(node.state.values.temperatura, undefined);
  node.dispose(); assert.equal(p.clock.timers.size, 0);
});
test('a new rule revision does not inherit the old active condition after reboot', () => {
  const p = platform(core); let node = runtime.create(p.env); node.start(); node.installPolicy(policy(), true);
  [110,111,112].forEach(bpm => { p.bus.emit('HRM', {bpm, confidence: 90}); p.clock.advance(1000); });
  const updated = policy(); updated.revision = 2; node.installPolicy(updated, true);
  node.dispose(); node = runtime.create(p.env); node.start();
  [110,111,112].forEach(bpm => { p.bus.emit('HRM', {bpm, confidence: 90}); p.clock.advance(1000); });
  assert.deepEqual(node.state.queue.map(a => a.revision), [1,2]); node.dispose();
});

test('optimized CRC retains byte-for-byte compatibility with all prior journal records', () => {
 for (const value of [{x:42}, {text:'Temperatura °C, sì'}, {text:'😀'}, {text:'x'.repeat(1500)}]) {
  const body=JSON.stringify(value); let crc=65535;
  for(let i=0;i<body.length;i++){crc^=body.charCodeAt(i);for(let j=0;j<8;j++)crc=(crc&1)?(crc>>>1)^40961:crc>>>1;}
  assert.equal(core.pack(value),JSON.stringify({body,crc}));
  assert.deepEqual(core.unpack(JSON.stringify({body,crc})),value);
 }
});

test('rapid click bursts are consumed as one gesture and recover after quiet', () => {
  const c = new Clock(), ui = new core.DisplayState(c, () => {}, () => {});
  for (let i=0;i<9;i++) {ui.press(); c.advance(90);}
  c.advance(500); assert.equal(ui.mode, 'off');
  ui.press(); c.advance(401); assert.equal(ui.mode, 'temporary');
  for (let i=0;i<9;i++) {ui.press(); c.advance(90);}
  c.advance(500); assert.equal(ui.mode, 'pinned');
  for (let i=0;i<9;i++) {ui.press(); c.advance(90);}
  c.advance(500); assert.equal(ui.mode, 'off');
  ui.press(); c.advance(401); assert.equal(ui.mode, 'temporary');
  ui.dispose(); assert.equal(c.timers.size, 0);
});
test('an incoming alert cancels a pending wake gesture', () => {
  const c = new Clock(), ui = new core.DisplayState(c, () => {}, () => {});
  ui.press(); ui.presentAlert({id:'one'}); ui.closeAlert();
  c.advance(500); assert.equal(ui.mode, 'off'); ui.dispose();
});

test('on-screen double click has wider window and pins without cycling LCD power', () => {
  const c=new Clock(), powers=[], ui=new core.DisplayState(c,()=>{},on=>powers.push(on),{doubleMs:400,doubleOnMs:700});
  ui.press();c.advance(401);const count=powers.length;
  ui.press();c.advance(550);ui.press();assert.equal(ui.mode,'pinned');assert.equal(powers.length,count);
  c.advance(15000);assert.equal(ui.mode,'pinned');ui.press();assert.equal(ui.mode,'off');ui.dispose();
});

test('append capacity accounts for partial acknowledgements, sealed segments and reboot without writes',()=>{
 const storage=new MemoryStorage(), journal=new core.Journal(storage,'s',{maxSegments:2,segmentRecords:4});
 for(let i=0;i<3;i++) journal.append('sample',i,{});
 const before=[...storage.files.entries()];
 assert.deepEqual(journal.stats(),{capacity:8,stored:3,pending:3,available:5,full:false});
 assert.deepEqual([...storage.files.entries()],before);
 journal.ack(journal.checkpoint.epoch,3);
 assert.deepEqual(journal.stats(),{capacity:8,stored:3,pending:0,available:5,full:false});
 journal.append('sample',4,{});journal.ack(journal.checkpoint.epoch,4);
 assert.deepEqual(journal.stats(),{capacity:8,stored:0,pending:0,available:8,full:false});
 const reboot=new core.Journal(storage,'s',{maxSegments:2,segmentRecords:4});
 assert.deepEqual(reboot.stats(),journal.stats());
 for(let i=0;i<8;i++) reboot.append('sample',i,{});
 assert.equal(reboot.stats().full,true);assert.equal(reboot.stats().available,0);
});


test('startup indexes each inventory once instead of repeated linear filename searches',()=>{
 const store=new MemoryStorage(), original=new core.Journal(store,'s',{maxSegments:92,segmentRecords:1});
 for(let i=0;i<92;i++) original.append('sample',i,{bpm:72});
 const files=store.list(undefined,{sf:true});
 files.includes=()=>{throw Error('Repeated linear inventory search');};
 const recovered=new core.Journal(store,'s',{maxSegments:8,segmentRecords:1,files});
 assert.equal(recovered.pending(),92);assert.equal(recovered.segments.length,92);
 assert.deepEqual(recovered.readBatch(88,4).map(r=>r.seq),[89,90,91,92]);
});

test('duplicate custody ACK avoids flash writes and retries pruning after interrupted erase',()=>{
 const store=new MemoryStorage(), journal=new core.Journal(store,'s',{maxSegments:2,segmentRecords:1});
 journal.append('sample',10,{});journal.append('sample',20,{});
 let writes=0,failOnce=true;const write=store.write.bind(store),open=store.open.bind(store);
 store.write=(...args)=>{writes++;return write(...args);};
 store.open=(...args)=>{const file=open(...args),erase=file.erase;file.erase=()=>{if(failOnce){failOnce=false;throw Error('Interrupted erase');}erase();};return file;};
 assert.throws(()=>journal.ack(journal.checkpoint.epoch,2),/Interrupted erase/);
 assert.equal(writes,1);assert.equal(journal.checkpoint.ack,2);
 journal.ack(journal.checkpoint.epoch,2);assert.equal(store.files.size,0);
 for(let i=0;i<20;i++)journal.ack(journal.checkpoint.epoch,2);
 assert.equal(writes,1);assert.equal(journal.pending(),0);
 const reboot=new core.Journal(store,'s',{maxSegments:2,segmentRecords:1});
 assert.equal(reboot.append('sample',30,{}).seq,3);
});
