const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const create=require('../../maintenance/veranode/provider.js').create;
const names=['veranode.clock.js','veranode.app.js','veranode.core.js','veranode.runtime.js','veranode.wire.js','veranode.img','veranode.boot.js','veranode.info'];
const hash=x=>crypto.createHash('sha256').update(x,'latin1').digest('hex');
const canonical=x=>x&&typeof x==='object'?(Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}'):JSON.stringify(x);
function fixture(providerCreate=create){
 let saved, time=0, isolated=true, encrypted=true, consent=true, failed=false, writes=0, activated=false;
 const files=new Map(names.map(n=>[n,'old-'+n])),data=new Map([['veranode.s0','sample\u0000\u00ff\n']]);
 files.set('veranode.policy.json','profile-exact-bytes');files.set('setting.json','clock and brightness');
 const binding={user:'u',scope:'s',mac:'DF:B7:68:30:4C:46',assignment:1,targetHash:'a'.repeat(64)};
 const state={binding,snapshot:'snapshot-test-001',phase:'prepared',plan:{files:names.map(name=>({name,sourceSize:files.get(name).length,sourceHash:hash(files.get(name)),size:('new-'+name).length,hash:hash('new-'+name)}))}};
 saved=structuredClone(state);
 const inventory=()=>[...files].filter(([n])=>!n.startsWith('veram.')).map(([name,raw])=>({name,kind:'normal',size:raw.length,hash:hash(raw)})).concat([...data].map(([name,raw])=>({name,kind:'storage-file',size:raw.length,hash:hash(raw)})));
 const env={load:()=>structuredClone(saved),save:s=>{saved=structuredClone(s);},hash,canonical,inventory,
  isolated:()=>isolated,encrypted:()=>encrypted,consent:()=>consent,profileIdentity:()=>({user:'u',scope:'s',mac:binding.mac}),now:()=>time,random:()=> 'lease-test-001',
  readNormal:n=>files.get(n),writeNormal:(n,raw,offset,size)=>{
    if(n.startsWith('veranode.')&&names.includes(n)){writes++;if(failed){files.set(n,'torn');throw Error('power-loss');}}
    // Match native Storage: an offset-zero write reallocates the file.
    if(size!==undefined||offset===0)files.set(n,'\xff'.repeat(size===undefined?raw.length:size));
    if(offset===undefined)files.set(n,raw);else{let old=files.get(n);files.set(n,old.slice(0,offset)+raw+old.slice(offset+raw.length));}
  },read:(f,o,l)=>(f.kind==='normal'?files:data).get(f.name).slice(o,o+l),base64:x=>Buffer.from(x,'latin1').toString('base64'),unbase64:x=>Buffer.from(x,'base64').toString('latin1'),progress:()=>{},activate:()=>{activated=true;}};
 return {env,files,data,binding,provider:()=>providerCreate(env),setTime:t=>time=t,setConsent:v=>consent=v,setEncrypted:v=>encrypted=v,setIsolated:v=>isolated=v,fail:v=>failed=v,get saved(){return saved;},get writes(){return writes;},get activated(){return activated;}};
}
function start(f){const m=f.provider(),r=m.begin(f.binding,60000,null);return {m,t:r.token};}
function write(m,t,n,raw){return m.replaceSoftware(t,n,0,raw.length,Buffer.from(raw,'latin1').toString('base64'));}
test('isolated upgrade preserves binary archive, policy and settings; requires explicit activation',()=>{
 const f=fixture(),before=structuredClone(f.data),{m,t}=start(f);
 for(const n of names)write(m,t,n,'new-'+n);
 assert.deepEqual(f.data,before);assert.equal(f.files.get('veranode.policy.json'),'profile-exact-bytes');assert.equal(f.files.get('setting.json'),'clock and brightness');
 assert.equal(f.activated,false);assert.equal(m.activate(t,false).activationRequested,true);assert.equal(f.activated,true);
});
test('lease, consent and isolation fail closed without file writes',()=>{
 for(const kind of ['setConsent','setEncrypted','setIsolated']){const f=fixture();f[kind](false);assert.throws(()=>start(f));assert.equal(f.writes,0);}
 const f=fixture(),{m,t}=start(f);f.setTime(60000);assert.throws(()=>write(m,t,names[0],'new-'+names[0]));assert.equal(f.writes,0);
});
test('writes cannot target profile, samples or files outside exact plan',()=>{
 const f=fixture(),{m,t}=start(f);for(const n of ['veranode.policy.json','veranode.s0','setting.json','../app'])assert.throws(()=>write(m,t,n,'x'));
 assert.equal(f.writes,0);assert.throws(()=>m.activate(t,false));
});
test('power loss during final file copy restores exact previous software on re-entry',()=>{
 const f=fixture(),{m,t}=start(f),n=names[0];f.fail(true);assert.throws(()=>write(m,t,n,'new-'+n),/power-loss/);
 assert.equal(f.files.get(n),'torn');f.fail(false);const resumed=start(f);assert.equal(f.files.get(n),'old-'+n);
 write(resumed.m,resumed.t,n,'new-'+n);assert.equal(f.files.get(n),'new-'+n);assert.equal(f.saved.transaction,null);
});
test('bad staged payload never replaces executable file',()=>{
 const f=fixture(),{m,t}=start(f),n=names[0];assert.throws(()=>write(m,t,n,'bad-'+n),/Hash/);assert.equal(f.writes,0);
});
test('changed protected bytes stop writes and activation',()=>{
 const f=fixture(),{m,t}=start(f);f.data.set('veranode.s0','changed');assert.throws(()=>write(m,t,names[0],'new-'+names[0]),/Dati/);assert.equal(f.writes,0);
});
test('reconnect retains snapshot, requires new consent and rejects a different binding',()=>{
 const f=fixture();start(f);const m=f.provider();f.setConsent(false);assert.throws(()=>m.begin(f.binding,60000,'snapshot-test-001'));
 f.setConsent(true);assert.throws(()=>m.begin({...f.binding,user:'other'},60000,null));assert.throws(()=>m.begin(f.binding,60000,'wrong-snapshot'));
 assert.equal(m.begin(f.binding,60000,'snapshot-test-001').snapshot,'snapshot-test-001');
});
test('rollback accepts only exact backed-up software, preserving original data',()=>{
 const f=fixture(),{m,t}=start(f);write(m,t,names[0],'new-'+names[0]);write(m,t,names[0],'old-'+names[0]);
 assert.equal(m.activate(t,true).activationRequested,true);assert.equal(f.saved.phase,'rollback-pending');
});
test('inventory/read expose exact bytes and reject stale descriptors',()=>{
 const f=fixture(),{m,t}=start(f),rows=m.inventory(t).files,file=rows.find(f=>f.kind==='storage-file');
 assert.equal(Buffer.from(m.read(t,file,0,file.size).base64,'base64').toString('latin1'),f.data.get(file.name));
 assert.throws(()=>m.read(t,{...file,hash:'0'.repeat(64)},0,1));
});
test('backup chunk reads use one inventory rather than rehashing the full archive per chunk',()=>{
 const f=fixture();let scans=0;const original=f.env.inventory;f.env.inventory=()=>{scans++;return original();};
 const {m,t}=start(f);const file=m.inventory(t).files.find(r=>r.kind==='storage-file'),before=scans;
 for(let i=0;i<20;i++)m.read(t,file,0,1);assert.equal(scans,before);
});
test('cancel before software writes resumes collector; partial replacement requires explicit recovery',()=>{
 const f=fixture(),{m,t}=start(f);assert.equal(m.end(t).resumeRequested,true);assert.equal(f.saved.phase,'rollback-pending');
 const partial=fixture(),session=start(partial);write(session.m,session.t,names[0],'new-'+names[0]);assert.throws(()=>session.m.cancelLocally(),/recupero/);assert.equal(partial.activated,false);
});
test('paged inventory fits UART response bounds and returns a stable complete archive',()=>{
 const f=fixture();for(let i=0;i<200;i++)f.data.set('veranode.s'+(i+1),'small');
 const {m,t}=start(f),rows=[];let offset=0,total=0;
 do{const page=m.inventoryPage(t,offset,32);assert.ok(JSON.stringify(page).length<12000);assert.equal(page.offset,offset);rows.push(...page.files);offset=page.next;total=page.total;}while(offset<total);
 assert.equal(rows.length,211);assert.equal(new Set(rows.map(f=>f.kind+':'+f.name)).size,rows.length);
});


