const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'initialization/zero');
const hash=x=>crypto.createHash('sha256').update(Buffer.from(x,'latin1')).digest('hex');
const parent=JSON.parse(fs.readFileSync(path.join(root,'dist/veranode-initialize/veranode-initialize-1-866f85f37a599201/initialize.json')));
const payload=Object.fromEntries(parent.target.files.map(f=>[f.name,f.name==='setting.json'?'{"clock":"veranode.app.js","clockHasWidgets":false}':'new:'+f.name]));
const target={files:Object.entries(payload).map(([name,b])=>({name,size:b.length,sha256:hash(b)}))};target.stagingBytes=Object.values(payload).reduce((n,b)=>n+b.length,0);target.fingerprint=hash(JSON.stringify(target.files));
const binding={executionId:'12345678-1234-4234-8234-123456789abc',generation:'abcdef12-1234-4234-8234-123456789abc',deviceId:97,mac:'D1:4D:6D:D2:E0:75',board:'BANGLEJS2',firmware:'2v29',packageSha256:'a'.repeat(64),intent:'initialize-from-zero'};
test('staging allocates its full size with the first block and can restart a partial file',()=>{
 const contents={...payload,'.bootcde':'x'.repeat(1304)},f=fixture('factory',contents,'app-confirmed');
 f.p.prepare(binding,f.env.checkpointDigest());const index=Object.keys(contents).indexOf('.bootcde'),bytes=contents['.bootcde'];
 const first=Buffer.from(bytes.slice(0,384)).toString('base64');
 f.p.stage(index,0,bytes.length,first);assert.equal(f.files.get('vz.f'+index).length,1304);
 f.reboot();assert.throws(()=>f.p.stage(index,384,bytes.length,first),/Ordine/);
 for(let offset=0;offset<bytes.length;offset+=384)f.p.stage(index,offset,bytes.length,Buffer.from(bytes.slice(offset,offset+384)).toString('base64'));
 assert.equal(f.files.get('vz.f'+index),bytes);assert.equal(f.p.status().stagedFiles,1);assert.equal(f.p.status().wipeConsumed,false);
});
function fixture(mode='factory',selectedPayload=payload,authorizationMode){
 const payload=selectedPayload,target={files:Object.entries(payload).map(([name,b])=>({name,size:b.length,sha256:hash(b)}))};target.stagingBytes=Object.values(payload).reduce((n,b)=>n+b.length,0);target.fingerprint=hash(JSON.stringify(target.files));
 const files=new Map([['.boot0','old boot'],['.bootcde','unknown loader'],['.boot1','alternate'],['.varimg','old image'],['bootupdate.js','old update'],['foreign.app.js','old app'],['setting.json','old settings']]),sf=new Map(),sfChunks=new Map(),log=[],feedback=[],timers=[],intervals=[],drawn=[];
 if(mode==='vera'){files.set('veranode.core.js','old Vera');files.set('veranode.policy.json','old policy');sf.set('veranode.s0','sample-data');}
 if(mode==='partial'){files.set('verai.state0','broken legacy checkpoint');files.set('verai.plan','old plan');files.set('verai.f0','partial');files.set('veram.state1','old upgrade');sf.set('veranode.s0','old samples');}
 const sources=[['vz.provider.js','provider.js'],['vz.platform.js','platform.js'],['vz.recovery.js','recovery.js'],['vz.app.js','app.js'],['vz.display.js','display.js'],['0vz.boot.js','guard.js']];
 for(const [name,source]of sources)files.set(name,fs.readFileSync(path.join(dir,source),'utf8'));
 const localTarget={...target,authorizationMode:authorizationMode,supportFiles:sources.map(([name])=>({name,size:files.get(name).length,sha256:hash(files.get(name))}))};
 files.set('vz.target.js','exports='+JSON.stringify(localTarget)+';');
 let context,env,provider,crashAt=0,mutations=0,battery=99,free=10000000,encrypted=true,firmware='2v29',health=null,clockMs=1800000000000;
 function mutate(kind,name,fn){fn();log.push({kind,name});mutations++;if(crashAt&&mutations===crashAt){crashAt=0;throw Error('power lost after '+kind+':'+name);}}
 const storage={read:(n,o,l)=>{const b=files.get(n);return b===undefined?b:o===undefined?b:b.substr(o,l);},write:(n,b,o,size)=>{mutate('write',n,()=>{if(size!==undefined)files.set(n,'\xff'.repeat(size));if(o===undefined||(o===0&&size===undefined))files.set(n,b);else{const old=files.get(n)||'';if(o+b.length>old.length)throw Error('Too much data for file size');files.set(n,old.slice(0,o)+b+old.slice(o+b.length));}});return true;},erase:n=>{if(sfChunks.has(n))mutate('erase-chunk',n,()=>sfChunks.delete(n));else if(n.endsWith('\x01')&&sf.has(n.slice(0,-1)))mutate('erase-sf',n.slice(0,-1),()=>sf.delete(n.slice(0,-1)));else mutate('erase',n,()=>files.delete(n));},
  list:(_regex,opts)=>opts&&opts.sf?[...new Set([...sf.keys(),...[...sfChunks.keys()].map(n=>n.slice(0,-1))])]:opts&&opts.sf===false?[...files.keys()]:[...files.keys(),...[...sf.keys()].map(n=>n+'\x01'),...sfChunks.keys()],getStats:()=>({freeBytes:free}),
  open:(n,_mode)=>({read:()=>{throw Error('old StorageFile content must not be loaded');},erase:()=>{if(sf.has(n))mutate('erase-sf',n,()=>sf.delete(n));for(let i=1;sfChunks.has(n+String.fromCharCode(i));i++)mutate('erase-chunk',n+String.fromCharCode(i),()=>sfChunks.delete(n+String.fromCharCode(i)));}})};
 const graphics={getWidth:()=>176};for(const n of ['reset','setBgColor','clear','setFontAlign','setColor','setFont','fillCircle','fillRect','flip'])graphics[n]=()=>graphics;
 graphics.drawString=(s)=>{drawn.push(s);return graphics;};
 const bangle={setLCDPower:()=>{},setBacklight:()=>{},setLCDBrightness:()=>{},setLocked:()=>{},setOptions:()=>{},setLCDTimeout:()=>{},setUI:ui=>{bangle.ui=ui;}};
 function boot(isolated){
  const cache={};const global={};if(isolated)global.VeraZeroRecovery=true;
  const load=n=>{if(n==='vz.target.js')return localTarget;if(n==='Storage')return storage;if(n==='crypto')return {SHA256:b=>crypto.createHash('sha256').update(Buffer.from(b,'latin1')).digest()};if(cache[n])return cache[n];const code=files.get(n);if(code===undefined)throw Error('Module absent '+n);const module={exports:{}};context.__module=module;vm.runInContext('(function(exports){'+code+'\n})(__module.exports)',context);return cache[n]=module.exports;};
  context=vm.createContext({global,require:load,exports:{},Uint8Array,Number:{},getTime:()=>clockMs/1000,setTime:sec=>{clockMs=sec*1000;},process:{env:{BOARD:'BANGLEJS2',VERSION:firmware}},NRF:{getAddress:()=>binding.mac+' random',getSecurityStatus:()=>({connected:true,encrypted,bonded:encrypted}),startBonding:()=>Promise.resolve(),setServices:()=>{},on:()=>{}},Bluetooth:{setConsole:()=>{}},E:{getBattery:()=>battery,showMessage:s=>drawn.push(s)},Bangle:bangle,g:graphics,atob:s=>Buffer.from(s,'base64').toString('latin1'),setTimeout:fn=>{timers.push(fn);return timers.length;},setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval:()=>{}});
  global.load=()=>{};env=load('vz.platform.js').create();const progress=env.progress;env.progress=(...p)=>{feedback.push(p);progress(...p);};env.health=()=>health;provider=load('vz.provider.js').create(env);var st=provider.status();if(st.phase==='activation-pending'||st.phase==='complete'){global.VeraZeroBootGeneration=st.binding.generation;global.VeraZeroBootExecutionId=st.binding.executionId;}
 }
 boot(false);
 function stageAll(){for(const [i,f]of target.files.entries()){const b=payload[f.name];for(let o=0;o<b.length;o+=384)provider.stage(i,o,b.length,Buffer.from(b.slice(o,o+384),'latin1').toString('base64'));}}
 function approve(){if(authorizationMode!=='app-confirmed')provider.setConsent(true);}
 function prepare(){approve();provider.prepare(binding,env.checkpointDigest());stageAll();}
 function finish(){
  let st=provider.status();if(st.phase==='unprepared')prepare();else{provider.recover(binding);approve();if(!['activating','activation-pending','complete'].includes(st.phase))stageAll();}
  if(!provider.status().wipeConsumed)provider.beginWipe(target.fingerprint);
  for(let guard=0;['quarantining','wiping','installing'].includes(provider.status().phase);guard++){
   if(guard>5000)throw Error('loop');if(provider.status().phase==='wiping'&&!env.isolated()){boot(true);provider.recover(binding);approve();}provider.step();
  }
  if(['verified','activating'].includes(provider.status().phase)){approve();if(provider.status().phase==='verified')provider.syncTime(binding,1800000000000,'11111111-1234-4234-8234-123456789abc');provider.activate();}
  if(provider.status().phase==='activation-pending'||provider.status().phase==='complete'){context.global.VeraZeroBootGeneration=binding.generation;context.global.VeraZeroBootExecutionId=binding.executionId;health={running:true,scheduled:true,hrmRequested:true,sampleCount:0};provider.confirm(binding);}
  return provider.status();
 }
 return {files,sf,sfChunks,log,feedback,timers,intervals,drawn,bangle,prepare,stageAll,finish,boot,reboot:()=>boot(files.get('.boot0')===files.get('vz.recovery.js')),get p(){return provider;},get env(){return env;},get context(){return context;},set crash(n){crashAt=mutations+n;},set battery(n){battery=n;},set free(n){free=n;},set encrypted(v){encrypted=v;},set firmware(v){firmware=v;},get mutations(){return mutations;},set health(v){health=v;}};
}

