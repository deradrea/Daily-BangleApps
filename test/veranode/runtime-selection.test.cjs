const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),select=require('../../bin/veranode-runtime-selection.cjs').select;
test('one verified runtime is selected for both installers; tampered configuration or file bytes are rejected',()=>{
 const read=n=>fs.readFileSync(path.join(root,n));
 const result=select(read);assert.equal(result.files.length,8);
 const config=JSON.parse(read('releases/veranode-runtime.json'));
 for(const altered of [{...config,path:'../package.json'},{...config,revision:'other'},{...config,extra:true},{...config,sha256:'0'.repeat(64)}]){
  assert.throws(()=>select(n=>n==='releases/veranode-runtime.json'?Buffer.from(JSON.stringify(altered)):read(n)));
 }
 assert.throws(()=>select(n=>n===config.path?Buffer.from('{}'):read(n)),/bytes changed/);
});

test('Beta selection is explicit and cannot replace the default runtime',()=>{
 const read=n=>fs.readFileSync(path.join(root,n));
 const reads=[];const observed=n=>{reads.push(n);return read(n);};
 const normal=select(observed),beta=select(observed,'beta');
 // A promotion may temporarily put the same immutable build in both channels.
 // Independence means choosing the explicit selector, not different bytes.
 assert.ok(reads.includes('releases/veranode-runtime.json'));
 assert.ok(reads.includes('releases/veranode-runtime-beta.json'));
 assert.equal(normal.revision,JSON.parse(read('releases/veranode-runtime.json')).revision);
 assert.equal(beta.revision,JSON.parse(read('releases/veranode-runtime-beta.json')).revision);
 assert.throws(()=>select(read,'stable'),/channel/);
 const config=JSON.parse(read('releases/veranode-runtime-beta.json'));
 assert.throws(()=>select(n=>n==='releases/veranode-runtime-beta.json'?
  Buffer.from(JSON.stringify({...config,sha256:'0'.repeat(64)})):read(n),'beta'),/bytes changed/);
});
