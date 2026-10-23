const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'dist/veranode-zero/veranode-zero-1-498eaf4afffa5f87');
test('resumable official package pins sources and keeps the exact existing runtime, target and JSON',()=>{
 const bytes=fs.readFileSync(path.join(dir,'initialize.json')),p=JSON.parse(bytes),d=JSON.parse(fs.readFileSync(path.join(dir,'descriptor.json'))),old=JSON.parse(fs.readFileSync(path.join(root,'dist/veranode-zero/veranode-zero-1-2c74ed8520dc7429/initialize.json')));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'498eaf4afffa5f8751f7f6e2df70badcb38bedd56c763d23448d123f07f90090');
 assert.equal(d.size,bytes.length);assert.equal(p.sourceCommit,'a0f6129da13e3b50fc55631c267be8b4f8a9e041');
 assert.deepEqual(p.target,old.target);assert.deepEqual(p.authorization,old.authorization);assert.equal(p.runtimePackageSha256,old.runtimePackageSha256);
 assert(p.rpc.methods.includes('stagingProgress'));
 const provider=Buffer.from(p.bootstrap.find(f=>f.name==='vz.provider.js').base64,'base64').toString(),platform=Buffer.from(p.bootstrap.find(f=>f.name==='vz.platform.js').base64,'base64').toString();
 assert(provider.includes('verified-prefix-v1'));assert(provider.includes('state.upload=upload?'));assert(platform.includes("s.open(f.name,'r').erase()"));
});
