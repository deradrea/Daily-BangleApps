const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../apps/veranode/core.js');
const runtime = require('../../apps/veranode/runtime.js');
const wire = require('../../apps/veranode/wire.js');
const {platform, policy, Clock} = require('./helpers.cjs');
function setup(failConsent = false, describe, chunkSize) {
  const p = platform(core), node = runtime.create(p.env), output = [];
  let consent, encrypted = true;
  const server = wire.create({node, describe, chunkSize, mac: p.env.mac, clock: p.clock,
    send: text => output.push(text), encrypted: () => encrypted, consent: value => {
      consent = value;
      if (value && failConsent) throw new Error('private context must not appear in reply');
    }});
  function command(value) {
    const bytes = [...Buffer.from(JSON.stringify(value) + '\n')];
    for (let i = 0; i < bytes.length; i += 20) server.receive(bytes.slice(i, i + 20));
  }
  function responses() { p.clock.advance(10000); const result = output.join('').trim().split('\n').filter(Boolean).map(JSON.parse); output.length = 0; return result; }
  return {p, node, server, command, responses, output, consent: () => consent, secure: value => {encrypted = value;}};
}

test('consent UI failure returns a generic error, clears pending consent and stays unauthorized', () => {
  const f = setup(true), data = policy();
  f.command({id: 'auth', op: 'authorize', user: data.user, scope: data.scope, mac: data.mac});
  assert.equal(f.responses()[0].error, 'Errore interno gestione');
  assert.equal(f.consent(), null);
  assert.equal(f.node.state.management.parseErrors, 0);
  f.command({id: 'read', op: 'status'});
  assert.equal(f.responses()[0].ok, false);
  assert.equal(f.server.decide(true), false);
});

test('a visible unanswered consent expires at 60 seconds and a late Yes cannot authorize', () => {
  const f=setup(), data=policy();
  f.command({id:'timed-auth',op:'authorize',user:data.user,scope:data.scope,mac:data.mac});
  f.p.clock.advance(59999);assert.ok(f.consent());
  f.p.clock.advance(1);assert.equal(f.consent(),null);
  assert.equal(f.server.decide(true),false);
  f.command({id:'late-status',op:'status'});
  const replies=f.responses();
  assert.equal(replies.find(r=>r.id==='timed-auth').ok,false);
  assert.equal(replies.find(r=>r.id==='late-status').ok,false);
  f.server.dispose();f.node.dispose();
});

test('mobile UUID request IDs work and invalid identifier lengths remain rejected', () => {
  const f = setup(), data = policy(), id = '12345678-1234-4234-8234-123456789012';
  for (const bad of ['', 'x'.repeat(41), 'bad.id']) f.command({id: bad, op: 'status'});
  assert.deepEqual(f.responses(), []);
  f.command({id, op: 'authorize', user: data.user, scope: data.scope, mac: data.mac});
  assert.ok(f.consent());
  f.server.decide(true);
  assert.equal(f.responses()[0].id, id);
  assert.equal(f.node.state.management.authorizations, 1);
});