test('zero initialization works from factory, existing Vera, partial legacy and unknown boot without eraseAll',()=>{
 for(const mode of ['factory','vera','partial']){const f=fixture(mode),result=f.finish();assert.equal(result.phase,'complete');assert.equal(result.installed,22);assert.equal(result.wipeConsumed,true);assert.equal(f.sf.size,0);assert.equal(f.files.has('veranode.policy.json'),false);assert.equal(f.files.has('foreign.app.js'),false);assert.equal(f.files.get('setting.json'),payload['setting.json']);
  for(const [n,b]of Object.entries(payload))assert.equal(f.files.get(n),b,n);
  assert.equal(f.files.has('verai.state0'),false);assert.equal(f.files.has('veram.state1'),false);
  for(const n of ['.boot1','.boot2','.boot3','.bootrst','.bootPowerOn','.varimg'])assert.equal(f.files.has(n),false,n);
 }
});

test('more than 128 files and a large StorageFile are removed without reading their contents',()=>{
 const f=fixture('vera');for(let i=0;i<180;i++)f.files.set('old'+i+'.data','value');f.sf.set('oldlarge','x'.repeat(180000));
 assert.equal(f.finish().phase,'complete');assert.equal(f.sf.size,0);assert.equal([...f.files.keys()].some(n=>n.startsWith('old')),false);
});

