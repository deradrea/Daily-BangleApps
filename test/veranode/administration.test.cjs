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
function finish(m){for(let i=0;i<100;i++){const r=m.step();if(r.state==='completed')return r;}throw Error('No completion');}

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
 assert.throws(()=>f.journal.append('sample',9,{}));assert.throws(()=>f.journal.ack(epoch,2));assert.throws(()=>f.journal.readBatch(0));
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
test('samples appended after challenge invalidate the plan instead of being erased',()=>{
 const f=fixture(),m=f.create(),grant=f.sign(m.challenge(op));
 const added=f.journal.append('sample',100,{bpm:78});
 assert.throws(()=>m.begin(grant));assert.equal(f.journal.readBatch(0).at(-1).seq,added.seq);
 assert.equal(f.journal.pending(),5);
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
  if(recovered.status().pending){assert.throws(()=>f.env.journal.append('sample',99,{}));recovered.resume();if(recovered.status().pending)finish(recovered);}
  if(failed&&mode==='write-before'&&failAt===1){assert.equal(f.env.journal.pending(),4);}
  else {assert.equal(f.env.journal.pending(),0);assert.equal(f.env.journal.checkpoint.ack,1);assert.equal(f.env.journal.append('sample',999,{}).seq,6);}
  assert.equal(f.storage.read('veranode.policy.json'),'unchanged-profile');
 }
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
 const {source,manifest}=require('../../experimental/veranode-administration/build-verifier.cjs').build();
 acorn.parse(source,{ecmaVersion:5});
 const sandbox={exports:{},Uint8Array,Uint16Array,Uint32Array,Int32Array,Float64Array};
 vm.runInNewContext(source,sandbox,{timeout:1000});
 assert.deepEqual(Object.keys(sandbox.exports),['verify']);
 assert.equal(sandbox.exports.verify('',
 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'),true);
 assert.equal(manifest.installable,false);assert.equal(manifest.hardwareValidated,false);assert.equal(manifest.executionEnabled,false);
});
