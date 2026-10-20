const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {build,validateMetadata,validateDependencies}=require('../../bin/build-veranode-release.cjs');
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


test('package declares data for multi-digit sample segments without classifying software as data',()=>{
 const metadata=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../apps/veranode/metadata.json'),'utf8'));
 validateMetadata(metadata);
 const glob=pattern=>new RegExp('^'+pattern.replace(/\./g,'\\.').replace(/\?/g,'.')+'$');
 const storage=metadata.data.filter(d=>d.storageFile).map(d=>glob(d.wildcard||d.name));
 const normal=metadata.data.filter(d=>!d.storageFile).map(d=>glob(d.wildcard||d.name));
 for(const n of [0,9,10,91,271,511]){
  assert.ok(storage.some(r=>r.test('veranode.s'+n)));
  assert.ok(normal.some(r=>r.test('veranode.s'+n+'idx')));
 }
 for(const entry of metadata.storage)assert.ok(![...normal,...storage].some(r=>r.test(entry.name)));
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'vera-inventory-'));
 const result=build(output),info=JSON.parse(Buffer.from(result.bundle.files.at(-1).base64,'base64'));
 assert.ok(info.data.includes('veranode.s??idx'));assert.ok(info.data.includes(';'));
 const manifest=JSON.parse(fs.readFileSync(path.join(path.dirname(result.path),'source-manifest.json'),'utf8'));
 assert.match(manifest.builderSha256,/^[a-f0-9]{64}$/);
 fs.rmSync(output,{recursive:true,force:true});
});

test('package rejects unsafe paths, duplicate files and missing required modules',()=>{
 const base=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../apps/veranode/metadata.json'),'utf8'));
 const bad=change=>{const m=structuredClone(base);change(m);assert.throws(()=>validateMetadata(m));};
 bad(m=>m.storage[0].url='../clock.js');
 bad(m=>m.storage[0].name='../clock.js');
 bad(m=>m.storage.push(m.storage[0]));
 bad(m=>m.storage=m.storage.filter(s=>s.name!=='veranode.runtime.js'));
 bad(m=>m.storage[0].evaluate=true);
 bad(m=>m.data.push({name:'veranode.app.js'}));
});


test('release dependency closure rejects missing modules and computed requires before packaging',()=>{
 const installed=new Set(['veranode.core.js']);
 validateDependencies('var core=require("veranode.core.js");var s=require("Storage");',installed);
 assert.throws(()=>validateDependencies('require("missing.js");',installed),/Missing dependency/);
 assert.throws(()=>validateDependencies('require(moduleName);',installed),/Dynamic dependency/);
 assert.throws(()=>validateDependencies('require("Storage" + extra);',installed),/Dynamic dependency/);
 assert.throws(()=>validateDependencies('function (',installed));
});
