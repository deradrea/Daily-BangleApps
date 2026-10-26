/* Native Espruino Storage regression; radio/identity and reboot are substituted. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifest=require('../test/veranode/fixtures/espruino-emulator-2v29.json');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function main(){
 const dir=process.env.VERA_ESPRUINO_EMULATOR_DIR||path.join(os.tmpdir(),'vera-espruino-2v29',manifest.commit);
 let readyResolve,output='';const ready=new Promise(resolve=>readyResolve=resolve);
 const ctx=vm.createContext({console:{log(){},warn(){},error(){}},require,process,Buffer,__dirname:dir,setTimeout,clearTimeout,setInterval,clearInterval,Module:{noInitialRun:true,onRuntimeInitialized:()=>readyResolve()}});
 for(const [name,hash] of Object.entries(manifest.files)){const source=fs.readFileSync(path.join(dir,name));assert.equal(sha(source),hash);vm.runInContext(source.toString(),ctx,{filename:name});}
 let timer;try{await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Emulator startup timeout')),20000);})]);}finally{clearTimeout(timer);}
 ctx.jsRXCallback=ch=>output+=String.fromCharCode(ch);ctx.jsUpdateGfx=()=>{};ctx.jsInit();let id=0;
 function value(expression){const marker='V_MAINT_'+(++id)+'_';output='';ctx.jsTransmitString('\x10(function(){try{print('+JSON.stringify(marker)+'+JSON.stringify({value:'+expression+'}));}catch(e){print('+JSON.stringify(marker)+'+JSON.stringify({error:String(e)}));}})()\n');ctx.jsStopIdle();const line=output.split(/\r?\n/).find(x=>x.includes(marker+'{'));if(!line)throw Error('Missing reply: '+output.slice(-1000));const result=JSON.parse(line.slice(line.indexOf(marker)+marker.length));if(result.error)throw Error(result.error);return result.value;}
 assert.equal(value('process.env.VERSION'),'2v29');
 for(const [source,name] of [['platform.js','veram.platform.js'],['provider.js','veram.provider.js'],['guard.js','veram.0.boot.js']]){
  const bytes=fs.readFileSync(path.join(root,'maintenance/veranode',source));for(let offset=0;offset<bytes.length;offset+=384)value('require("Storage").write('+JSON.stringify(name)+',atob('+JSON.stringify(bytes.subarray(offset,offset+384).toString('base64'))+'),'+offset+(offset===0?','+bytes.length:'')+')');
 }
 const names=['veranode.clock.js','veranode.app.js','veranode.core.js','veranode.runtime.js','veranode.wire.js','veranode.img','veranode.boot.js','veranode.info'];
 const target='new-data-'.repeat(120),binding={user:'u',scope:'s',mac:'FC:0C:5D:40:F0:AA',assignment:1,targetHash:'a'.repeat(64)};
 value('(function(){global.VeraIsolatedMaintenance=true;var s=require("Storage"),names='+JSON.stringify(names)+';names.forEach(function(n){s.write(n,"old-"+n);});s.write("veranode.policy.json",JSON.stringify({user:"u",scope:"s",mac:'+JSON.stringify(binding.mac)+'}));s.open("veranode.s123","w").write("sample\\x00\\xff");global.e=require("veram.platform.js").create();e.encrypted=function(){return true;};e.activate=function(){global.testActivated=true;};return true;})()');
 const rows=value('e.inventory()');assert.ok(rows.some(f=>f.name==='veranode.s123'&&f.kind==='storage-file'&&f.size>0),'StorageFile base name must be retained');
 const plan={files:names.map(name=>({name,sourceSize:('old-'+name).length,sourceHash:sha('old-'+name),size:target.length,hash:sha(target)}))};
 value('(function(){var state='+JSON.stringify({generation:1,binding,snapshot:'native-snapshot-001',phase:'prepared',plan})+';e.save(state);e.setConsent(true);global.m=require("veram.provider.js").create(e);global.t=m.begin('+JSON.stringify(binding)+',60000,null).token;return true;})()');
 const protectedBefore=value('m.inventory(t).files.filter(function(f){return f.name==="veranode.s123"||f.name==="veranode.policy.json";})');
 for(let offset=0;offset<target.length;offset+=384){value('m.replaceSoftware(t,'+JSON.stringify(names[0])+','+offset+','+target.length+','+JSON.stringify(Buffer.from(target.slice(offset,offset+384)).toString('base64'))+')');if(offset===0)assert.equal(value('require("Storage").read("veram.stage").length'),target.length);}
 assert.equal(value('require("Storage").read('+JSON.stringify(names[0])+')'),target);
 assert.deepEqual(value('m.inventory(t).files.filter(function(f){return f.name==="veranode.s123"||f.name==="veranode.policy.json";})'),protectedBefore);
 const original='old-'+names[0];value('m.replaceSoftware(t,'+JSON.stringify(names[0])+',0,'+original.length+','+JSON.stringify(Buffer.from(original).toString('base64'))+')');assert.equal(value('m.activate(t,true).activationRequested'),true);
 assert.deepEqual(value('e.inventory().filter(function(f){return f.name==="veranode.s123"||f.name==="veranode.policy.json";})'),protectedBefore);
 // A failed target may already have resumed recording. Freeze its CURRENT
 // protected bytes, then restore only the parent software and confirm boot.
 value('(function(){var s=require("Storage"),names='+JSON.stringify(names)+';names.forEach(function(n){s.write(n,'+JSON.stringify(target)+');});s.open("veranode.s123","a").write("new sample after target boot");s.open("veranode.s124","w").write("new segment");var state=e.load();state.phase="prepared";state.mode="rollback-only";state.snapshot="native-recovery-001";state.protected=undefined;state.profileCaptured=undefined;state.collectionWasRunning=false;state.expectedCollectionRunning=true;e.save(state);e.setConsent(true);global.m=require("veram.provider.js").create(e);global.t=m.begin('+JSON.stringify(binding)+',60000,null).token;return true;})()');
 const grown=value('m.inventory(t).files.filter(function(f){return f.kind==="storage-file"||f.name==="veranode.policy.json";})');
 for(const name of names){const raw='old-'+name;value('m.replaceSoftware(t,'+JSON.stringify(name)+',0,'+raw.length+','+JSON.stringify(Buffer.from(raw).toString('base64'))+')');}
 assert.deepEqual(value('m.inventory(t).files.filter(function(f){return f.kind==="storage-file"||f.name==="veranode.policy.json";})'),grown);
 value('m.activate(t,true)');
 value('(function(){NRF.getAddress=function(){return '+JSON.stringify(binding.mac)+';};NRF.getSecurityStatus=function(){return {encrypted:true};};global.VeraNode={health:function(){return {running:true,scheduled:true,hrmRequested:true};}};eval(require("Storage").read("veram.0.boot.js"));return true;})()');
 assert.equal(value('VeraMaintenanceActivation.confirm().result'),'rolled-back');
 assert.equal(value('VeraMaintenanceActivation.confirm().result'),'rolled-back','lost confirmation reply can be retried');
 assert.deepEqual(value('e.inventory().filter(function(f){return f.kind==="storage-file"||f.name==="veranode.policy.json";})'),grown);
 ctx.jsStopIdle();console.log(JSON.stringify({ok:true,interpreter:'2v29',hardware:false,checks:['native-sha-validation','native-storagefile-base-name','native-multiblock-staging','exact-protected-bytes','exact-software-rollback','post-boot-grown-journals-preserved','rollback-boot-confirmed-and-retryable']},null,2));
}
main().then(()=>process.exit(0),error=>{console.error(error.stack||String(error));process.exit(1);});