test('Espruino 2v29 provider rejects malformed numbers and preserves data through interrupted upgrade without Number helpers',()=>{
 const fs=require('fs'),vm=require('vm'),path=require('path');
 const context=vm.createContext({exports:{},Number:{}});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../maintenance/veranode/provider.js'),'utf8'),context);
 const f=fixture(context.exports.create),originalData=structuredClone(f.data),originalProfile=f.files.get('veranode.policy.json');
 const m=f.provider();
 for(const ttl of [NaN,Infinity,-Infinity,0,-1,1.5,'100',null])assert.throws(()=>m.begin(f.binding,ttl,null),/Durata/);
 const t=m.begin(f.binding,60000,null).token;
 for(const bad of [NaN,Infinity,-Infinity,-1,1.5,'0',null]){
  assert.throws(()=>m.inventoryPage(t,bad,1),/Pagina/);
  assert.throws(()=>m.inventoryPage(t,0,bad),/Pagina/);
  assert.throws(()=>m.replaceSoftware(t,names[0],bad,10,'YQ=='),/software non consentito/);
 }
 f.fail(true);assert.throws(()=>write(m,t,names[0],'new-'+names[0]),/power-loss/);
 f.fail(false);const resumed=f.provider(),lease=resumed.begin(f.binding,60000,'snapshot-test-001').token;
 assert.equal(f.files.get(names[0]),'old-'+names[0]);
 for(const name of names)write(resumed,lease,name,'new-'+name);
 assert.equal(resumed.activate(lease,false).activationRequested,true);
 assert.deepEqual(f.data,originalData);assert.equal(f.files.get('veranode.policy.json'),originalProfile);
 assert.equal(f.files.get('setting.json'),'clock and brightness');
});

