const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const parent=JSON.parse(fs.readFileSync(path.join(root,'dist/veranode-initialize/veranode-initialize-1-866f85f37a599201/initialize.json')));
const launcher=fs.readFileSync(path.join(root,'initialization/zero/launcher.js'));
const selector=require('../../bin/veranode-dedicated-target.cjs');
test('Vera-only target keeps only the dedicated home and essential base, preserving every runtime byte',()=>{
 const original=JSON.stringify(parent.target.files),files=selector.create(parent.target.files,launcher);
 assert.equal(files.length,14);assert.equal(JSON.stringify(parent.target.files),original);
 for(const name of selector.removed)assert.equal(files.some(f=>f.name===name),false,name);
 for(const f of files.filter(f=>f.name.startsWith('veranode.')))assert.deepEqual(f,parent.target.files.find(p=>p.name===f.name));
 assert.deepEqual(files.filter(f=>f.name.endsWith('.info')).map(f=>JSON.parse(Buffer.from(f.base64,'base64')).id).sort(),['boot','veranode']);
 assert.ok(files.reduce((n,f)=>n+f.size,0)<parent.target.stagingBytes);
});
test('dedicated launcher returns to Vera and never writes settings or exposes other apps',()=>{
 const calls=[];const c={global:{VeraNode:{}},require:n=>{assert.equal(n,'Storage');return {read:()=> 'Vera app'};},load:n=>calls.push(n),E:{showMessage:()=>assert.fail('Unexpected error')}};
 vm.runInNewContext(launcher.toString(),c);assert.deepEqual(calls,['veranode.app.js']);
 c.global.VeraNode=null;vm.runInNewContext(launcher.toString(),c);assert.equal(calls[1],undefined);
 c.require=()=>({read:()=>undefined});c.E.showMessage=(s,title)=>calls.push(title);vm.runInNewContext(launcher.toString(),c);assert.equal(calls.at(-1),'VERA');
});
test('dedicated target fails closed on unexpected parent inventory or corrupt bytes',()=>{
 assert.throws(()=>selector.create(parent.target.files.slice(1),launcher),/inventory/);
 const corrupt=structuredClone(parent.target.files);corrupt[0].base64='YQ==';assert.throws(()=>selector.create(corrupt,launcher),/integrity/);
 assert.throws(()=>selector.create([...parent.target.files,parent.target.files[0]],launcher),/inputs/);
});

test('minimal base regenerates boot and runs the unchanged Vera clock and offline collector without stock menus',async()=>{
 const {platform}=require('./helpers.cjs'),core=require('../../apps/veranode/core.js'),{Graphics}=require('./graphics.cjs');
 const f=platform(core),graphics=new Graphics(),files=selector.create(parent.target.files,launcher);
 for(const file of files)f.storage.normal.set(file.name,Buffer.from(file.base64,'base64').toString('latin1'));
 const originalWrite=f.storage.write.bind(f.storage);
 f.storage.write=(n,b,o,size)=>{b=String(b);if(size!==undefined)f.storage.normal.set(n,'\xff'.repeat(size));if(o===undefined)originalWrite(n,b);else{const old=f.storage.read(n)||'';originalWrite(n,old.slice(0,o)+b+old.slice(o+b.length));}return true;};
 f.storage.writeJSON=(n,v)=>f.storage.write(n,JSON.stringify(v));f.storage.hash=()=>17;
 f.storage.list=(re,opts)=>{const rows=opts&&opts.sf?[...f.storage.files.keys()].map(n=>n+'\x01'):[...f.storage.normal.keys()];return rows.filter(n=>!re||re.test(n));};
 const modules={};let input,screen=true;
 function moduleFor(n){if(!modules[n]){const exports={};const source=f.storage.read(n);assert.equal(typeof source,'string','dependency '+n);vm.runInNewContext(source,{exports});modules[n]=exports;}return modules[n];}
 const context=vm.createContext({g:graphics,Date:class extends Date{static now(){return f.clock.now();}},
 process:{env:{BOARD:'BANGLEJS2',VERSION:'2v29',HWVERSION:2,GIT_COMMIT:'fixture'}},
 setTimeout:f.clock.setTimeout,clearTimeout:f.clock.clearTimeout,setInterval:f.clock.setInterval,clearInterval:f.clock.clearInterval,
 require:n=>n==='Storage'?f.storage:moduleFor(n),
 Bangle:{setLCDPower:on=>screen=on,setLCDBrightness:()=>{},setBacklight:()=>{},setLocked:()=>{},setLCDTimeout:()=>{},getOptions:()=>({}),setOptions:()=>{},setUI:ui=>input=ui,isCharging:()=>false,
 setHRMPower:on=>{f.power.push(on);return on;},getAccel:f.env.accel,getPressure:f.env.pressure,buzz:()=>{},on:(e,fn)=>f.bus.on(e,fn),removeListener:(e,fn)=>f.bus.off(e,fn)},
 NRF:{getAddress:()=>f.env.mac,getSecurityStatus:()=>({connected:false}),setServices:()=>{},updateServices:()=>{},on:(e,fn)=>f.bus.on(e,fn),removeListener:(e,fn)=>f.bus.off(e,fn)},
 Bluetooth:{setConsole:()=>{}},E:{getBattery:()=>80,CRC32:()=>1,toJS:JSON.stringify,setFlags:()=>{},setTimeZone:()=>{},showMessage:()=>{}},load:()=>{},BTN:1});
 context.global=context;
 vm.runInContext(f.storage.read('.boot0'),context,{timeout:5000});
 vm.runInContext(f.storage.read('.bootcde'),context,{timeout:5000});
 f.clock.advance(0);await Promise.resolve();const node=context.VeraNode;
 assert.equal(node.health().running,true);assert.equal(node.health().scheduled,true);assert.equal(node.health().hrmRequested,true);assert.equal(screen,true);assert.ok(input);
 f.clock.advance(10001);await Promise.resolve();assert.equal(screen,false);
 f.bus.emit('HRM',{bpm:73,confidence:99});f.clock.advance(30000);await Promise.resolve();
 const rows=node.samples.readBatch(0,10);assert.ok(rows.some(r=>r.data.values.battito&&r.data.values.battito.value===73));assert.ok(rows.some(r=>r.data.values.temperatura&&r.data.values.temperatura.value===23.4));
 assert.equal(f.storage.normal.has('setting.app.js'),false);assert.equal(f.storage.normal.has('launch.info'),false);
 input.remove();node.dispose();
});

