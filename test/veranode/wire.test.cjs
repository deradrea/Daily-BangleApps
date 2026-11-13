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

test('authorized configuration readback identifies the installed context without changing sensor records',()=>{
 const f=setup(),data=policy();f.node.installPolicy(data,true);
 f.command({id:'config-auth',op:'authorize',user:data.user,scope:data.scope,mac:data.mac});
 f.server.decide(true);f.responses();const before=f.node.samples.next;
 f.command({id:'config-status',op:'status'});const reply=f.responses()[0];
 assert.equal(reply.result.configuration.user,data.user);
 assert.equal(reply.result.configuration.scope,data.scope);
 assert.equal(reply.result.configuration.revision,data.revision);
 assert.equal(reply.result.configuration.expiresAt,data.expiresAt);
 assert.equal(typeof reply.result.configuration.stale,'boolean');assert.equal(f.node.samples.next,before);
 f.server.dispose();f.node.dispose();
});

test('collection changes require owner consent and leave the archive intact', () => {
  const f = setup(), data = policy();
  f.node.start();
  f.command({id:'blocked', op:'collection_set', enabled:false});
  assert.equal(f.responses()[0].ok,false);
  f.command({id:'owner',op:'authorize',user:data.user,scope:data.scope,mac:data.mac});
  f.server.decide(true);f.responses();
  const before = f.node.samples.next;
  f.command({id:'off',op:'collection_set',enabled:false});
  assert.equal(f.responses()[0].result.collectionEnabled,false);
  f.command({id:'status',op:'status'});
  const status = f.responses()[0].result;
  assert.equal(status.capabilities.collectionControl,true);
  assert.equal(status.collectionEnabled,false);
  assert.equal(status.live,false);
  assert.equal(f.node.samples.next,before);
  f.command({id:'invalid-mode',op:'collection_set',mode:'auto'});
  assert.equal(f.responses()[0].ok,false);
  f.command({id:'app-mode',op:'collection_set',mode:'app'});
  assert.equal(f.responses()[0].result.collectionMode,'app');
  f.command({id:'mode-status',op:'status'});
  const appStatus=f.responses()[0].result;
  assert.equal(appStatus.capabilities.collectionModes,true);
  assert.equal(appStatus.collectionMode,'app');
  assert.equal(appStatus.collectionEnabled,true);
  f.server.dispose();f.node.dispose();
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

test('administrative commands are closed by default and no BLE operation confirms deletion',()=>{
 const f=setup(),data=policy();
 f.command({id:'auth-admin',op:'authorize',user:data.user,scope:data.scope,mac:data.mac});f.server.decide(true);f.responses();
 for(const op of ['admin_status','admin_challenge','admin_offer']) {
   f.command({id:'closed-'+op,op});assert.equal(f.responses()[0].ok,false);
 }
 const calls=[];f.node.administration={status:()=>({executionEnabled:true}),prepare:id=>{calls.push(id);return {operationId:id};},
   plan:()=>[],offer:()=>calls.push('offer'),confirm:()=>calls.push('confirm')};
 f.command({id:'challenge',op:'admin_challenge',operationId:'op'});assert.equal(f.responses()[0].ok,true);
 f.command({id:'offer',op:'admin_offer',grant:{}});assert.equal(f.responses()[0].result.confirmationRequired,true);
 f.command({id:'execute',op:'admin_confirm'});assert.equal(f.responses()[0].ok,false);
 assert.deepEqual(calls,['op','offer']);f.server.dispose();f.node.dispose();
});
test('96-segment administrative plan stays under the existing frame bound and pages belong to one operation',()=>{
 const f=setup(),data=policy(),rows=Array.from({length:96},(_,i)=>({name:'veranode.s'+i,count:32,last:(i+1)*32,hash:'a'.repeat(64)}));
 f.command({id:'auth-plan',op:'authorize',user:data.user,scope:data.scope,mac:data.mac});f.server.decide(true);f.responses();
 f.node.administration={status:()=>({executionEnabled:true}),prepare:id=>({operationId:id}),plan:id=>{if(id!=='op')throw Error('Wrong operation');return rows;}};
 f.command({id:'first',op:'admin_challenge',operationId:'op'});const first=f.responses()[0].result;
 assert.equal(first.plan_count,96);assert.equal(first.segment_plan.length,16);assert.equal(first.next_offset,16);assert.ok(JSON.stringify(first).length<8183);
 const combined=[...first.segment_plan];
 for(let offset=16;offset<96;offset+=16){f.command({id:'page'+offset,op:'admin_plan',operationId:'op',offset});const r=f.responses()[0];assert.equal(r.ok,true);assert.ok(JSON.stringify(r).length<8183);combined.push(...r.result.segment_plan);}
 assert.deepEqual(combined,rows);
 for(const command of [{operationId:'other',offset:16},{operationId:'op',offset:-1},{operationId:'op',offset:17},{operationId:'op',offset:96}]){
  f.command({id:'invalid',op:'admin_plan',...command});assert.equal(f.responses()[0].ok,false);
 }
 f.server.dispose();f.node.dispose();
});

test('display settings are authorized, revision checked and independent of sample custody',()=>{
 const f=setup(),data=policy();f.command({id:'denied',op:'settings_get'});assert.equal(f.responses()[0].ok,false);
 f.command({id:'auth-display',op:'authorize',user:data.user,scope:data.scope,mac:data.mac});f.server.decide(true);f.responses();
 const before=JSON.stringify(f.node.samples.checkpoint);f.command({id:'display-read',op:'settings_get'});assert.equal(f.responses()[0].result.brightnessPercent,100);
 f.command({id:'display-save',op:'settings_set',operationId:'display-op',expectedRevision:0,values:{brightnessPercent:60,standbySeconds:30,effect:'pulse'}});
 assert.equal(f.responses()[0].result.revision,1);assert.equal(JSON.stringify(f.node.samples.checkpoint),before);
 f.server.reset();f.command({id:'after-reset',op:'settings_get'});assert.equal(f.responses()[0].ok,false);f.server.dispose();f.node.dispose();
});

test('physical display-only administrator consent never opens journals or owner configuration',()=>{
 const f=setup(),data=policy();f.node.installPolicy(data,true);
 f.command({id:'display-admin',op:'authorize_display',mac:data.mac});assert.equal(f.consent().purpose,'display');f.server.decide(true);assert.equal(f.responses()[0].result.authorized,true);
 for(const op of ['status','batch','ack','clock','clock_sync','profile','admin_offer']){f.command({id:'blocked-'+op,op});assert.equal(f.responses()[0].ok,false);}
 f.command({id:'only-display',op:'settings_get'});assert.equal(f.responses()[0].result.schema,1);
 f.server.reset();f.command({id:'revoked',op:'settings_get'});assert.equal(f.responses()[0].ok,false);f.server.dispose();f.node.dispose();
});

test('display-only consent has a timer expiry independent of wall-clock changes',()=>{
 const f=setup(),data=policy();f.command({id:'short-session',op:'authorize_display',mac:data.mac});f.server.decide(true);f.responses();
 f.p.clock.advance(300001);f.command({id:'expired-display',op:'settings_get'});assert.equal(f.responses()[0].ok,false);
 f.server.dispose();f.node.dispose();assert.equal(f.p.clock.timers.size,0);
});

test('collection reconnect accepts only the key approved on watch and does not grant maintenance', () => {
  const f = setup(), data = policy(), relayKey = '12345678-1234-4123-8123-123456789abc';
  assert.equal(f.node.state.policy, null);
  f.node.start();
  f.command({id:'auth-relay', op:'authorize', user:data.user, scope:data.scope, mac:data.mac, relayKey});
  f.server.decide(true);
  assert.equal(f.responses()[0].result.authorized,true);
  f.command({id:'start-relay',op:'collection_session',seconds:120});
  assert.equal(f.responses()[0].result.active,true);
  f.p.clock.advance(31000);
  f.command({id:'read-relay',op:'batch',stream:'samples',epoch:f.node.samples.checkpoint.epoch,after:0});
  const first = f.responses()[0].result.rows[0];
  assert.equal(first.data.scope, data.scope);
  f.server.reset();
  f.p.clock.advance(31000);
  f.command({id:'wrong-relay',op:'collection_resume',mac:data.mac,relayKey:'wrong'});
  assert.equal(f.responses()[0].result.authorized,false);
  f.secure(false);
  f.command({id:'clear-relay',op:'collection_resume',mac:data.mac,relayKey});
  assert.equal(f.responses()[0].ok,false);
  f.secure(true);
  f.command({id:'right-relay',op:'collection_resume',mac:data.mac,relayKey});
  assert.equal(f.responses()[0].result.authorized,true);
  assert.equal(f.consent(),null);
  f.command({id:'read-resumed',op:'batch',stream:'samples',epoch:first.epoch,after:first.seq});
  const recovered = f.responses()[0].result.rows;
  assert.ok(recovered.length > 0);
  assert.equal(recovered[0].seq, first.seq + 1);
  assert.ok(recovered.every(row => row.data.scope === data.scope));
  f.command({id:'no-settings',op:'settings_get'});
  assert.equal(f.responses()[0].ok,false);
  f.command({id:'stop-relay',op:'collection_session',seconds:0});
  assert.equal(f.responses()[0].result.active,false);
  f.server.reset();
  f.command({id:'stopped-relay',op:'collection_resume',mac:data.mac,relayKey});
  assert.equal(f.responses()[0].result.authorized,false);
  f.server.dispose();f.node.dispose();
});
