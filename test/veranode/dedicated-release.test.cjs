const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),os=require('node:os');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'dist/veranode-zero/veranode-zero-1-d812397c6325d227'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(path.join(dir,'initialize.json')),pkg=JSON.parse(bytes),descriptor=JSON.parse(fs.readFileSync(path.join(dir,'descriptor.json'))),manifestBytes=fs.readFileSync(path.join(dir,'source-manifest.json')),manifest=JSON.parse(manifestBytes);
const previous=JSON.parse(fs.readFileSync(path.join(root,'dist/veranode-zero/veranode-zero-1-5b6c77bc76571b8a/initialize.json')));
test('official Vera-only release verifies all 21 payloads, descriptor, manifest and canonical Git provenance',()=>{
 assert.equal(sha(bytes),descriptor.sha256);assert.equal(bytes.length,descriptor.size);assert.equal(sha(manifestBytes),pkg.sourceManifestSha256);assert.equal(manifest.sourceCommit,pkg.sourceCommit);
 assert.equal(pkg.target.files.length,14);assert.equal(pkg.bootstrap.length,7);
 for(const f of [...pkg.bootstrap,...pkg.target.files]){const b=Buffer.from(f.base64,'base64');assert.equal(b.length,f.size,f.name);assert.equal(sha(b),f.sha256,f.name);}
 for(const [n,hash]of Object.entries(manifest.files))assert.equal(sha(cp.execFileSync('git',['show',pkg.sourceCommit+':'+n],{cwd:root})),hash,n);
});
test('official release is generic per model and firmware while requiring server device binding',()=>{
 const policy={scope:'server-authorized-initialization',allowedRoles:['super_admin','platform_admin'],requiresDeviceBinding:true};
 for(const object of [pkg,descriptor]){assert.equal(object.executionEnabled,true);assert.equal(object.hardwareValidated,false);assert.equal(object.targetProfile,'veranode-only');assert.deepEqual(object.executionPolicy,policy);assert.equal('hardwareIdentityVerified' in object,false);assert.deepEqual(object.firmware,['2v29']);}
 assert.deepEqual(pkg.binding.fields,['executionId','generation','deviceId','mac','board','firmware','packageSha256','intent']);assert.equal(pkg.authorization.physicalConsent,true);assert.equal(pkg.authorization.encryptedBle,true);
});
test('the only user application is Vera and all runtime bytes and JSON contract remain unchanged',()=>{
 const selector=require('../../bin/veranode-dedicated-target.cjs');assert.deepEqual(pkg.target.files.map(f=>f.name),selector.names);
 for(const f of pkg.target.files.filter(f=>f.name.startsWith('veranode.')))assert.deepEqual(f,previous.target.files.find(p=>p.name===f.name));
 assert.equal(pkg.runtimePackageSha256,previous.runtimePackageSha256);
 assert.deepEqual(pkg.target.files.filter(f=>f.name.endsWith('.info')).map(f=>JSON.parse(Buffer.from(f.base64,'base64')).id).sort(),['boot','veranode']);
 const launcher=pkg.target.files.find(f=>f.name==='launch.app.js');assert.equal(launcher.sha256,sha(cp.execFileSync('git',['show',pkg.sourceCommit+':initialization/zero/launcher.js'],{cwd:root})));
});
test('support integrity, boot commit ordering and public bootstrap expressions remain coherent',()=>{
 const t=pkg.bootstrap.find(f=>f.name==='vz.target.js'),data=JSON.parse(Buffer.from(t.base64,'base64').toString().slice(8).trim().replace(/;$/,''));
 assert.equal(data.fingerprint,pkg.target.fingerprint);assert.equal(data.stagingBytes,pkg.target.stagingBytes);
 for(const row of data.supportFiles)assert.equal(row.sha256,pkg.bootstrap.find(f=>f.name===row.name).sha256);
 assert.equal(pkg.target.installOrder.length,13);assert.equal(pkg.target.installOrder.at(-1),'.bootcde');assert.equal(pkg.target.installOrder.includes('.boot0'),false);assert.equal(pkg.recovery.bootCommitLast,'.boot0');assert.equal(pkg.recovery.eraseAll,false);
 for(const prefix of ['feedbackBootstrap','uiBootstrap'])assert.equal(sha(Buffer.from(pkg[prefix+'Expression'])),pkg[prefix+'Sha256']);
 assert.ok(Buffer.from(pkg.target.files.find(f=>f.name==='.boot0').base64,'base64').toString().includes("read('0vz.boot.js')"));
});
test('all three official Vera-only assets reproduce exactly from the declared source',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vera-only-official-'));
 try{const r=require('../../bin/build-veranode-zero.cjs').build(tmp,{sourceCommit:pkg.sourceCommit,targetProfile:'veranode-only'});for(const name of ['initialize.json','descriptor.json','source-manifest.json'])assert.deepEqual(fs.readFileSync(path.join(path.dirname(r.path),name)),fs.readFileSync(path.join(dir,name)));}
 finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
