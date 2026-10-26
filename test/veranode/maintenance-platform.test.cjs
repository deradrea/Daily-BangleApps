const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const directory=path.resolve(__dirname,'../../maintenance/veranode');
const names=['veranode.clock.js','veranode.app.js','veranode.core.js','veranode.runtime.js','veranode.wire.js','veranode.img','veranode.boot.js','veranode.info'];
const hash=x=>crypto.createHash('sha256').update(Buffer.from(x,'latin1')).digest('hex');
function fixture(){
 const files=new Map(names.map(n=>[n,'old-'+n])),sf=new Map([['veranode.s0','sample\u0000\u00ff\n']]);
 const binding={user:'u',scope:'s',mac:'DF:B7:68:30:4C:46',assignment:1,targetHash:'a'.repeat(64)};
 files.set('veranode.policy.json',JSON.stringify({user:'u',scope:'s',mac:binding.mac}));files.set('setting.json','settings');files.set('.boot0','generated');
 const state={generation:1,binding,snapshot:'snapshot-00001',phase:'prepared',plan:{files:names.map(name=>({name,size:('new-'+name).length,hash:hash('new-'+name),sourceSize:('old-'+name).length,sourceHash:hash('old-'+name)}))}};
 const body=JSON.stringify(state);files.set('veram.state0',JSON.stringify({body,hash:hash(body)}));
 const storage={read:(n,o,l)=>{const r=files.get(n);return r===undefined?r:o===undefined?r:r.substr(o,l);},
  readJSON:n=>{try{return JSON.parse(files.get(n));}catch{return;}},write:(n,r,o,size)=>{if(size!==undefined)files.set(n,'\xff'.repeat(size));if(o===undefined)files.set(n,r);else{const old=files.get(n)||'';files.set(n,old.slice(0,o)+r+old.slice(o+r.length));}return true;},
  list:(r,options)=>options.sf?[...sf.keys()]:[...files.keys()],getStats:()=>({freeBytes:1000000}),
  open:n=>{let offset=0;return {read:l=>{const text=sf.get(n)||'';if(offset>=text.length)return undefined;const raw=text.substr(offset,l);offset+=raw.length;return raw;}};}};
 let g={VeraIsolatedMaintenance:true},cache={};
 function boot(){g={};cache={};storage.read=(n,o,l)=>{const r=files.get(n);return r===undefined?r:o===undefined?r:r.substr(o,l);};vm.runInNewContext(fs.readFileSync(path.join(directory,'guard.js'),'utf8'),context());}
 const context=()=>({global:g,exports:{},require:load,Uint8Array,NRF:{getSecurityStatus:()=>({encrypted:true}),getAddress:()=>binding.mac+' random'},getTime:()=>10,
   E:{toString:x=>Buffer.from(x).toString('latin1')},btoa:x=>Buffer.from(x,'latin1').toString('base64'),atob:x=>Buffer.from(x,'base64').toString('latin1'),setTimeout:()=>0});
 function load(n){if(n==='Storage')return storage;if(n==='crypto')return {SHA256:x=>crypto.createHash('sha256').update(Buffer.from(x,'latin1')).digest()};
  if(cache[n])return cache[n];const file={'veram.platform.js':'platform.js','veram.provider.js':'provider.js'}[n];if(!file)throw Error(n);
  const c=context();vm.runInNewContext(fs.readFileSync(path.join(directory,file),'utf8'),c);cache[n]=c.exports;return c.exports;}
 return {files,sf,binding,load,boot,get g(){return g;}};
}
test('actual platform uses binary StorageFile bytes and original reader while boot redirects the clock',()=>{
 const f=fixture();f.boot();assert.equal(f.g.VeraIsolatedMaintenance,true);
 const p=f.load('veram.platform.js').create();p.setConsent(true);const m=f.load('veram.provider.js').create(p),lease=m.begin(f.binding,60000,null);
 const rows=m.inventory(lease.token).files;assert.equal(rows.find(r=>r.name==='veranode.app.js').hash,hash('old-veranode.app.js'));
 assert.equal(rows.some(r=>r.name==='veram.state0'),false);assert.equal(rows.some(r=>r.name==='.boot0'),false);
 const sf=rows.find(r=>r.kind==='storage-file');assert.equal(sf.hash,hash(f.sf.get(sf.name)));
 assert.throws(()=>m.begin(f.binding,60000,null),/Consenso/,'consent consumed after begin');
});
test('actual two-slot journal and boot confirmation preserve profile through all eight writes',()=>{
 const f=fixture();f.boot();const p=f.load('veram.platform.js').create();p.setConsent(true);const m=f.load('veram.provider.js').create(p),t=m.begin(f.binding,60000,null).token;
 const before=f.files.get('veranode.policy.json');for(const n of names){const raw='new-'+n;m.replaceSoftware(t,n,0,raw.length,Buffer.from(raw).toString('base64'));}
 assert.equal(f.files.get('veranode.policy.json'),before);m.activate(t,false);f.boot();assert.equal(f.g.VeraIsolatedMaintenance,undefined);
 assert.throws(()=>f.g.VeraMaintenanceActivation.confirm(),/Avvio/);
 f.g.VeraNode={health:()=>({running:true,scheduled:true,hrmRequested:true})};assert.equal(f.g.VeraMaintenanceActivation.confirm().confirmed,true);
 f.boot();assert.equal(f.g.VeraMaintenanceActivation,undefined);assert.equal(f.files.get('veranode.policy.json'),before);
});
test('torn newest state falls back to verified slot while a fully torn journal keeps collector stopped',()=>{
 const f=fixture(),p=f.load('veram.platform.js').create(),state=p.load();state.phase='backup';p.save(state);f.files.set('veram.state0','torn');f.boot();assert.equal(f.g.VeraIsolatedMaintenance,true);
 f.files.set('veram.state1','torn');f.boot();assert.equal(f.g.VeraIsolatedMaintenance,true);assert.equal(f.g.VeraNode.state.running,false);
});