test('canonical dedicated builder produces 14 verified files and records its release scope without changing legacy assets',()=>{
 const os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vera-only-package-'));
 try{
  const sourceCommit=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const config=JSON.parse(cp.execFileSync('git',['show',sourceCommit+':initialization/zero/dedicated-release.json'],{cwd:root}));
  const r=require('../../bin/build-veranode-zero.cjs').build(tmp,{targetProfile:'veranode-only',sourceCommit});
  assert.equal(r.bundle.target.files.length,14);assert.equal(r.bundle.bootstrap.length,7);assert.equal(r.bundle.targetProfile,'veranode-only');
  assert.equal(r.bundle.executionEnabled,config.executionEnabled);assert.equal('hardwareIdentityVerified' in r.bundle,false);assert.equal('allowedMacs' in r.bundle.executionPolicy,false);assert.deepEqual(r.bundle.executionPolicy,config.executionPolicy);
  for(const f of [...r.bundle.bootstrap,...r.bundle.target.files]){const b=Buffer.from(f.base64,'base64');assert.equal(b.length,f.size);assert.equal(sha(b),f.sha256);}
  assert.equal(r.bundle.target.installOrder.length,13);assert.equal(r.bundle.target.installOrder.at(-1),'.bootcde');assert.equal(r.bundle.target.installOrder.includes('.boot0'),false);
  assert.equal(r.bundle.runtimePackageSha256,parent.runtimePackageSha256);
  for(const name of ['bin/veranode-dedicated-target.cjs','initialization/zero/launcher.js','initialization/zero/dedicated-release.json'])assert.equal(r.bundle.provenance.inputs[name],sha(cp.execFileSync('git',['show',sourceCommit+':'+name],{cwd:root})));
  const again=require('../../bin/build-veranode-zero.cjs').build(tmp,{targetProfile:'veranode-only',sourceCommit});assert.equal(again.sha256,r.sha256);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('generic release policy delegates concrete identity to server binding without per-MAC builds',()=>{
 const {validateDedicatedRelease}=require('../../bin/build-veranode-zero.cjs');
 const config={targetProfile:'veranode-only',board:'BANGLEJS2',firmware:['2v29'],executionEnabled:true,executionPolicy:{scope:'server-authorized-initialization',allowedRoles:['super_admin','platform_admin'],requiresDeviceBinding:true}};
 assert.equal(validateDedicatedRelease(config),config);
 for(const change of [{executionPolicy:{...config.executionPolicy,allowedMacs:['FC:0C:5D:40:F0:AA']}},{executionPolicy:{...config.executionPolicy,requiresDeviceBinding:false}},{firmware:['2v30']},{executionPolicy:{...config.executionPolicy,allowedRoles:['worker']}},{hardwareIdentityVerified:true}])assert.throws(()=>validateDedicatedRelease({...config,...change}),/configuration/);
});
