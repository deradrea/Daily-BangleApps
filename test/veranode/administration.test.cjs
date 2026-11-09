const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const core=require('../../apps/veranode/core.js');
const auth=require('../../experimental/veranode-administration/authorization.js');
const manager=require('../../experimental/veranode-administration/erase.js');
const nacl=require('../../experimental/veranode-administration/vendor/tweetnacl-1.0.3/nacl-fast.js');
const {MemoryStorage}=require('./helpers.cjs');
const verify=auth.verifier(nacl),sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
function fixture() {
 const storage=new MemoryStorage();storage.erase=name=>storage.normal.delete(name);
 const keys=crypto.generateKeyPairSync('ed25519');
 const publicKey=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
 const journal=new core.Journal(storage,'veranode.s',{maxSegments:8,segmentRecords:2});
 for(let i=0;i<5;i++)journal.append('sample',i,{bpm:72});
 journal.ack(journal.checkpoint.epoch,1);
 storage.write('veranode.policy.json','unchanged-profile');storage.open('veranode.e0','a').write('event');
 storage.open('veranode.t0','a').write('clock');
 let now=Date.UTC(2026,9,20),mono=1000;
 const binding={issuer:'https://vera.invalid',keyId:'test-key',mac:'AA:BB:CC:DD:EE:01',
  userUuid:'11111111-1111-4111-8111-111111111111',companyId:2,assignmentId:9,scope:'test-scope'};
 const env={journal,storage,core,authorization:auth,verify,sha256,
  trust:{...binding,publicKey,provisioned:true},binding:()=>({...binding}),executionEnabled:true,resourcesValidated:true,consoleDisabled:true,
  time:()=>({now,verified:true,uncertaintyMs:0,revision:1}),monotonic:()=>mono,
  randomHex:n=>crypto.randomBytes(n).toString('hex')};
 const sign=body=>({body,signature:crypto.sign(null,Buffer.from(auth.canonical(body)),keys.privateKey).toString('hex')});
 const create=()=>manager.create(env);
 const reboot=()=>{env.journal=new core.Journal(storage,'veranode.s',{maxSegments:8,segmentRecords:2});return create();};
 return {storage,journal,env,binding,sign,create,reboot,advance:ms=>{now+=ms;mono+=ms;}};
}
const op='22222222-2222-4222-8222-222222222222';
const controllerModule=require('../../experimental/veranode-administration/controller.js');
const {Clock}=require('./helpers.cjs');
function cooperative(f,clock) {
 const vm=require('node:vm'),built=require('../../experimental/veranode-administration/build-verifier.cjs').build({optimized:true});
 const ctx={exports:{},Uint8Array,Float32Array,Int32Array,require:()=>({SHA512:bytes=>Uint8Array.from(crypto.createHash('sha512').update(bytes).digest()).buffer})};
 vm.runInNewContext(built.source,ctx);delete f.env.verify;
 f.env.verifyAsync=require('../../experimental/veranode-administration/verification-driver.js').create({verifier:ctx.exports,clock});
 return f.create();
}
test('cooperative physical confirmation makes no intent before valid proof; progress and cancellation remain responsive',()=>{
 const f=fixture(),clock=new Clock(),m=cooperative(f,clock),c=controllerModule.create({manager:m,clock,stats:()=>f.journal.stats()});
 const body=c.prepare(op);c.offer(f.sign(body));c.confirm();assert.equal(c.status().phase,'verifying');
 clock.advance(20);assert.ok(c.status().verificationPercent>=0);assert.equal(m.status().pending,false);
 assert.equal(c.cancel(),true);clock.advance(2000);assert.equal(m.status().pending,false);assert.equal(f.journal.pending(),4);
 const next=c.prepare(op);c.offer(f.sign(next));c.confirm();clock.advance(2000);
 assert.equal(c.status().phase,'completed');assert.equal(c.status().receipt.removed,5);assert.equal(c.status().receipt.custodyAck,1);
});
test('cooperative verifier rechecks expiry binding and target contents; later samples stay outside the signed plan',()=>{
 for(const reason of ['expiry','binding','new-sample','bad-signature','target-changed']) {
  const f=fixture(),clock=new Clock(),m=cooperative(f,clock),c=controllerModule.create({manager:m,clock,stats:()=>f.journal.stats()});
  const body=c.prepare(op),grant=f.sign(body);if(reason==='bad-signature')grant.signature='00'.repeat(64);
  c.offer(grant);c.confirm();clock.advance(20);
  if(reason==='expiry')f.advance(60001);
  if(reason==='binding')f.binding.assignmentId++;
  if(reason==='new-sample')f.journal.append('sample',99,{});
  if(reason==='target-changed')f.storage.files.set('veranode.s0',f.storage.files.get('veranode.s0')+'invalid\n');
  clock.advance(2000);assert.equal(c.status().phase,reason==='new-sample'?'completed':'rejected');assert.equal(m.status().pending,false);
  assert.equal(f.journal.stats().stored,reason==='new-sample'?1:5);
  if(reason==='new-sample'){assert.equal(f.journal.readBatch(0)[0].seq,6);assert.equal(f.journal.checkpoint.ack,1);}
 }
});
test('PHP Sodium backend fixture uses identical canonical bytes and rejects tampering',()=>{
 const f=require('./fixtures/backend-erase-ed25519-v1.json');
 assert.equal(f.testOnly,true);assert.equal(auth.canonical(f.body),f.canonical);
 assert.equal(verify(f.canonical,f.signature,f.publicKey),true);
 assert.equal(verify(auth.canonical({...f.body,pending:0}),f.signature,f.publicKey),false);
 assert.equal(sha256(JSON.stringify(f.segment_plan.map(s=>[s.name,s.count,s.last,s.hash]))),f.body.planHash);
});
test('canonical MAC validation is explicit and rejects malformed or lower-case addresses',()=>{
 const f=require('./fixtures/backend-erase-ed25519-v1.json');
 for(const mac of ['aa:bb:cc:dd:ee:01','AA:BB:CC:DD:EE','AA:BB:CC:DD:EE:01:02','AA:BB:CC:DD:EE:0G','A:BBB:CC:DD:EE:01'])assert.throws(()=>auth.canonical({...f.body,mac}));
 assert.equal(auth.canonical(f.body),f.canonical);
});
test('watch controller requires physical confirmation before signed intent and yields between steps',()=>{
 const f=fixture(),m=f.create(),clock=new Clock(),before=[...f.storage.files.entries()];
 const c=controllerModule.create({manager:m,clock,stats:()=>f.env.journal.stats()});
 const body=c.prepare(op);c.offer(f.sign(body));
 assert.equal(c.status().phase,'confirmation');assert.equal(m.status().pending,false);
 assert.deepEqual([...f.storage.files.entries()],before);
 c.confirm();assert.equal(c.status().phase,'running');assert.equal(m.status().pending,true);
 assert.deepEqual([...f.storage.files.entries()],before); // no segment erased in the touch handler
 clock.advance(200);assert.equal(c.status().phase,'completed');
 assert.equal(c.status().receipt.removed,5);assert.equal(c.status().receipt.custodyAck,1);
 assert.equal(f.storage.read('veranode.policy.json'),'unchanged-profile');
});
test('challenge exports an immutable exact plan and reboot exposes the durable receipt',()=>{
 const f=fixture(),m=f.create(),clock=new Clock();
 assert.throws(()=>m.challengePlan());const body=m.challenge(op),plan=m.challengePlan();
 assert.equal(sha256(JSON.stringify(plan.map(s=>[s.name,s.count,s.last,s.hash]))),body.planHash);
 plan[0].hash='0'.repeat(64);assert.notEqual(m.challengePlan()[0].hash,plan[0].hash);
 m.begin(f.sign(body));finish(m);
 const c=controllerModule.create({manager:f.reboot(),clock,stats:()=>f.env.journal.stats()});
 assert.equal(c.status().lastReceipt.operationId,op);assert.equal(c.status().lastReceipt.removed,5);
});
test('watch controller rejects invalid grants and expiry without deleting and cancel is non-destructive',()=>{
 for(const reason of ['signature','expired','cancel']) {
  const f=fixture(),m=f.create(),clock=new Clock(),before=[...f.storage.files.entries()];
  const c=controllerModule.create({manager:m,clock,stats:()=>f.env.journal.stats()});
  const body=c.prepare(op),grant=f.sign(body);if(reason==='signature')grant.signature='00'.repeat(64);
  c.offer(grant);if(reason==='expired')f.advance(60001);
  if(reason==='cancel'){assert.equal(c.cancel(),true);assert.throws(()=>c.confirm());}
  else{c.confirm();assert.equal(c.status().phase,'rejected');}
  clock.advance(200);assert.deepEqual([...f.storage.files.entries()],before);assert.equal(m.status().pending,false);
 }
});
test('watch controller resumes interrupted durable intent and cannot cancel accepted deletion',()=>{
 const f=fixture(),m=f.create(),clock=new Clock();
 const env={manager:m,clock,stats:()=>f.env.journal.stats()};
 const c=controllerModule.create(env),body=c.prepare(op);c.offer(f.sign(body));c.confirm();
 assert.equal(c.cancel(),false);
 const original=f.storage.open.bind(f.storage);
 f.storage.open=(name,mode)=>{const file=original(name,mode);return {...file,erase:()=>{throw Error('interrupt');}};};
 clock.advance(20);assert.equal(c.status().phase,'interrupted');assert.equal(m.status().pending,true);
 c.dispose();f.storage.open=original;
 const resumed=controllerModule.create({...env,manager:f.reboot()});assert.equal(resumed.status().pending,true);
 resumed.resume();clock.advance(200);assert.equal(resumed.status().phase,'completed');
 assert.equal(resumed.status().receipt.removedPending,4);
});
function finish(m){for(let i=0;i<100;i++){const r=m.step();if(r.state==='completed')return r;}throw Error('No completion');}

