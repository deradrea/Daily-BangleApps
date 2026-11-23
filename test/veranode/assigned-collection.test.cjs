const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../apps/veranode/core.js');
const runtime = require('../../apps/veranode/runtime.js');
const wire = require('../../apps/veranode/wire.js');
const {platform, policy} = require('./helpers.cjs');
const relayKey = '12345678-1234-4123-8123-123456789abc';

function fixture(storage) {
  const p = platform(core);
  if (storage) p.env.storage = p.storage = storage;
  const node = runtime.create(p.env), output = [];
  let encrypted = true, bonded = true, prompts = 0;
  const server = wire.create({node, mac:p.env.mac, clock:p.clock,
    encrypted:()=>encrypted, bonded:()=>bonded, chunkSize:()=>180,
    consent:value=>{if(value) prompts++;}, send:part=>output.push(part)});
  const context = policy();
  function command(request) {
    server.receive([...Buffer.from(JSON.stringify(request)+'\n')]);
    p.clock.advance(1000);
    const rows=output.join('').trim().split('\n').filter(Boolean).map(JSON.parse);
    output.length=0; return rows[0];
  }
  function authorize(extra={}) {
    return command({id:'auth',op:'authorize',user:context.user,scope:context.scope,
      mac:context.mac,relayKey,...extra});
  }
  function close() {server.dispose();node.dispose();}
  return {p,node,server,command,authorize,context,close,prompts:()=>prompts,
    encrypted:value=>encrypted=value,bonded:value=>bonded=value};
}

test('assigned bonded collection authorizes without a profile or a watch question',()=>{
  const f=fixture();f.node.start();
  assert.equal(f.node.state.policy,null);
  assert.equal(f.authorize().result.authorization,'assigned-bond-v1');
  assert.equal(f.prompts(),0);
  assert.deepEqual(core.unpack(f.p.storage.read('veranode.owner')),
    {v:1,mac:f.context.mac,user:f.context.user,scope:f.context.scope});
  assert.equal(f.command({id:'start',op:'collection_session',seconds:120}).result.active,true);
  f.p.clock.advance(31000);
  const batch=f.command({id:'batch',op:'batch',stream:'samples',
    epoch:f.node.samples.checkpoint.epoch,after:0}).result.rows;
  assert.ok(batch.length>0);assert.ok(batch.every(row=>row.data.scope===f.context.scope));
  for(const op of ['profile','collection_set','settings_set','admin_offer'])
    assert.equal(f.command({id:'deny-'+op,op}).ok,false);
  f.close();
});

test('automatic collection recovery keeps sequence, custody ACK and stop semantics',()=>{
  const f=fixture();f.node.start();f.authorize();
  f.command({id:'start',op:'collection_session',seconds:300});f.p.clock.advance(31000);
  f.server.reset();f.p.clock.advance(62000);
  assert.equal(f.command({id:'bad',op:'collection_resume',mac:f.context.mac,relayKey:'wrong'}).result.authorized,false);
  assert.equal(f.command({id:'resume',op:'collection_resume',mac:f.context.mac,relayKey}).result.authorized,true);
  const epoch=f.node.samples.checkpoint.epoch;
  const rows=f.command({id:'read',op:'batch',stream:'samples',epoch,after:0}).result.rows;
  assert.ok(rows.length>=3);
  assert.deepEqual(rows.map(row=>row.seq),Array.from({length:rows.length},(_,i)=>i+1));
  const sequence=rows.at(-1).seq;
  assert.equal(f.command({id:'no-custody',op:'ack',stream:'samples',epoch,sequence}).ok,false);
  assert.equal(f.command({id:'ack',op:'ack',stream:'samples',epoch,sequence,custody:true}).result.acknowledged,sequence);
  assert.equal(f.command({id:'ack-again',op:'ack',stream:'samples',epoch,sequence,custody:true}).result.acknowledged,sequence);
  assert.equal(f.command({id:'read-again',op:'batch',stream:'samples',epoch,after:sequence}).result.rows.length,0);
  assert.equal(f.command({id:'stop',op:'collection_session',seconds:0}).result.active,false);
  const high=f.node.samples.next;f.p.clock.advance(65000);assert.equal(f.node.samples.next,high);
  f.server.reset();assert.equal(f.command({id:'stopped',op:'collection_resume',mac:f.context.mac,relayKey}).result.authorized,false);
  assert.equal(f.prompts(),0);f.close();
});

test('collection binding survives reboot, preserves records and refuses another context',()=>{
  const f=fixture();f.node.start();f.authorize();f.command({id:'start',op:'collection_session',seconds:120});
  f.p.clock.advance(31000);const high=f.node.samples.next,storage=f.p.storage;f.close();
  const again=fixture(storage);
  assert.equal(again.node.samples.next,high);
  assert.equal(again.authorize({scope:'another-company'}).ok,false);
  assert.equal(again.authorize({user:'22222222-2222-4222-8222-222222222222'}).ok,false);
  assert.equal(again.authorize({mac:'AA:BB:CC:DD:EE:FF'}).ok,false);
  assert.equal(again.authorize().result.authorized,true);
  assert.equal(again.node.samples.next,high);assert.equal(again.prompts(),0);again.close();
});

test('encrypted but unbonded phones and invalid relay keys cannot start assigned collection',()=>{
  for(const reason of ['encrypted','bonded','relay']) {
    const f=fixture();if(reason==='encrypted')f.encrypted(false);if(reason==='bonded')f.bonded(false);
    assert.equal(f.authorize(reason==='relay'?{relayKey:'invalid'}:{}).ok,false);
    assert.equal(f.p.storage.read('veranode.owner'),undefined);assert.equal(f.prompts(),0);f.close();
  }
});

test('failed or corrupt binding never grants collection or erases samples',()=>{
  const f=fixture();f.p.storage.fail=true;
  assert.equal(f.authorize().ok,false);assert.equal(f.command({id:'state',op:'status'}).ok,false);
  f.p.storage.fail=false;f.close();
  const g=fixture();const storage=g.p.storage;g.close();storage.write('veranode.owner','torn');
  const broken=fixture(storage);const high=broken.node.samples.next;
  assert.equal(broken.authorize().ok,false);assert.equal(broken.node.samples.next,high);assert.equal(broken.prompts(),0);broken.close();
});

test('existing policy mismatch is rejected and full management still requires its own consent',()=>{
  const f=fixture();f.node.installPolicy(policy(),true);
  assert.equal(f.authorize({scope:'wrong'}).ok,false);
  const reply=f.command({id:'management',op:'authorize',user:f.context.user,scope:f.context.scope,mac:f.context.mac});
  assert.equal(reply,undefined);assert.equal(f.prompts(),1);
  f.server.decide(false);f.close();
});

test('repeated sessions reuse the verified binding without flash writes or a question',()=>{
  const f=fixture();f.authorize();let writes=0;
  const write=f.p.storage.write.bind(f.p.storage);f.p.storage.write=(name,value)=>{if(name==='veranode.owner')writes++;return write(name,value);};
  f.server.reset();assert.equal(f.authorize({relayKey:'22222222-2222-4222-8222-222222222222'}).result.authorized,true);
  assert.equal(writes,0);assert.equal(f.prompts(),0);f.close();
});
