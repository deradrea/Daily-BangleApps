const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),os=require('node:os');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'dist/veranode-zero/veranode-zero-1-f076ba0efa3cac5c'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(path.join(dir,'initialize.json')),pkg=JSON.parse(bytes),descriptor=JSON.parse(fs.readFileSync(path.join(dir,'descriptor.json'))),manifestBytes=fs.readFileSync(path.join(dir,'source-manifest.json')),manifest=JSON.parse(manifestBytes);
const old=JSON.parse(fs.readFileSync(path.join(root,'dist/veranode-zero/veranode-zero-1-d812397c6325d227/initialize.json')));
test('cache fix release verifies 21 payloads and preserves all 14 target files and runtime JSON',()=>{
 assert.equal(sha(bytes),descriptor.sha256);assert.equal(bytes.length,descriptor.size);assert.equal(sha(manifestBytes),pkg.sourceManifestSha256);
 assert.deepEqual(pkg.target,old.target);assert.equal(pkg.runtimePackageSha256,old.runtimePackageSha256);assert.deepEqual(pkg.executionPolicy,old.executionPolicy);assert.equal(pkg.executionEnabled,true);assert.equal(pkg.hardwareValidated,false);
 for(const f of [...pkg.bootstrap,...pkg.target.files]){const b=Buffer.from(f.base64,'base64');assert.equal(sha(b),f.sha256,f.name);assert.equal(b.length,f.size,f.name);}
 for(const [n,hash]of Object.entries(manifest.files))assert.equal(sha(cp.execFileSync('git',['show',pkg.sourceCommit+':'+n],{cwd:root})),hash,n);
 assert.deepEqual(pkg.bootstrap.filter(f=>old.bootstrap.find(p=>p.name===f.name).sha256!==f.sha256).map(f=>f.name),['vz.app.js','vz.target.js']);
});
test('real official Espruino 2v29 reproduces the old failure and passes all native bootstrap regressions', {timeout:60000},()=>{
 const out=cp.execFileSync(process.execPath,[path.join(root,'bin/test-zero-espruino.cjs'),'--package',path.join(dir,'initialize.json'),'--download'],{cwd:root,encoding:'utf8',timeout:50000,maxBuffer:1048576});
 const result=JSON.parse(out);assert.equal(result.ok,true);assert.equal(result.interpreter.version,'2v29');assert.equal(result.interpreter.board,'EMSCRIPTEN2');assert.equal(result.hardware,false);assert.equal(result.nodeRequireMock,false);assert.equal(result.checks.length,6);
});
test('cache fix release rebuilds all three immutable assets with its canonical historical builder',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vera-cache-fix-rebuild-'));
 try{const r=require('../../bin/build-veranode-zero.cjs').build(tmp,{sourceCommit:pkg.sourceCommit,targetProfile:'veranode-only'});for(const name of ['initialize.json','descriptor.json','source-manifest.json'])assert.deepEqual(fs.readFileSync(path.join(path.dirname(r.path),name)),fs.readFileSync(path.join(dir,name)));}
 finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