test('a signed wipe works with no spare segment and without transferring samples first', () => {
 const f=fixture();
 f.journal.maxSegments=f.journal.segments.length;
 const m=f.create(), body=m.challenge(op);
 assert.equal(body.pending,4);
 assert.equal(f.journal.append('sample',99,{}),undefined);
 assert.equal(m.cancelChallenge(),true);
 assert.equal(f.journal.append('sample',99,{}).seq,6);
 const retry=m.challenge(op);
 m.begin(f.sign(retry));
 const receipt=finish(m);
 assert.equal(receipt.removed,6);
 assert.equal(receipt.removedPending,5);
 assert.equal(f.journal.stats().stored,0);
 assert.equal(f.journal.maxSegments,3);
});

test('an unanswered wipe request releases the last writable segment at expiry', () => {
 const f=fixture(),clock=new Clock();
 f.journal.maxSegments=f.journal.segments.length;
 const c=controllerModule.create({manager:f.create(),clock,stats:()=>f.journal.stats()});
 c.prepare(op);
 assert.equal(f.journal.append('sample',99,{}),undefined);
 clock.advance(60000);
 assert.equal(c.status().phase,'rejected');
 assert.equal(c.status().pending,false);
 assert.equal(f.journal.append('sample',100,{}).seq,6);
});

