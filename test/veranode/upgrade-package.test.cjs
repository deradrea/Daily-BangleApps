const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {build}=require('../../bin/build-veranode-upgrade.cjs');
test('preserving upgrade is reproducible, distinct from first install and binds every source/destination byte',()=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'vera-upgrade-')),r=build(output),again=build(output);assert.equal(r.sha256,again.sha256);assert.equal(r.plan.eraseAllowed,false);assert.equal(r.plan.preserveSamples,true);assert.equal(r.plan.preserveProfile,true);
 assert.equal(r.plan.mode,'preserving-upgrade');assert.equal(r.plan.sources.length,2);assert.equal(r.plan.target.files.length,8);assert.equal(r.plan.maintenance.files.length,4);
 for(const f of [...r.plan.target.files,...r.plan.maintenance.files]){const b=Buffer.from(f.base64,'base64');assert.equal(b.length,f.size);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),f.sha256);}
 const seen=new Set(r.plan.target.files.map(f=>f.name));for(const s of r.plan.sources){assert.equal(s.files.length,8);for(const f of s.files)assert.ok(seen.has(f.name));}
 assert.equal(r.descriptor.executionEnabled,true);assert.equal(r.plan.maintenance.contract.postBootRecovery,true);assert.equal(r.plan.hardwareValidated,false);
 fs.writeFileSync(r.path,'changed');assert.throws(()=>build(output),/Immutable/);fs.rmSync(output,{recursive:true,force:true});
});


test('upgrade provenance and all sidecars are exact committed bytes, with unchanged target and sources',()=>{
 const cp=require('node:child_process'),root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vera-upgrade-git-'));
 try{const r=build(out),p=r.plan,old=JSON.parse(fs.readFileSync(path.join(root,'dist/veranode-upgrade/veranode-upgrade-1-d749066fdad7002d/upgrade.json')));
  assert.deepEqual(p.target,old.target);assert.deepEqual(p.sources,old.sources);assert.deepEqual(p.maintenance.backupExclusions,old.maintenance.backupExclusions);
  assert.deepEqual(p.maintenance.bootloader,old.maintenance.bootloader);
  const init=JSON.parse(fs.readFileSync(path.join(root,'dist/veranode-initialize/veranode-initialize-1-866f85f37a599201/initialize.json')));
  assert.deepEqual(p.maintenance.acceptedBootloaderSha256,init.target.acceptedBootloaderSha256);
  assert.deepEqual(p.maintenance.acceptedBootupdateSha256,init.target.acceptedBootupdateSha256);
  for(const [name,sha]of Object.entries(p.provenance.inputs)){const raw=cp.execFileSync('git',['show',p.provenance.sourceCommit+':'+name],{cwd:root});assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),sha,name);}
  for(const [name,src]of [['veram.provider.js','provider.js'],['veram.platform.js','platform.js'],['veram.0.boot.js','guard.js'],['veram.app.js','app.js']]){
   const raw=cp.execFileSync('git',['show',p.provenance.sourceCommit+':maintenance/veranode/'+src],{cwd:root});assert.equal(Buffer.from(p.maintenance.files.find(f=>f.name===name).base64,'base64').equals(raw),true,name);
   assert.equal(/Number\s*\.\s*(?:isInteger|isFinite|isSafeInteger)\s*\(/.test(raw.toString()),false,name);
  }
  assert.equal(build(out,{sourceCommit:p.provenance.sourceCommit}).sha256,r.sha256);
  assert.equal(r.descriptor.executionEnabled,true);assert.equal(r.descriptor.hardwareValidated,false);
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