test('every persisted write/erase interruption resumes the same execution without another wipe',()=>{
 const setup=()=>{const f=fixture('partial');for(let i=1;i<=3;i++)f.sfChunks.set('raw'+String.fromCharCode(i),'chunk'+i);return f;};
 const base=setup();base.finish();const operations=base.mutations;
 for(let cut=1;cut<=operations;cut++){
  const f=setup();f.crash=cut;let interrupted=false;
  try{f.finish();}catch(err){assert.match(String(err),/power lost/);interrupted=true;}
  assert.equal(interrupted,true,'cut '+cut);f.reboot();let final;try{final=f.finish();}catch(err){throw Error('cut '+cut+' phase '+f.p.status().phase+': '+err.message);}assert.equal(final.phase,'complete','cut '+cut);
  for(const n of ['foreign.app.js','veranode.s0','verai.state0'])assert.equal(f.log.filter(x=>x.name===n&&x.kind.startsWith('erase')).length,1,'erase only once '+cut+':'+n);
  assert.equal(f.sfChunks.size,0,'all raw chunks gone '+cut);for(let i=1;i<=3;i++)assert.equal(f.log.filter(x=>x.kind==='erase-chunk'&&x.name==='raw'+String.fromCharCode(i)).length,1,'raw chunk erased once '+cut+':'+i);
  assert.equal(final.binding.executionId,binding.executionId);
 }
});

