const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {canonical,build}=require('../../bin/build-veranode-initialize.cjs');
const create=require('../../initialization/veranode/provider.js').create;
const hash=s=>crypto.createHash('sha256').update(Buffer.from(s,'latin1')).digest('hex');
const binding={mac:'DF:B7:68:30:4C:46',operationId:'12345678-1234-4234-8234-123456789abc',packageSha256:'a'.repeat(64),assignment:16};
function fixture(){
  const normal=new Map([['.boot0','original boot'],['.bootcde','loader'],['bootupdate.js','boot update'],['setting.json','{}'],['foreign.app.js','foreign code'],['foreign.info','foreign registry'],['foreign.data','data'],['veranode.policy.json','old profile']]),sf=new Map([['veranode.s0','sample\x00\xff\n']]);
  const payload={'.boot0':'target boot','.bootcde':'loader','bootupdate.js':'boot update','setting.json':'{"clock":"veranode.app.js"}','veranode.app.js':'target clock','veranode.boot.js':'target collector'};
  const files=Object.entries(payload).map(([name,data])=>({name,size:data.length,sha256:hash(data)}));
  let stored=null,isolated=false,encrypted=true,localMac=binding.mac,health=null,crash=null,activated=0,restore=0;
  const progress=[],mutations=[];
  const describe=(name,kind)=>{const raw=(kind==='normal'?normal:sf).get(name);return raw===undefined?null:{name,kind,size:raw.length,sha256:hash(raw)};};
  const env={target:{files,fingerprint:hash(canonical(files)),stagingBytes:150},canonical,hash,
    load:()=>stored?JSON.parse(JSON.stringify(stored)):null,save:state=>{stored=JSON.parse(JSON.stringify(state));},
    mac:()=>localMac,encrypted:()=>encrypted,isolated:()=>isolated,isolate:()=>{isolated=true;normal.set('.boot0','maintenance');},
    inspect:()=>({compatible:true,batteryPercent:80,charging:false,freeBytes:1000000}),
    read:n=>normal.get(n),write:(n,data,o,size)=>{if(crash==='write'){crash=null;normal.set(n,'torn');throw Error('power lost');}if(size!==undefined)normal.set(n,'\xff'.repeat(size));if(o===undefined)normal.set(n,data);else{const old=normal.get(n)||'';normal.set(n,old.slice(0,o)+data+old.slice(o+data.length));}mutations.push(n);},
    inventory:()=>[...[...normal.keys()].filter(n=>!n.startsWith('verai.')).map(n=>describe(n,'normal')),...[...sf.keys()].map(n=>describe(n,'storage-file'))],
    describe,erase:(n,k)=>{(k==='normal'?normal:sf).delete(n);mutations.push('erase:'+n);if(crash==='erase'){crash=null;throw Error('power lost');}},
    unbase64:s=>Buffer.from(s,'base64').toString('latin1'),progress:(...p)=>progress.push(p),settings:()=>JSON.parse(normal.get('setting.json')),
    health:()=>health,activate:()=>activated++,restoreBoot:()=>restore++};
  let provider=create(env);
  function ready(){provider.prepare(binding);const plan=provider.plan();files.forEach((f,i)=>provider.stage(i,0,f.size,Buffer.from(payload[f.name],'latin1').toString('base64')));provider.setConsent(true);return plan;}
  return {env,normal,sf,payload,files,progress,mutations,ready,get p(){return provider;},reboot(){provider=create(env);},set crash(x){crash=x;},set encrypted(x){encrypted=x;},set mac(x){localMac=x;},set health(x){health=x;},get stored(){return stored;},get activated(){return activated;},get restore(){return restore;}};
}
test('real dynamic plan distinguishes foreign software, data and original profile; first stages all targets',()=>{
 const f=fixture();f.p.prepare(binding);const plan=f.p.plan();assert.equal(plan.removeApps.length,2);assert.equal(plan.removeData.length,3);
 assert.ok(plan.removeData.some(x=>x.name==='veranode.s0'&&x.kind==='storage-file'));assert.ok(plan.removeData.some(x=>x.name==='veranode.policy.json'));
 assert.equal(f.p.inventoryPage(0,2).files.length,2);assert.throws(()=>f.p.inventoryPage(0,25),/Pagina/);
 f.p.setConsent(true);assert.throws(()=>f.p.apply(plan.planHash),/Staging/);assert.equal(f.sf.size,1);assert.equal(f.normal.get('foreign.data'),'data');
});
test('dedicated initialization removes planned files, persists home, confirms health separately from time/profile',()=>{
 const f=fixture(),plan=f.ready();while(f.p.status().phase!=='verified')f.p.apply(plan.planHash);
 assert.equal(f.sf.size,0);assert.equal(f.normal.has('foreign.app.js'),false);assert.equal(f.normal.has('veranode.policy.json'),false);
 assert.equal(f.p.verify().home,'veranode.app.js');assert.equal(f.p.activate().softwareReady,false);assert.equal(f.activated,1);
 assert.throws(()=>f.p.confirm(),/Raccolta/);f.health={running:true,scheduled:true,hrmRequested:true};const r=f.p.confirm();assert.equal(r.softwareReady,true);assert.equal(r.profileVerified,false);assert.equal(r.clockVerified,false);
});
test('power loss after erase is recoverable with same journal and never erases unplanned data',()=>{
 const f=fixture(),plan=f.ready();f.crash='erase';assert.throws(()=>f.p.apply(plan.planHash),/power lost/);const done=f.stored.done;
 f.reboot();f.p.recover(binding);assert.throws(()=>f.p.apply(plan.planHash),/Consenso/);f.p.setConsent(true);f.p.apply(plan.planHash);assert.equal(f.p.status().done,done+1);
 while(f.p.status().phase!=='verified')f.p.apply(plan.planHash);assert.equal(f.sf.size,0);assert.equal(f.p.verify().verified,true);
});
test('power loss in target copy repairs from complete staging on the same operation',()=>{
 const f=fixture(),plan=f.ready();while(f.p.status().done<7)f.p.apply(plan.planHash);
 f.crash='write';assert.throws(()=>f.p.apply(plan.planHash),/power lost/);f.reboot();f.p.recover(binding);f.p.setConsent(true);
 while(f.p.status().phase!=='verified')f.p.apply(plan.planHash);assert.equal(f.p.verify().verified,true);
});
test('MAC, consent, encryption, changed inventory and changed plan block destructive work',()=>{
 for(const reason of ['MAC','BLE','consent','inventory','plan']){
  const f=fixture(),p=f.ready();if(reason==='MAC')f.mac='AA:BB:CC:DD:EE:FF';if(reason==='BLE')f.encrypted=false;if(reason==='consent')f.p.setConsent(false);if(reason==='inventory')f.normal.set('new.data','new');
  assert.throws(()=>f.p.apply(reason==='plan'?'b'.repeat(64):p.planHash));assert.equal(f.sf.size,1);assert.equal(f.normal.get('foreign.app.js'),'foreign code');
 }
});
test('cancel works before removal only, and context cannot be substituted during recovery',()=>{
 const f=fixture();f.ready();assert.equal(f.p.cancel().userDataErased,false);assert.equal(f.restore,1);assert.equal(f.sf.size,1);
 const g=fixture(),p=g.ready();g.p.apply(p.planHash);assert.throws(()=>g.p.cancel(),/Rimozioni/);assert.throws(()=>g.p.recover({...binding,assignment:99}),/contesto/);
});
test('corrupt staging and chunk gaps cannot start deletion',()=>{
 const f=fixture();f.p.prepare(binding);f.p.plan();const t=f.files[0];assert.throws(()=>f.p.stage(0,1,t.size,'YQ=='),/Ordine/);
 const g=fixture(),p=g.ready();g.normal.set('verai.f0','bad');assert.throws(()=>g.p.apply(p.planHash),/Staging/);assert.equal(g.sf.size,1);
});
test('immutable package includes complete minimal base, unchanged official JSON/runtime and canonical bootstrap',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vera-init-'));try{
 const a=build(dir),b=build(dir);assert.equal(a.sha256,b.sha256);assert.equal(a.bundle.target.files.length,22);assert.equal(a.bundle.bootstrap.length,6);assert.equal(a.bundle.hardwareValidated,false);
 const official=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../dist/veranode/veranode-0.2.0-dev-545d8915cd396d71/package.json')));
 for(const f of official.files)assert.deepEqual(a.bundle.target.files.find(x=>x.name===f.name),f);
 const settings=JSON.parse(Buffer.from(a.bundle.target.files.find(f=>f.name==='setting.json').base64,'base64'));assert.equal(settings.clock,'veranode.app.js');
 assert.equal(a.bundle.targetFingerprint,crypto.createHash('sha256').update(canonical(a.bundle.target.files.map(({name,size,sha256})=>({name,size,sha256})))).digest('hex'));
 for(const f of [...a.bundle.bootstrap,...a.bundle.target.files])assert.equal(crypto.createHash('sha256').update(Buffer.from(f.base64,'base64')).digest('hex'),f.sha256);
 assert.equal(a.bundle.bootstrap.some(f=>/eraseAll/.test(Buffer.from(f.base64,'base64').toString().replace(/\/\*[^]*?\*\//g,''))),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('recovery bootstrap blocks ordinary app loads, keeps named recovery accessible and does not start sensors',()=>{
 const files=new Map([['verai.app.js','maintenance'],['clock.app.js','old clock']]),s={read:n=>files.get(n)},global={};let uart=0,power=0;
 const c={global,require:n=>{assert.equal(n,'Storage');return s;},NRF:{setServices:()=>uart++},Bluetooth:{setConsole:()=>{}},Bangle:{setOptions:()=>{},setLCDTimeout:()=>{},setLCDPower:()=>power++,setBacklight:()=>{},setLCDBrightness:()=>{},setLocked:()=>{}}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../initialization/veranode/recovery.js'),'utf8'),c);
 assert.equal(global.VeraDedicatedRecovery,true);assert.equal(s.read('clock.app.js'),'maintenance');assert.equal(s.read('verai.app.js'),'maintenance');assert.equal(global.VeraInitializeRead('clock.app.js'),'old clock');assert.equal(uart,1);assert.equal(power,1);
});
test('actual Flash adapter persists immutable plan once and uses checksum journal fallback; corrupt plan fails closed',()=>{
 const f=fixture(),map=f.normal,sf=f.sf,global={VeraDedicatedRecovery:true};
 map.set('verai.recovery.js','recovery');
 const s={read:(n,o,l)=>{const b=map.get(n);return b===undefined?b:o===undefined?b:b.substr(o,l);},
  write:(n,b,o,size)=>{if(size!==undefined)map.set(n,'\xff'.repeat(size));if(o===undefined)map.set(n,b);else{const old=map.get(n)||'';map.set(n,old.slice(0,o)+b+old.slice(o+b.length));}return true;},
  list:(_r,opt)=>opt.sf?[...sf.keys()].map(n=>n+'\x01'):[...map.keys()],getStats:()=>({freeBytes:2000000}),readJSON:n=>{try{return JSON.parse(map.get(n));}catch{return;}},
  erase:n=>map.delete(n),open:n=>{let offset=0;return {read:l=>{const b=sf.get(n);if(!b||offset>=b.length)return undefined;const r=b.substr(offset,l);offset+=r.length;return r;},erase:()=>sf.delete(n)};}};
 const c={global,exports:{},require:n=>n==='Storage'?s:n==='crypto'?{SHA256:x=>crypto.createHash('sha256').update(Buffer.from(x,'latin1')).digest()}:f.env.target,
  Uint8Array,NRF:{getSecurityStatus:()=>({encrypted:true}),getAddress:()=>binding.mac},process:{env:{BOARD:'BANGLEJS2',VERSION:'2v29'}},
  E:{getBattery:()=>90},Bangle:{isCharging:()=>true},atob:x=>Buffer.from(x,'base64').toString('latin1'),setTimeout:()=>0};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../initialization/veranode/platform.js'),'utf8'),c);
 const p=c.exports.create(),plan={binding,targetFingerprint:'f',files:[],removeApps:[],removeData:[],replace:[]},state={binding,phase:'staging',staged:[],plan,planHash:hash(canonical(plan))};
 p.save(state);const initial=map.get('verai.plan');state.done=1;p.save(state);assert.equal(map.get('verai.plan'),initial);
 map.set('verai.state0','torn');assert.equal(p.load().phase,'staging');map.set('verai.plan','corrupt');assert.throws(()=>p.load());
 assert.equal(p.load(false).phase,'staging','normal boot reads small checkpoint only');map.set('verai.state1','torn');assert.throws(()=>p.load(),/Registro/);
});
test('actual recovery plus standard bootloader opens maintenance and button preserves physical consent UI',()=>{
 const f=fixture();f.ready();const files=f.normal,events={},graphics=new(require('./graphics.cjs').Graphics)();let ui;
 files.set('verai.app.js',fs.readFileSync(path.resolve(__dirname,'../../initialization/veranode/app.js'),'utf8'));
 files.set('setting.json',JSON.stringify({clock:'foreign.app.js'}));
 const s={read:n=>files.get(n),readJSON:n=>{try{return JSON.parse(files.get(n));}catch{return;}},writeJSON:(n,v)=>files.set(n,JSON.stringify(v)),list:r=>[...files.keys()].filter(n=>r.test(n))};
 const context=vm.createContext({require:n=>n==='Storage'?s:n==='verai.platform.js'?{create:()=>f.env}:n==='verai.provider.js'?{create}:null,
  NRF:{setServices:()=>{},on:(e,fn)=>events[e]=fn},Bluetooth:{setConsole:()=>{}},Bangle:{setOptions:()=>{},setLCDTimeout:()=>{},setLCDPower:()=>{},setBacklight:()=>{},setLCDBrightness:()=>{},setLocked:()=>{},setUI:x=>ui=x},g:graphics,Math,E:{showMessage:()=>{throw Error('Unexpected failure screen');}}});context.global=context;
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../initialization/veranode/recovery.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../apps/boot/bootloader.js'),'utf8'),context);
 assert.equal(context.VeraDedicatedRecovery,true);assert.equal(typeof context.VeraInitialize.stage,'function');assert.ok(ui);
 ui.btn();assert.equal(context.VeraInitialize.status().consent,false);ui.touch(1,{y:160});assert.equal(context.VeraInitialize.status().consent,true);
 ui.btn();assert.equal(context.VeraInitialize.status().consent,true);events.disconnect();assert.equal(context.VeraInitialize.status().consent,false);
});
test('dedicated guard blocks partial initialization but allows activation and completed ordinary boot',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../../initialization/veranode/guard.js'),'utf8');
 for(const phase of ['applying','staging','activation-pending','complete','cancelled']){
  const context={global:{},require:n=>n==='Storage'?{read:()=> 'global.RecoveryRan=true;'}:{create:()=>({load:includePlan=>{assert.equal(includePlan,false);return {phase};}})}};
  vm.runInNewContext(source,context);assert.equal(context.global.RecoveryRan===true,['applying','staging'].includes(phase));
  if(context.global.RecoveryRan)assert.equal(context.global.VeraNode.state.running,false);
 }
});
test('peripheral bonding request is non destructive, never trusts bonded/Promise alone, and times out visibly',async()=>{
 let encrypted=false,resolveBond,bondCalls=0,writes=0;const timers=[];
 const c={global:{},exports:{},require:n=>n==='Storage'?{read:()=>undefined,write:()=>writes++}:n==='crypto'?{SHA256:x=>crypto.createHash('sha256').update(Buffer.from(x,'latin1')).digest()}:fixture().env.target,
  Uint8Array,NRF:{getSecurityStatus:()=>({connected:true,encrypted,bonded:true}),startBonding:force=>{assert.equal(force,false);bondCalls++;return new Promise(r=>resolveBond=r);},setSecurity:()=>{throw Error('Do not replace security policy');}},
  atob:x=>Buffer.from(x,'base64').toString('latin1'),setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../initialization/veranode/platform.js'),'utf8'),c);
 const e=c.exports.create(),p=create(e);assert.equal(p.requestSecurity().state,'requested');assert.equal(bondCalls,1);p.requestSecurity();assert.equal(bondCalls,1);
 assert.throws(()=>p.prepare(binding),/cifrato/);resolveBond();await Promise.resolve();assert.equal(p.securityStatus().state,'awaiting-encryption');assert.equal(writes,0);
 timers[0]();assert.equal(p.securityStatus().state,'timed-out');assert.match(p.securityStatus().error,/telefono/);assert.throws(()=>p.prepare(binding),/cifrato/);
 encrypted=true;assert.equal(p.securityStatus().state,'encrypted');assert.equal(p.requestSecurity().encrypted,true);assert.equal(bondCalls,1);assert.equal(writes,0);
});
test('all new device code avoids unsupported Espruino bounded regex quantifiers',()=>{
 const acorn=require('acorn');
 for(const file of ['app.js','guard.js','platform.js','provider.js','recovery.js']){
  const tree=acorn.parse(fs.readFileSync(path.resolve(__dirname,'../../initialization/veranode',file),'utf8'),{ecmaVersion:2015});
  function walk(n){if(!n||typeof n!=='object')return;if(n.regex)assert.doesNotMatch(n.regex.pattern,/\{\d+(,\d*)?\}/,file);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
  walk(tree);
 }
});
