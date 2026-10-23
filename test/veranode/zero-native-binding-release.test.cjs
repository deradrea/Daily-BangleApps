const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'dist/veranode-zero/veranode-zero-1-3fcc1055a7b21f69'),bytes=fs.readFileSync(path.join(dir,'initialize.json')),pkg=JSON.parse(bytes),descriptor=JSON.parse(fs.readFileSync(path.join(dir,'descriptor.json')));
test('native binding fix preserves the complete target and authorization policy',()=>{
 const previous=JSON.parse(fs.readFileSync(path.join(root,'dist/veranode-zero/veranode-zero-1-50aecec182f2fdec/initialize.json')));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'3fcc1055a7b21f6920db33c563fb4ca557d027b5a678f2ce6fa1bd85eed25aa8');assert.equal(descriptor.size,bytes.length);assert.deepEqual(pkg.target,previous.target);assert.deepEqual(pkg.authorization,previous.authorization);assert.equal(pkg.runtimePackageSha256,previous.runtimePackageSha256);
});
test('native Espruino prepares and reloads a valid binding while invalid bindings never write',{timeout:60000},()=>{
 const result=JSON.parse(cp.execFileSync(process.execPath,[path.join(root,'bin/test-zero-espruino.cjs'),'--package',path.join(dir,'initialize.json')],{cwd:root,encoding:'utf8',timeout:50000}));
 assert.equal(result.nativeBindingPrepared,true);assert.equal(result.hardware,false);assert.ok(result.checks.includes('valid-binding-prepared-and-native-journal-reloaded'));assert.ok(result.checks.includes('invalid-bindings-rejected-without-checkpoint-write'));
});