test('a new explicit intent can replace a corrupt or prior zero checkpoint, while stale instances are fenced',()=>{
 const f=fixture('vera');f.files.set('vz.state0','corrupt');f.reboot();assert.equal(f.p.status().phase,'checkpoint-error');
 assert.throws(()=>f.p.prepare(binding,f.env.checkpointDigest()),/Conferma/);assert.equal(f.sf.size,1);
 f.prepare();const old=f.p;f.reboot();f.p.setConsent(true);const next={...binding,executionId:'99999999-1234-4234-8234-123456789abc',generation:'bbbbbbbb-1234-4234-8234-123456789abc'};
 f.p.prepare(next,f.env.checkpointDigest());assert.throws(()=>old.beginWipe(target.fingerprint),/superata/);assert.equal(f.sf.size,1);
 assert.throws(()=>f.p.recover(binding),/altra esecuzione/);assert.equal(f.p.status().binding.generation,next.generation);
});

test('wrong identity, unsupported firmware, low battery, no encryption, changed checkpoint and missing consent cause no wipe',()=>{
 for(const mode of ['battery','space','firmware','encrypted','binding','checkpoint','consent']){
  const f=fixture('vera');f.p.setConsent(true);if(mode==='battery')f.battery=10;if(mode==='space')f.free=10;if(mode==='firmware')f.firmware='2v30';if(mode==='encrypted')f.encrypted=false;
  if(mode==='firmware')f.reboot();if(mode==='consent')f.p.setConsent(false);const before=f.mutations;
  assert.throws(()=>f.p.prepare(mode==='binding'?{...binding,mac:'AA:BB:CC:DD:EE:FF'}:binding,mode==='checkpoint'?'0'.repeat(64):f.env.checkpointDigest()));assert.equal(f.mutations,before);assert.equal(f.sf.size,1);
 }
 const f=fixture();f.prepare();f.p.setConsent(false);assert.throws(()=>f.p.beginWipe(target.fingerprint),/Consenso/);assert.equal(f.p.status().wipeConsumed,false);
});

test('wipe request replay never restarts, corrupt staging can be retransferred without resetting progress',()=>{
 const f=fixture('vera');f.prepare();f.p.beginWipe(target.fingerprint);let st=f.p.status();for(let n=0;n<12;n++){if(st.phase==='wiping'&&!f.env.isolated()){f.boot(true);f.p.recover(binding);f.p.setConsent(true);}st=f.p.step();}
 const before=st.removed;f.p.beginWipe(target.fingerprint);assert.equal(f.p.status().removed,before);
 f.files.set('vz.f0','corrupt');f.reboot();f.p.recover(binding);f.p.setConsent(true);assert.throws(()=>f.p.step(),/Staging/);f.stageAll();assert.equal(f.p.status().removed,before);assert.equal(f.finish().phase,'complete');
});

test('boot display includes every stage, heartbeat, touch consent and errors without closing on button',()=>{
 const f=fixture();const c=f.context;vm.runInContext(fs.readFileSync(path.join(dir,'display.js'),'utf8'),c);const display=c.exports.create();c.global.VeraZeroDisplay=display;
 for(const phase of ['preparing','upload','quarantining','wiping','installing','verified','activating','activation-pending','complete','paused','error'])display.set(phase,1,10,phase==='error'?'Errore verificabile':'');
 assert.equal(f.intervals.length,1);f.intervals[0]();assert.ok(f.drawn.includes('Formatta contenuti'));assert.ok(f.drawn.includes('Errore verificabile'));assert.ok(f.drawn.includes('Collegamento perso'));
 c.global.VeraZeroRecovery=true;vm.runInContext(fs.readFileSync(path.join(dir,'app.js'),'utf8'),c);assert.ok(f.bangle.ui);f.bangle.ui.btn();f.bangle.ui.touch(0,{x:88,y:160});assert.equal(c.global.VeraZero.status().consent,true);
});

