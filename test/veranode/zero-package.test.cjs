const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process'),os=require('os');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'dist/veranode-zero/veranode-zero-1-5b6c77bc76571b8a');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(path.join(dir,'initialize.json')),bundle=JSON.parse(bytes),descriptor=JSON.parse(fs.readFileSync(path.join(dir,'descriptor.json'))),manifestBytes=fs.readFileSync(path.join(dir,'source-manifest.json')),manifest=JSON.parse(manifestBytes);
test('zero release has verified descriptor, source manifest and all 29 payload hashes',()=>{
 assert.equal(sha(bytes),descriptor.sha256);assert.equal(bytes.length,descriptor.size);assert.equal(sha(manifestBytes),bundle.sourceManifestSha256);assert.equal(manifest.sourceCommit,bundle.sourceCommit);
 assert.equal(bundle.bootstrap.length,7);assert.equal(bundle.target.files.length,22);
 for(const f of [...bundle.bootstrap,...bundle.target.files]){const b=Buffer.from(f.base64,'base64');assert.equal(b.length,f.size,f.name);assert.equal(sha(b),f.sha256,f.name);}
 for(const [name,hash]of Object.entries(manifest.files)){const b=cp.execFileSync('git',['show',manifest.sourceCommit+':'+name],{cwd:root});assert.equal(sha(b),hash,name);}
});
test('zero release keeps runtime and JSON contract bytes and changes only base boot guard',()=>{
 const prior=JSON.parse(fs.readFileSync(path.join(root,'dist/veranode-initialize/veranode-initialize-1-866f85f37a599201/initialize.json')));
 assert.equal(bundle.runtimePackageSha256,prior.runtimePackageSha256);
 for(const old of prior.target.files){const f=bundle.target.files.find(f=>f.name===old.name);if(f.name==='.boot0'){const b=Buffer.from(f.base64,'base64').toString('utf8');assert.ok(b.includes("read('0vz.boot.js')"));assert.ok(b.endsWith(Buffer.from(old.base64,'base64').toString('utf8')));}else assert.deepEqual(f,old);}
 assert.equal(bundle.target.installOrder.length,21);assert.equal(bundle.target.installOrder.at(-1),'.bootcde');assert.equal(bundle.target.installOrder.includes('.boot0'),false);
});
test('zero commissioning is limited to authorized admins and E075, with physical consent and exact firmware',()=>{
 const policy={scope:'platform-admin-commissioning',allowedRoles:['super_admin','platform_admin'],allowedMacs:['D1:4D:6D:D2:E0:75']};
 for(const x of [bundle,descriptor]){assert.equal(x.executionEnabled,true);assert.deepEqual(x.executionPolicy,policy);assert.equal(x.hardwareValidated,false);assert.deepEqual(x.firmware,['2v29']);}
 assert.equal(bundle.authorization.physicalConsent,true);assert.equal(bundle.authorization.encryptedBle,true);assert.equal(bundle.recovery.eraseAll,false);
});
test('bootstrap expressions and support module hashes match and exclude unsupported number helpers',()=>{
 assert.equal(sha(Buffer.from(bundle.feedbackBootstrapExpression)),bundle.feedbackBootstrapSha256);assert.equal(sha(Buffer.from(bundle.uiBootstrapExpression)),bundle.uiBootstrapSha256);
 const targetModule=bundle.bootstrap.find(f=>f.name==='vz.target.js');const data=Buffer.from(targetModule.base64,'base64').toString();const target=JSON.parse(data.slice('exports='.length).trim().replace(/;$/,''));
 assert.equal(target.fingerprint,bundle.target.fingerprint);
 for(const row of target.supportFiles){const f=bundle.bootstrap.find(f=>f.name===row.name);assert.equal(f.sha256,row.sha256);}
 for(const f of bundle.bootstrap)assert.doesNotMatch(Buffer.from(f.base64,'base64').toString(),/Number\s*\.\s*(?:isInteger|isFinite|isSafeInteger)\s*\(|\.eraseAll\s*\(/);
});
test('rebuilding from the recorded Git source reproduces all three published assets exactly',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vera-zero-rebuild-'));
 try{const r=require('../../bin/build-veranode-zero.cjs').build(tmp,{sourceCommit:bundle.sourceCommit});for(const name of ['initialize.json','descriptor.json','source-manifest.json'])assert.deepEqual(fs.readFileSync(path.join(path.dirname(r.path),name)),fs.readFileSync(path.join(dir,name)));}finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
