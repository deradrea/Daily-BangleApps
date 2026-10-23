const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'dist/veranode-zero/veranode-zero-1-2c74ed8520dc7429'),bytes=fs.readFileSync(path.join(dir,'initialize.json')),pkg=JSON.parse(bytes),descriptor=JSON.parse(fs.readFileSync(path.join(dir,'descriptor.json')));
test('native staging fix preserves all final files and authorization policy',()=>{
 const previous=JSON.parse(fs.readFileSync(path.join(root,'dist/veranode-zero/veranode-zero-1-3fcc1055a7b21f69/initialize.json')));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'2c74ed8520dc74293b09521bea9b644aaa44b28ae2140ebf9c0a1fe19f5a06de');assert.equal(descriptor.size,bytes.length);assert.deepEqual(pkg.target,previous.target);assert.deepEqual(pkg.authorization,previous.authorization);assert.equal(pkg.runtimePackageSha256,previous.runtimePackageSha256);
});
test('native Storage stages 14 verified files, retries a partial file and completes the provider protocol',{timeout:180000},()=>{
 const result=JSON.parse(cp.execFileSync(process.execPath,[path.join(root,'bin/test-zero-espruino.cjs'),'--package',path.join(dir,'initialize.json')],{cwd:root,encoding:'utf8',timeout:170000}));
 assert.equal(result.nativeBindingPrepared,true);assert.equal(result.nativeStagingVerified,true);assert.equal(result.nativeProviderProtocolComplete,true);assert.equal(result.hardware,false);assert.ok(result.checks.includes('all-14-staged-files-hashed-and-partial-retry-verified'));
});