test('confirmation cannot claim physical sensor samples, and refuses a stopped collector',()=>{
 const f=fixture();f.prepare();f.p.beginWipe(target.fingerprint);while(f.p.status().phase!=='verified'){if(f.p.status().phase==='wiping'&&!f.env.isolated()){f.boot(true);f.p.recover(binding);f.p.setConsent(true);}f.p.step();}f.p.syncTime(binding,1800000000000,'11111111-1234-4234-8234-123456789abc');f.p.activate();
 assert.throws(()=>f.p.confirm(binding),/Riavvio/);f.context.global.VeraZeroBootGeneration=binding.generation;f.context.global.VeraZeroBootExecutionId=binding.executionId;assert.throws(()=>f.p.confirm(binding),/raccolta/);f.health={running:true,scheduled:true,hrmRequested:true,sampleCount:0};const result=f.p.confirm(binding);assert.equal(result.softwareReady,true);assert.equal(result.sensorSamplesVerified,false);assert.equal(result.clockVerified,false);
});


test('interrupted StorageFile erasure removes remaining numbered chunks after chunk one is already gone',()=>{
 const base=fixture();for(let i=1;i<=4;i++)base.sfChunks.set('large'+String.fromCharCode(i),'chunk'+i);
 base.prepare();base.p.beginWipe(target.fingerprint);
 while(base.p.status().phase!=='wiping'){base.p.step();}
 base.boot(true);base.p.recover(binding);base.p.setConsent(true);
 while(!base.log.some(x=>x.kind==='erase-chunk'))base.p.step();
 const first=base.log.find(x=>x.kind==='erase-chunk');assert.equal(first.name,'large'+String.fromCharCode(1));
 base.reboot();assert.equal(base.finish().phase,'complete');assert.equal(base.sfChunks.size,0);
 for(let i=1;i<=4;i++)assert.equal(base.log.filter(x=>x.kind==='erase-chunk'&&x.name==='large'+String.fromCharCode(i)).length,1);
});

test('factory consent is mounted before prepare and survives the side button with an existing provider',()=>{
 const f=fixture();f.context.global.VeraZero=f.p;
 vm.runInContext(fs.readFileSync(path.join(dir,'app.js'),'utf8'),f.context);
 assert.ok(f.bangle.ui);assert.equal(f.p.status().phase,'unprepared');
 f.bangle.ui.btn();assert.equal(f.p.status().consent,false);
 f.bangle.ui.touch(0,{x:88,y:160});assert.equal(f.p.status().consent,true);
 f.bangle.ui.btn();assert.equal(f.p.status().consent,true);
});
test('the actual cold boot guard stamps the completed generation, and never stamps staging',()=>{
 const f=fixture();f.finish();delete f.context.global.VeraZeroBootGeneration;delete f.context.global.VeraZeroBootExecutionId;
 vm.runInContext(fs.readFileSync(path.join(dir,'guard.js'),'utf8'),f.context);
 assert.equal(f.context.global.VeraZeroBootGeneration,binding.generation);
 assert.equal(f.context.global.VeraZeroBootExecutionId,binding.executionId);
 const g=fixture();g.prepare();vm.runInContext(fs.readFileSync(path.join(dir,'guard.js'),'utf8'),g.context);
 assert.equal(g.context.global.VeraZeroBootGeneration,undefined);assert.equal(g.context.global.VeraNode.state.running,false);
});
test('a valid hash cannot make a malformed checkpoint executable and one torn bank falls back',()=>{
 const f=fixture();f.prepare();const prior=f.env.load();f.files.set('vz.state'+prior.sequence%2,'torn');f.reboot();assert.equal(f.p.status().phase,'staging');
 const bad={...f.env.load(),installed:-1};f.env.save(bad);f.reboot();assert.equal(f.p.status().phase,'checkpoint-error');
 const before=f.mutations;assert.throws(()=>f.p.beginWipe(target.fingerprint));assert.equal(f.mutations,before);
});