test('resume startup failures remain explicitly interrupted and preserve the accepted intent',()=>{
 const f=fixture(),initial=f.create();initial.begin(f.sign(initial.challenge(op)));
 delete f.env.verify;f.env.verifyAsync=()=>{throw Error('scheduler unavailable');};
 const m=f.reboot(),clock=new Clock(),c=controllerModule.create({manager:m,clock,stats:()=>f.env.journal.stats()});
 const before=[...f.storage.files.entries()];assert.doesNotThrow(()=>c.resume());
 assert.equal(c.status().phase,'interrupted');assert.equal(c.status().pending,true);
 assert.match(c.status().error,/verificare/);assert.equal(c.cancel(),false);
 c.dispose();clock.advance(2000);assert.deepEqual([...f.storage.files.entries()],before);
});

test('disposing unaccepted administration releases the snapshot and stops cooperative proof',()=>{
 for(const phase of ['awaiting_authorization','confirmation','verifying']) {
  const f=fixture(),clock=new Clock(),m=cooperative(f,clock),c=controllerModule.create({manager:m,clock,stats:()=>f.journal.stats()});
  const body=c.prepare(op);if(phase!=='awaiting_authorization')c.offer(f.sign(body));
  if(phase==='verifying'){c.confirm();clock.advance(20);}
  assert.equal(f.journal.segments.at(-1).sealed,true);const before=[...f.storage.files.entries()];
  c.dispose();clock.advance(2000);assert.equal(m.status().pending,false);assert.throws(()=>m.challengePlan());
  assert.equal(f.journal.segments.at(-1).sealed,false);assert.equal(clock.timers.size,0);
  assert.deepEqual([...f.storage.files.entries()],before);assert.equal(f.journal.pending(),4);
 }
});

