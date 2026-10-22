const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'dist/veranode-zero/veranode-zero-1-50aecec182f2fdec'),bytes=fs.readFileSync(path.join(dir,'initialize.json')),p=JSON.parse(bytes),d=JSON.parse(fs.readFileSync(path.join(dir,'descriptor.json'))),old=JSON.parse(fs.readFileSync(path.join(root,'dist/veranode-zero/veranode-zero-1-f076ba0efa3cac5c/initialize.json')));
test('one-click release binds the app confirmation policy to official immutable bytes',()=>{
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),d.sha256);assert.equal(bytes.length,d.size);
 assert.deepEqual(p.authorization,{enforcement:'consumer',deviceVerified:false,physicalConsent:false,confirmationSource:'app',encryptedBle:true});assert.deepEqual(d.authorization,p.authorization);
 const target=JSON.parse(Buffer.from(p.bootstrap.find(f=>f.name==='vz.target.js').base64,'base64').toString().replace(/^exports=/,'').replace(/;\s*$/,''));assert.equal(target.authorizationMode,'app-confirmed');
 assert.ok(!p.uiBootstrapExpression.includes('consentVisible'));
});
test('one-click release preserves all 14 target files and the existing acquisition JSON runtime',()=>{assert.deepEqual(p.target,old.target);assert.equal(p.runtimePackageSha256,old.runtimePackageSha256);assert.equal(p.recovery.eraseAll,false);});
test('native Espruino runs one-click bootstrap without exposing a touch confirmation',{timeout:60000},()=>{const result=JSON.parse(cp.execFileSync(process.execPath,[path.join(root,'bin/test-zero-espruino.cjs'),'--package',path.join(dir,'initialize.json')],{cwd:root,encoding:'utf8',timeout:50000}));assert.equal(result.ok,true);assert.equal(result.hardware,false);assert.equal(result.interpreter.version,'2v29');});