test('rollback requires a verified boot before being reported complete',()=>{
 const f=fixture();f.boot();const p=f.load('veram.platform.js').create();p.setConsent(true);const m=f.load('veram.provider.js').create(p),t=m.begin(f.binding,60000,null).token;
 m.activate(t,true);assert.equal(p.load().phase,'rollback-pending');f.boot();
 assert.throws(()=>f.g.VeraMaintenanceActivation.confirm(),/Avvio/);
 f.g.VeraNode={health:()=>({running:true,scheduled:true,hrmRequested:true})};
 assert.equal(f.g.VeraMaintenanceActivation.confirm().result,'rolled-back');
});

test('maintenance preserves another owner profile without assigning the administrator identity',()=>{
 const f=fixture();f.files.set('veranode.policy.json',JSON.stringify({user:'actual-owner',scope:'actual-scope',mac:f.binding.mac}));
 f.boot();const p=f.load('veram.platform.js').create();p.setConsent(true);const m=f.load('veram.provider.js').create(p),t=m.begin(f.binding,60000,null).token;
 assert.equal(m.status().profileSha256,hash(f.files.get('veranode.policy.json')));
 for(const name of names){const raw='new-'+name;m.replaceSoftware(t,name,0,raw.length,Buffer.from(raw).toString('base64'));}
 m.activate(t,false);f.boot();f.g.VeraNode={health:()=>({running:true,scheduled:true,hrmRequested:true})};
 assert.equal(f.g.VeraMaintenanceActivation.confirm().confirmed,true);assert.equal(JSON.parse(f.files.get('veranode.policy.json')).user,'actual-owner');
});

test('missing profile remains missing across update and boot verification',()=>{
 const f=fixture();f.files.delete('veranode.policy.json');const p=f.load('veram.platform.js').create(),state=p.load();state.collectionWasRunning=false;p.save(state);
 f.boot();const platform=f.load('veram.platform.js').create();platform.setConsent(true);const m=f.load('veram.provider.js').create(platform),t=m.begin(f.binding,60000,null).token;
 for(const name of names){const raw='new-'+name;m.replaceSoftware(t,name,0,raw.length,Buffer.from(raw).toString('base64'));}
 m.activate(t,false);f.boot();f.g.VeraNode={health:()=>({running:false,scheduled:false,hrmRequested:false})};
 const receipt=f.g.VeraMaintenanceActivation.confirm();assert.equal(receipt.profileSha256,null);assert.equal(receipt.running,false);assert.equal(f.files.has('veranode.policy.json'),false);
});

test('sequential and retried StorageFile reads retain exact binary bytes',()=>{
 const f=fixture(),raw='abc\x00\xff'.repeat(300);f.sf.set('veranode.s0',raw);const p=f.load('veram.platform.js').create(),file={kind:'storage-file',name:'veranode.s0'};
 let copy='';for(let offset=0;offset<raw.length;offset+=512)copy+=p.read(file,offset,Math.min(512,raw.length-offset));
 assert.equal(copy,raw);assert.equal(p.read(file,512,512),raw.slice(512,1024));assert.equal(p.read(file,0,20),raw.slice(0,20));
});

test('new rollback-only snapshot preserves journals grown after the failed target boot',()=>{
 const f=fixture(),p=f.load('veram.platform.js').create(),state=p.load();
 state.mode='rollback-only';state.collectionWasRunning=false;state.expectedCollectionRunning=true;p.save(state);
 for(const name of names)f.files.set(name,'new-'+name);
 f.sf.set('veranode.s0','new samples appended after target boot');f.sf.set('veranode.s1','more new samples');
 f.boot();const env=f.load('veram.platform.js').create();env.setConsent(true);const m=f.load('veram.provider.js').create(env),t=m.begin(f.binding,60000,null).token;
 for(const name of names){const raw='old-'+name;m.replaceSoftware(t,name,0,raw.length,Buffer.from(raw).toString('base64'));}
 assert.equal(f.sf.get('veranode.s0'),'new samples appended after target boot');assert.equal(f.sf.get('veranode.s1'),'more new samples');
 m.activate(t,true);f.boot();f.g.VeraNode={health:()=>({running:true,scheduled:true,hrmRequested:true})};
 assert.equal(f.g.VeraMaintenanceActivation.confirm().result,'rolled-back');
});