test('RFC8032 Ed25519 vector verifies and tampering or non-canonical S is rejected',()=>{
 const pk='d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
 const sig='e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';
 assert.equal(verify('',sig,pk),true);assert.equal(verify('changed',sig,pk),false);
 const noncanonical=sig.slice(0,64)+'edd3f55c1a631258d69cf7a2def9de1400000000000000000000000000000010';
 assert.equal(verify('',noncanonical,pk),false);
});
test('execution is closed by default, without trusted provisioning or resource/access validation',()=>{
 for(const key of ['executionEnabled','resourcesValidated','consoleDisabled']){
  const f=fixture();f.env[key]=false;const m=f.create();assert.equal(m.ready(),false);assert.throws(()=>m.challenge(op));
 }
 const f=fixture();f.env.trust.provisioned=false;assert.throws(()=>f.create().challenge(op));
});
test('real signed grant deletes retained and pending samples without creating custody or touching profile/events/time',()=>{
 const f=fixture(),m=f.create(),body=m.challenge(op),epoch=f.journal.checkpoint.epoch;
 assert.equal(body.stored,5);assert.equal(body.pending,4);
 m.begin(f.sign(body));
 assert.ok(f.journal.eraseReserved.length>0);assert.throws(()=>f.journal.ack(epoch,2));assert.throws(()=>f.journal.readBatch(0));
 const receipt=finish(m);
 assert.equal(receipt.removed,5);assert.equal(receipt.removedPending,4);assert.equal(receipt.custodyAck,1);
 assert.equal(receipt.hardwareAttested,false);assert.equal(f.journal.pending(),0);assert.equal(f.journal.stats().stored,0);
 assert.equal(f.storage.read('veranode.policy.json'),'unchanged-profile');
 assert.equal(f.storage.files.get('veranode.e0'),'event');assert.equal(f.storage.files.get('veranode.t0'),'clock');
 assert.equal(f.journal.append('sample',10,{bpm:73}).seq,6);
 const again=m.begin(f.sign(body));assert.equal(again.state,'completed');assert.equal(f.journal.pending(),1);
 assert.equal(f.journal.readBatch(0)[0].seq,6);f.journal.ack(epoch,6);
 const fresh=f.reboot();assert.equal(f.env.journal.next,7);assert.equal(f.env.journal.pending(),0);assert.equal(fresh.status().pending,false);
});
test('tampered signatures, wrong assignment, expiry and clock rollback cause no destructive write',()=>{
 for(const mutation of ['signature','assignment','expiry','clock','nonce','high','pending']){
  const f=fixture(),m=f.create(),body=m.challenge(op);let grant=f.sign(body);
  const before=[...f.storage.files.entries()];
  if(mutation==='signature')grant.signature='00'.repeat(64);
  if(mutation==='assignment')f.binding.assignmentId++;
  if(mutation==='expiry')f.advance(60001);
  if(mutation==='clock')f.advance(-1);
  if(mutation==='nonce'){body.nonce='aa'.repeat(32);grant=f.sign(body);}
  if(mutation==='high'){body.high++;grant=f.sign(body);}
  if(mutation==='pending'){body.pending--;grant=f.sign(body);}
  assert.throws(()=>m.begin(grant),mutation);assert.deepEqual([...f.storage.files.entries()],before);
 }
});
test('samples appended after challenge or between deletion steps are preserved outside the signed plan',()=>{
 const f=fixture(),m=f.create(),grant=f.sign(m.challenge(op));
 const added=f.journal.append('sample',100,{bpm:78});
 m.begin(grant);m.step();const during=f.journal.append('sample',101,{bpm:79});
 const receipt=finish(m);assert.equal(receipt.removed,5);assert.equal(receipt.custodyAck,1);
 assert.deepEqual(f.journal.readBatch(0).map(r=>r.seq),[added.seq,during.seq]);assert.equal(f.journal.pending(),2);
 f.reboot();assert.equal(f.env.journal.pending(),2);assert.equal(f.env.journal.next,8);
});
test('power loss at every administrative write/erase recovers the same bounded intent',()=>{
 for(const mode of ['write-before','write-after','erase-before','erase-after'])for(let failAt=1;failAt<=4;failAt++){
  const f=fixture(),m=f.create(),grant=f.sign(m.challenge(op));
  const write=f.storage.write.bind(f.storage),open=f.storage.open.bind(f.storage);let writes=0,erases=0,failed=false;
  f.storage.write=(...args)=>{const hit=++writes===failAt&&mode.startsWith('write');if(hit&&mode==='write-before'){failed=true;throw Error('power loss');}write(...args);if(hit){failed=true;throw Error('power loss');}};
  f.storage.open=(...args)=>{const file=open(...args),erase=file.erase;file.erase=()=>{const hit=++erases===failAt&&mode.startsWith('erase');if(hit&&mode==='erase-before'){failed=true;throw Error('power loss');}erase();if(hit){failed=true;throw Error('power loss');}};return file;};
  try {m.begin(grant);finish(m);}catch(e){assert.match(e.message,/power loss/);}
  f.storage.write=write;f.storage.open=open;f.advance(120000);
  const recovered=f.reboot();
  if(recovered.status().pending){assert.throws(()=>f.env.journal.readBatch(0));recovered.resume();if(recovered.status().pending)finish(recovered);}
  if(failed&&mode==='write-before'&&failAt===1){assert.equal(f.env.journal.pending(),4);}
  else {assert.equal(f.env.journal.pending(),0);assert.equal(f.env.journal.checkpoint.ack,1);assert.equal(f.env.journal.append('sample',999,{}).seq,6);}
  assert.equal(f.storage.read('veranode.policy.json'),'unchanged-profile');
 }
});
test('power loss retains newer records before and during the exact signed deletion, without reusing reserved slots',()=>{
 for(const mode of ['write-before','write-after','erase-before','erase-after'])for(let failAt=1;failAt<=4;failAt++) {
  const f=fixture(),m=f.create(),grant=f.sign(m.challenge(op));
  const newer=f.journal.append('sample',100,{bpm:88});
  const write=f.storage.write.bind(f.storage),open=f.storage.open.bind(f.storage);let writes=0,erases=0;
  f.storage.write=(...args)=>{const hit=++writes===failAt&&mode.startsWith('write');if(hit&&mode==='write-before')throw Error('power loss');write(...args);if(hit)throw Error('power loss');};
  f.storage.open=(...args)=>{const file=open(...args),erase=file.erase;file.erase=()=>{const hit=++erases===failAt&&mode.startsWith('erase');if(hit&&mode==='erase-before')throw Error('power loss');erase();if(hit)throw Error('power loss');};return file;};
  try{m.begin(grant);m.step();const row=f.journal.append('sample',101,{bpm:89});assert.ok(!f.journal.eraseReserved.includes(f.journal.segments.at(-1).name));assert.equal(row.seq,7);finish(m);}catch(e){assert.match(e.message,/power loss/);}
  f.storage.write=write;f.storage.open=open;const recovered=f.reboot();
  if(recovered.status().pending){recovered.resume();if(recovered.status().pending)finish(recovered);}
  const rows=f.env.journal.readBatch(0);assert.ok(rows.some(r=>r.seq===newer.seq&&r.data.bpm===88));
  assert.equal(f.env.journal.checkpoint.ack,1);assert.ok(f.env.journal.next>=7);
  assert.equal(f.storage.read('veranode.policy.json'),'unchanged-profile');
 }
});
test('runtime adapter connects the real journal and notifications but cannot invent missing provisioning or console validation',()=>{
 const attach=require('../../experimental/veranode-administration/runtime-adapter.js').attach;
 const f=fixture(),clock=new Clock(),vm=require('node:vm'),ctx={exports:{},Uint8Array,Float32Array,Int32Array,
  require:()=>({SHA512:bytes=>Uint8Array.from(crypto.createHash('sha512').update(bytes).digest()).buffer})};
 vm.runInNewContext(require('../../experimental/veranode-administration/build-verifier.cjs').build().source,ctx);
 let notifications=0;const node={samples:f.journal,changed:()=>notifications++};
 const closed=attach({...f.env,node,clock,executionEnabled:false,verifier:ctx.exports,erase:manager,
  authorization:auth,driver:require('../../experimental/veranode-administration/verification-driver.js'),controller:controllerModule});
 assert.equal(node.administration,closed);assert.equal(closed.status().executionEnabled,false);assert.throws(()=>closed.prepare(op));
 assert.equal(f.journal.stats().stored,5);assert.equal(notifications,0);
 assert.throws(()=>attach({...f.env,node,clock}));closed.dispose();
});

