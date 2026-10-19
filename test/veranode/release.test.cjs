const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {build}=require('../../bin/build-veranode-release.cjs');
test('release reproducible, immutable, all install bytes hashed and registry last',()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'vera-release-'));
  const first=build(output),again=build(output);
  assert.equal(first.sha256,again.sha256);
  assert.equal(first.path,again.path);
  const p=JSON.parse(fs.readFileSync(first.path));
  assert.equal(p.files.length,8);
  assert.equal(p.files.at(-1).name,'veranode.info');
  assert.equal(p.files.at(-2).name,'veranode.boot.js');
  for(const file of p.files){
    const bytes=Buffer.from(file.base64,'base64');
    assert.equal(bytes.length,file.size);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256);
  }
  const info=JSON.parse(Buffer.from(p.files.at(-1).base64,'base64'));
  assert.equal(info.src,'veranode.app.js');assert.equal(info.type,'clock');
  assert.equal(new Set(info.files.split(',')).size,8);
  fs.writeFileSync(first.path,'changed');
  assert.throws(()=>build(output),/Immutable release conflict/);
  // Temporary fixture only: exact known directory, no recursive shell deletion.
  fs.rmSync(output,{recursive:true,force:true});
});
