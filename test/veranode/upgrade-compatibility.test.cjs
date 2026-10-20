// Compatibility of actual distributed c212 records, not an installer or hardware test.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const core=require('../../apps/veranode/core.js'),{MemoryStorage}=require('./helpers.cjs');
const fixture=path.resolve(__dirname,'fixtures/c212-core.js');
const provenance=JSON.parse(fs.readFileSync(path.resolve(__dirname,'fixtures/c212-provenance.json')));
const raw=fs.readFileSync(fixture);
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),provenance.coreSha256);
assert.equal(provenance.packageSha256,'838057b1fa2260cfc816f6db83b75649622017681ca971b4fa3a5dba0fa8e562');
const legacy={exports:{}};vm.runInNewContext(raw.toString('utf8'),legacy);
const before=s=>JSON.stringify({normal:[...s.normal.entries()],files:[...s.files.entries()]});
for(const scenario of [
 {name:'empty',count:0,ack:0}, {name:'partial custody',count:101,ack:17},
 {name:'24 hour archive',count:2880,ack:0}, {name:'high-number segments',count:8670,ack:101},
 {name:'torn final line',count:65,ack:0,torn:true}
])test('c212 journal read compatibility: '+scenario.name,()=>{
 const storage=new MemoryStorage(),options={maxSegments:272,segmentRecords:32};
 const old=new legacy.exports.Journal(storage,'veranode.s',options),epoch=old.checkpoint.epoch;
 for(let i=0;i<scenario.count;i++)assert.ok(old.append('sample',Date.UTC(2026,9,20)+i*30000,{scope:'approved-fixture',values:{battito:{value:72,quality:99}}}));
 if(scenario.ack)old.ack(epoch,scenario.ack);
 if(scenario.torn)storage.open(old.segments.at(-1).name,'a').write('{interrupted');
 storage.write('veranode.policy.json','profile-exact-bytes');
 storage.open('veranode.e0','a').write('event-exact-bytes');
 storage.open('veranode.t0','a').write('clock-exact-bytes');
 const snapshot=before(storage),fresh=new core.Journal(storage,'veranode.s',options);
 assert.equal(before(storage),snapshot,'read-only reopen must not mutate data/profile');
 assert.equal(fresh.checkpoint.epoch,epoch);assert.equal(fresh.checkpoint.ack,scenario.ack);
 assert.equal(fresh.next,scenario.count+1);assert.equal(fresh.pending(),scenario.count-scenario.ack);
 let cursor=scenario.ack,seen=0;
 while(cursor<scenario.count) {
  const rows=fresh.readBatch(cursor,16);assert.ok(rows.length);
  for(const row of rows){assert.equal(row.seq,++cursor);assert.equal(row.data.values.battito.value,72);seen++;}
 }
 assert.equal(seen,scenario.count-scenario.ack);assert.equal(before(storage),snapshot);
 assert.equal(fresh.append('sample',Date.UTC(2026,9,21),{scope:'approved-fixture',values:{}}).seq,scenario.count+1);
 assert.equal(storage.read('veranode.policy.json'),'profile-exact-bytes');
 assert.equal(storage.files.get('veranode.e0'),'event-exact-bytes');assert.equal(storage.files.get('veranode.t0'),'clock-exact-bytes');
 const row=fresh.readBatch(scenario.count,1)[0];
 assert.equal(core.pack(row),legacy.exports.pack(row),'JSON and CRC remain compatible');
});