test('trusted runtime adapter completes signed snapshot deletion with live collection and durable receipt',()=>{
 const f=fixture(),clock=new Clock(),vm=require('node:vm'),ctx={exports:{},Uint8Array,Float32Array,Int32Array,
  require:()=>({SHA512:bytes=>Uint8Array.from(crypto.createHash('sha512').update(bytes).digest()).buffer})};
 vm.runInNewContext(require('../../experimental/veranode-administration/build-verifier.cjs').build().source,ctx);
 let notifications=0;const node={samples:f.journal,changed:()=>notifications++};
 const c=require('../../experimental/veranode-administration/runtime-adapter.js').attach({...f.env,node,clock,
  verifier:ctx.exports,erase:manager,authorization:auth,
  driver:require('../../experimental/veranode-administration/verification-driver.js'),controller:controllerModule});
 const body=c.prepare(op);c.offer(f.sign(body));c.confirm();clock.advance(100);
 assert.equal(c.status().phase,'verifying');assert.equal(c.status().pending,false);
 const row=node.samples.append('sample',200,{bpm:81});clock.advance(2000);
 assert.equal(c.status().phase,'completed');assert.equal(c.status().receipt.removed,5);
 assert.ok(notifications>10);assert.equal(node.samples.pending(),1);
 assert.deepEqual(node.samples.readBatch(0).map(r=>r.seq),[row.seq]);
 assert.equal(f.storage.read('veranode.policy.json'),'unchanged-profile');c.dispose();
 const rebooted=f.reboot();assert.equal(rebooted.status().last.operationId,op);
 assert.equal(rebooted.status().last.custodyAck,1);assert.equal(f.env.journal.pending(),1);
});