test('watch validators avoid bounded regex repetitions unsupported on Espruino', () => {
  const fs = require('node:fs');
  for (const name of ['wire', 'core']) {
    const source = fs.readFileSync(require.resolve('../../apps/veranode/' + name + '.js'), 'utf8');
    // Parse literals so comments and ordinary source blocks are not mistaken for regex.
    const acorn = require('acorn');
    const tokens = [...acorn.tokenizer(source, {ecmaVersion: 2020})];
    for (const token of tokens.filter(t => t.type.label === 'regexp')) {
      assert.doesNotMatch(token.value.pattern, /\{\d+(?:,\d*)?\}/, name);
    }
  }
});
test('encrypted transport plus physical consent precedes profile/read/ACK operations', () => {
  const f = setup(), data = policy();
  f.command({id: 'a', op: 'status'}); assert.equal(f.responses()[0].ok, false);
  f.secure(false); f.command({id: 'b', op: 'authorize', user: data.user, scope: data.scope, mac: data.mac});
  assert.equal(f.responses()[0].ok, false); assert.equal(f.consent(), undefined);
  f.secure(true); f.command({id: 'c', op: 'authorize', user: data.user, scope: data.scope, mac: data.mac});
  assert.ok(f.consent()); f.server.decide(true); assert.equal(f.responses()[0].result.authorized, true);
  f.command({id: 'd', op: 'profile', profile: data}); assert.equal(f.responses()[0].result.appliedRevision, 1);
  f.node.samples.append('sample', 1000, {scope: data.scope});
  const epoch = f.node.samples.checkpoint.epoch;
  f.command({id: 'e', op: 'batch', stream: 'samples', epoch, after: 0});
  assert.equal(f.responses()[0].result.rows[0].seq, 1);
  f.command({id: 'f', op: 'ack', stream: 'samples', epoch, sequence: 1});
  assert.equal(f.responses()[0].ok, false);
  f.command({id: 'g', op: 'ack', stream: 'samples', epoch, sequence: 1, custody: true});
  assert.equal(f.responses()[0].result.acknowledged, 1);
  f.server.reset(); f.command({id: 'h', op: 'status'}); assert.equal(f.responses()[0].ok, false);
});
test('questions need deliberate choice; signal dismissal and bounded cues stay distinct', () => {
  const responses = [], question = {mode: 'question', question: 'Serve aiuto?', light: true,
    sound: true, vibration: false, dismiss: 'either', repeats: 2, pulseMs: 100};
  const interaction = new core.Interaction(question, value => {responses.push(value); return true;});
  assert.equal(interaction.button(900), false); assert.equal(responses.length, 0);
  interaction.button(20); assert.equal(interaction.selected, 'yes');
  interaction.button(20); assert.equal(interaction.selected, 'no');
  assert.equal(interaction.button(900), true); assert.deepEqual(responses, ['no']);
  assert.equal(interaction.touch('yes'), false);
  const c = new Clock(), signals = [];
  const cues = new core.Cues(c, {light: v => signals.push(v), sound: () => signals.push('sound')});
  cues.start(question); assert.ok(signals.includes('sound')); cues.stop();
  const count = signals.length; c.advance(3000); assert.equal(signals.length, count);
  const signal = new core.Interaction({...question, mode: 'signal', dismiss: 'button'}, v => {responses.push(v); return true;});
  assert.equal(signal.touch('yes'), false); assert.equal(signal.button(0), true);
  assert.equal(responses.at(-1), 'dismissed');
});

 test('oversized or invalid frames never execute a valid-looking suffix', () => {
  const f = setup();
  f.server.receive([...Buffer.from('x'.repeat(8193))]);
  f.command({id: 'suffix', op: 'status'});
  assert.deepEqual(f.responses(), []);
  f.server.receive([255]); f.command({id: 'invalid', op: 'status'});
  assert.deepEqual(f.responses(), []);
  f.command({id: 'fresh', op: 'status'});
  assert.equal(f.responses()[0].id, 'fresh');
 });

test('peer name is accepted only after encrypted consent and cleared on disconnect', () => {
  const f=setup(), data=policy();
  f.command({id:'bad',op:'authorize',user:data.user,scope:data.scope,mac:data.mac,peerName:'x'.repeat(33)});
  assert.equal(f.responses()[0].ok,false);assert.equal(f.node.state.peerName,null);
  f.command({id:'name',op:'authorize',user:data.user,scope:data.scope,mac:data.mac,peerName:'samsung SM-G991B'});
  assert.equal(f.node.state.peerName,null);f.server.decide(true);f.responses();
  assert.equal(f.node.state.peerName,'samsung SM-G991B');
  f.server.reset();assert.equal(f.node.state.peerName,null);
});