test('published d749 failure is reproduced before any runtime write when Number helpers are absent',()=>{
 const fs=require('fs'),vm=require('vm'),path=require('path');
 const pkg=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../dist/veranode-upgrade/veranode-upgrade-1-d749066fdad7002d/upgrade.json')));
 const code=Buffer.from(pkg.maintenance.files.find(f=>f.name==='veram.provider.js').base64,'base64').toString();
 const context=vm.createContext({exports:{},Number:{}});vm.runInContext(code,context);
 const f=fixture(context.exports.create);assert.throws(()=>f.provider(),/isInteger/);assert.equal(f.writes,0);
 assert.equal(f.files.get('veranode.policy.json'),'profile-exact-bytes');
});

test('missing or unrecognized Vera source fails before any preserving-upgrade write',()=>{
 for(const mode of ['missing','unknown']){const f=fixture();if(mode==='missing')f.files.delete(names[0]);else f.files.set(names[0],'not an approved Vera build');
  assert.throws(()=>start(f),/Software origine diverso/);assert.equal(f.writes,0);assert.equal(f.saved.protected,undefined);
  assert.equal(f.data.get('veranode.s0'),'sample\u0000\u00ff\n');assert.equal(f.files.get('veranode.policy.json'),'profile-exact-bytes');}
});

test('multi-block staging keeps the full allocation with native offset-zero semantics',()=>{
 const f=fixture(),name=names[0],raw='new-'.repeat(230);
 const save=f.env.save;f.env.save=s=>save(s);
 const load=f.env.load;f.env.load=()=>{const s=load();s.plan.files[0].size=raw.length;s.plan.files[0].hash=hash(raw);return s;};
 const {m,t}=start(f);
 for(let offset=0;offset<raw.length;offset+=384)m.replaceSoftware(t,name,offset,raw.length,Buffer.from(raw.slice(offset,offset+384),'latin1').toString('base64'));
 assert.equal(f.files.get(name),raw);assert.equal(f.files.get('veranode.policy.json'),'profile-exact-bytes');
});