test('invalid live time or timer cannot authorize an erase',()=>{
 for(const change of [()=>({now:NaN,verified:true,uncertaintyMs:0,revision:1}),()=>({now:Date.UTC(2026,9,20),verified:true,uncertaintyMs:-1,revision:1}),()=>({now:Date.UTC(2026,9,20),verified:true,uncertaintyMs:NaN,revision:1})]) {
  const f=fixture(),m=f.create(),grant=f.sign(m.challenge(op));f.env.time=change;
  assert.throws(()=>m.begin(grant));assert.equal(f.journal.pending(),4);
 }
 const f=fixture(),m=f.create(),grant=f.sign(m.challenge(op));f.env.monotonic=()=>NaN;
 assert.throws(()=>m.begin(grant));assert.equal(f.journal.pending(),4);
});
test('canonical order is stable, extra fields rejected, receipt cannot mutate persistent state',()=>{
 const f=fixture(),m=f.create(),body=m.challenge(op);
 assert.equal(auth.canonical(Object.fromEntries(Object.entries(body).reverse())),auth.canonical(body));
 assert.throws(()=>auth.canonical({...body,extra:1}));
 m.begin(f.sign(body));const receipt=finish(m);receipt.removed=999;
 assert.equal(m.status().last.removed,5);m.status().last.removed=999;
 assert.equal(m.begin(f.sign(body)).removed,5);
});
test('changed assignment or unknown segments stop an accepted erase before next deletion',()=>{
 for(const what of ['assignment','segment']) {
  const f=fixture(),m=f.create();m.begin(f.sign(m.challenge(op)));m.step();
  if(what==='assignment')f.binding.assignmentId++;
  else f.journal.segments.push({name:'veranode.s99',count:1,last:6});
  const before=[...f.storage.files.entries()];assert.throws(()=>m.step());
  assert.deepEqual([...f.storage.files.entries()],before);
 }
});
test('corrupt administrative cursors fail closed on journal startup',()=>{
 for(const patch of [{discardedThrough:-1},{discardedThrough:Infinity},{adminCounter:0.5}]) {
  const f=fixture(),cp={...f.journal.checkpoint,...patch,generation:999};
  f.storage.write('veranode.sack1',core.pack(cp));assert.throws(()=>f.reboot());
 }
});

test('verification-only evaluation wrapper is ES5, exports no signer and verifies without Node require',()=>{
 const vm=require('node:vm'),acorn=require('acorn');
 const {source,manifest}=require('../../experimental/veranode-administration/build-verifier.cjs').build({optimized:false});
 acorn.parse(source,{ecmaVersion:5});
 const sandbox={exports:{},Uint8Array,Uint16Array,Uint32Array,Int32Array,Float64Array};
 vm.runInNewContext(source,sandbox,{timeout:1000});
 assert.deepEqual(Object.keys(sandbox.exports),['verify']);
 assert.equal(sandbox.exports.verify('',
 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'),true);
 assert.equal(manifest.installable,false);assert.equal(manifest.hardwareValidated,false);assert.equal(manifest.executionEnabled,false);
});