test('the same zero protocol installs a minimal Vera-only target without stock apps or old data',()=>{
 const selected=require('../../bin/veranode-dedicated-target.cjs').create(parent.target.files,fs.readFileSync(path.join(dir,'launcher.js')));
 const data=Object.fromEntries(selected.map(f=>[f.name,Buffer.from(f.base64,'base64').toString('latin1')]));
 const f=fixture('partial',data);f.files.set('setting.app.js','old Settings');f.files.set('launch.info','old app list');
 assert.equal(f.finish().phase,'complete');assert.equal(f.p.status().installed,14);
 assert.equal(f.files.has('setting.app.js'),false);assert.equal(f.files.has('launch.info'),false);assert.equal(f.sf.size,0);
 assert.equal(f.files.get('launch.app.js'),data['launch.app.js']);assert.equal(f.files.get('veranode.app.js'),data['veranode.app.js']);
});

 test('consent uses a dedicated screen and a large matching touch target, replacing stale feedback',()=>{
 const f=fixture();f.context.global.VeraZero=f.p;let disposed=false;
 f.context.global.VeraZeroDisplay={dispose:()=>{disposed=true;},enableConsent:()=>{},setConsent:()=>{},set:()=>{},draw:()=>{}};
 vm.runInContext(fs.readFileSync(path.join(dir,'app.js'),'utf8'),f.context);
 const d=f.context.global.VeraZeroDisplay;assert.equal(disposed,true);assert.equal(d.status().consentVisible,true);
 assert.ok(f.drawn.includes('Conferma richiesta'));assert.ok(f.drawn.includes('CONSENTI'));
 f.bangle.ui.touch(0,{x:88,y:80});assert.equal(f.p.status().consent,false);
 f.bangle.ui.touch(0,{x:0,y:150});assert.equal(f.p.status().consent,false);
 f.bangle.ui.btn();assert.equal(d.status().consentVisible,true);assert.equal(f.p.status().consent,false);
 f.bangle.ui.touch(0,{x:88,y:130});assert.equal(f.p.status().consent,true);assert.equal(d.status().consentVisible,false);
 });

test('app-confirmed initialization finishes with no watch consent and a new intent replaces every previous state',()=>{
 const f=fixture('factory',undefined,'app-confirmed');f.context.global.VeraZero=f.p;
 vm.runInContext(fs.readFileSync(path.join(dir,'app.js'),'utf8'),f.context);
 assert.equal(f.context.global.VeraZeroDisplay.canConsent(),false);
 assert.equal(f.drawn.includes('CONSENTI'),false);
 assert.equal(f.p.status().physicalConsentRequired,false);assert.equal(f.p.status().consent,false);
 assert.equal(f.finish().phase,'complete');assert.equal(f.p.status().consent,false);
 const next={...binding,executionId:'eeeeeeee-1234-4234-8234-123456789012',generation:'ffffffff-1234-4234-8234-123456789012'};
 const st=f.p.prepare(next,f.env.checkpointDigest());assert.equal(st.phase,'prepared');assert.equal(st.wipeConsumed,false);
 assert.equal(st.binding.executionId,next.executionId);
 f.encrypted=false;assert.throws(()=>f.p.beginWipe(target.fingerprint),/cifrato/);
});

test('a fresh app intent replaces incomplete or corrupt attempts without user interaction on the watch',()=>{
 for(const prior of ['prepared','staging','quarantining','wiping','installing','verified','corrupt']){
  const f=fixture('factory',undefined,'app-confirmed');
  if(prior==='corrupt'){f.files.set('vz.state0','broken');f.reboot();}
  else {
   f.p.prepare(binding,f.env.checkpointDigest());
   if(prior!=='prepared'){f.stageAll();}
   if(!['prepared','staging'].includes(prior)){
    f.p.beginWipe(target.fingerprint);
    while(f.p.status().phase!==prior){
     if(f.p.status().phase==='wiping'&&!f.env.isolated()){f.boot(true);f.p.recover(binding);}
     f.p.step();
    }
   }
  }
  const next={...binding,executionId:'eeeeeeee-1234-4234-8234-123456789012',generation:'ffffffff-1234-4234-8234-123456789012'};
  const st=f.p.prepare(next,f.env.checkpointDigest());
  assert.equal(st.phase,'prepared',prior);assert.equal(st.wipeConsumed,false,prior);assert.equal(st.stagedFiles,0,prior);assert.equal(st.consent,false,prior);
 }
});