test('clock writes require encrypted physical consent just like measurements', () => {
  const clockModule=require('../../apps/veranode/clock.js'), p=platform(core), output=[];
  p.env.timeFactory=clockModule.create;let offset=0;p.env.clock={...p.clock,now:()=>p.clock.now()+offset,setWall:ms=>{offset=ms-p.clock.now();}};
  const node=runtime.create(p.env);node.start();
  const server=wire.create({node,mac:p.env.mac,clock:p.clock,send:s=>output.push(s),encrypted:()=>true,consent:()=>{}});
  function run(request) {
    server.receive([...Buffer.from(JSON.stringify(request)+'\n')]);p.clock.advance(10000);
    const rows=output.join('').trim().split('\n').filter(Boolean).map(JSON.parse);output.length=0;return rows;
  }
  assert.equal(run({id:'denied',op:'clock_sync'})[0].ok,false);
  const data=policy();run({id:'auth',op:'authorize',user:data.user,scope:data.scope,mac:data.mac});
  server.decide(true);p.clock.advance(10000);output.length=0;
  const state=run({id:'read',op:'clock'})[0].result;
  const req={id:'sync',op:'clock_sync',utcMs:1792051200000,timezoneMinutes:120,uncertaintyMs:2000,source:'phone_auto',
    syncId:'22222222-2222-4222-8222-222222222222',epoch:state.epoch,revision:state.revision,boot:state.boot};
  assert.equal(run(req)[0].result.quality,'phone_auto');
  const stale=run({...req,id:'stale',syncId:'33333333-3333-4333-8333-333333333333'});
  assert.equal(stale[0].ok,false);node.dispose();
});



test('status exposes bounded capacity and optional hardware without writing sensor journals',()=>{
 const f=setup(false,()=>({batteryPercent:91,charging:true,firmware:'2v29',board:'BANGLEJS2',storageFreeBytes:1000000})), data=policy();
 f.command({id:'auth',op:'authorize',user:data.user,scope:data.scope,mac:data.mac});f.server.decide(true);f.responses();
 f.node.samples.append('sample',1,{});const before=[...f.p.storage.files.entries()];
 f.command({id:'read',op:'status'});const state=f.responses()[0].result;
 assert.deepEqual(state.buffers.samples,{capacity:2944,stored:1,pending:1,available:2943,full:false});
 assert.equal(state.recordIntervalMs,30000);assert.equal(state.hardware.batteryPercent,91);
 assert.equal(state.contextConfigured,false);assert.deepEqual([...f.p.storage.files.entries()],before);
 const bad=setup(false,()=>{throw new Error('hardware unavailable');});
 bad.command({id:'auth',op:'authorize',user:data.user,scope:data.scope,mac:data.mac});bad.server.decide(true);bad.responses();
 bad.command({id:'read',op:'status'});assert.equal(bad.responses()[0].result.hardwareError,true);
});


test('negotiated transport changes only fragmentation, with exact JSON and 20-byte fallback', () => {
  let size=20;
  const f=setup(false, undefined, ()=>size), data=policy();
  f.command({id:'auth-mtu',op:'authorize',user:data.user,scope:data.scope,mac:data.mac});
  f.server.decide(true);f.responses();
  for (const requested of [20,180,999,NaN,0]) {
    size=requested;
    f.command({id:'state-mtu',op:'status'});f.p.clock.advance(10000);
    const max=Number.isFinite(size)&&size>=20?Math.min(180,size):20;
    assert.ok(f.output.every(x=>x.length<=max));
    if(max===180)assert.ok(f.output.some(x=>x.length>20));
    const response=JSON.parse(f.output.join('').trim());
    assert.equal(response.ok,true);assert.equal(response.result.mac,data.mac);
    f.output.length=0;
  }
  f.server.dispose();f.node.dispose();
});


test('opt-in integrity trailer protects exact ASCII JSON and conservative retries stay at 20 bytes',()=>{
 let size=180;const f=setup(false,undefined,()=>size),data=policy();
 const hash=text=>{let h=0x811c9dc5;for(const c of text){h^=c.charCodeAt(0);h=(h+(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))>>>0;}return h.toString(16).padStart(8,'0');};
 assert.equal(hash('hello'),'4f9f2cab');
 f.command({id:'auth-integrity',op:'authorize',user:data.user,scope:data.scope,mac:data.mac,integrity:true});f.server.decide(true);f.p.clock.advance(10000);
 let text=f.output.join('').trim(),body=text.slice(0,-9);
 assert.equal(text.slice(-9),'#'+hash(body));assert.equal(JSON.parse(body).result.authorized,true);f.output.length=0;
 f.command({id:'state-integrity',op:'status',integrity:true,safeTransport:true});f.p.clock.advance(10000);
 assert.ok(f.output.every(x=>x.length<=20));text=f.output.join('').trim();body=text.slice(0,-9);
 assert.equal(text.slice(-9),'#'+hash(body));assert.equal(JSON.parse(body).result.mac,data.mac);
 f.server.dispose();f.node.dispose();
});
