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
