const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {build}=require('../../bin/build-veranode-upgrade.cjs');
test('preserving upgrade is reproducible, distinct from first install and binds every source/destination byte',()=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'vera-upgrade-')),r=build(output),again=build(output);assert.equal(r.sha256,again.sha256);assert.equal(r.plan.eraseAllowed,false);assert.equal(r.plan.preserveSamples,true);assert.equal(r.plan.preserveProfile,true);
 assert.equal(r.plan.mode,'preserving-upgrade');assert.equal(r.plan.sources.length,2);assert.equal(r.plan.target.files.length,8);assert.equal(r.plan.maintenance.files.length,4);
 for(const f of [...r.plan.target.files,...r.plan.maintenance.files]){const b=Buffer.from(f.base64,'base64');assert.equal(b.length,f.size);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),f.sha256);}
 const seen=new Set(r.plan.target.files.map(f=>f.name));for(const s of r.plan.sources){assert.equal(s.files.length,8);for(const f of s.files)assert.ok(seen.has(f.name));}
 assert.equal(r.descriptor.executionEnabled,false);assert.equal(r.plan.hardwareValidated,false);
 fs.writeFileSync(r.path,'changed');assert.throws(()=>build(output),/Immutable/);fs.rmSync(output,{recursive:true,force:true});
});