test('recovery rejects a journal transaction outside the immutable source/target plan',()=>{
 const f=fixture(),load=f.env.load;
 f.env.load=()=>({...load(),transaction:{name:names[0],oldHash:hash('untrusted'),oldSize:9,newHash:hash('also-untrusted'),newSize:14}});
 f.files.set('veram.old','untrusted');f.files.set(names[0],'torn');
 assert.throws(()=>f.provider(),/Transazione non valida/);assert.equal(f.writes,0);
});

test('v3 binds the operation independently from profile and adopts only rollback recovery',()=>{
 const f=fixture(),load=f.env.load;
 const parent={operationId:'01234567-1234-1234-1234-0123456789ab',deviceId:97,mac:f.binding.mac,actorId:'admin',upgradeSha256:f.binding.targetHash,targetPackageSha256:'b'.repeat(64),contextSha256:'c'.repeat(64)};
 f.env.load=()=>({...load(),operationBinding:parent});
 const m=f.provider();assert.throws(()=>m.begin(f.binding,60000,null),/Operazione diversa/);
 const t=m.begin(f.binding,60000,null,parent).token;write(m,t,names[0],'new-'+names[0]);
 const child={...parent,operationId:'01234567-1234-1234-1234-0123456789ac'};
 assert.throws(()=>m.adoptRecovery(parent,{...child,deviceId:98}),/Recupero diverso/);
 assert.equal(m.adoptRecovery(parent,child).mode,'rollback-only');
 assert.throws(()=>m.renew(t,60000),/scaduta/);
 const token=m.begin(f.binding,60000,'snapshot-test-001',child).token;
 assert.throws(()=>write(m,token,names[0],'new-'+names[0]),/Solo ripristino/);
 write(m,token,names[0],'old-'+names[0]);assert.throws(()=>m.activate(token,false),/Solo ripristino/);
 assert.equal(m.activate(token,true).activationRequested,true);assert.equal(f.saved.phase,'rollback-pending');
});

test('activation invalidates the lease immediately and prevents further writes before reboot',()=>{
 const f=fixture(),{m,t}=start(f);m.activate(t,true);
 assert.throws(()=>m.renew(t,60000),/scaduta/);assert.throws(()=>write(m,t,names[0],'new-'+names[0]),/scaduta/);
 assert.throws(()=>m.begin(f.binding,60000,null),/attendi riavvio/);assert.equal(f.writes,0);
});

test('app-confirmed operation needs no watch touch and close-only adoption works before begin',()=>{
 const f=fixture(),load=f.env.load;
 const parent={operationId:'01234567-1234-1234-1234-0123456789ab',deviceId:97,mac:f.binding.mac,actorId:'admin',upgradeSha256:f.binding.targetHash,targetPackageSha256:'b'.repeat(64),contextSha256:'c'.repeat(64)};
 f.env.load=()=>({...load(),operationBinding:parent,authorizationMode:'app-confirmed',appConsentOperationId:parent.operationId});
 f.setConsent(false);const m=f.provider();assert.equal(m.operationContext().consent,true);
 assert.throws(()=>m.begin(f.binding,60000,null,{...parent,deviceId:98}),/Operazione diversa/);
 const child={...parent,operationId:'01234567-1234-1234-1234-0123456789ac'};
 const adopted=m.adoptRecovery(parent,child);assert.equal(adopted.mode,'rollback-only');assert.equal(adopted.authorizationMode,'app-confirmed');
 const token=m.begin(f.binding,60000,adopted.snapshot,child).token;m.activate(token,true);
 assert.equal(f.writes,0);assert.equal(f.saved.appConsentOperationId,child.operationId);
 assert.equal(f.files.get('veranode.policy.json'),'profile-exact-bytes');
});
