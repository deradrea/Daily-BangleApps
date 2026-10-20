/* Espruino Bangle.js2 adapter. Binary strings, bounded inventories, no compact. */
exports.create=function(){
  var s=require('Storage'),crypto=require('crypto'),t=require('verai.target.js'),generation=0;
  var bonding='idle',securityTimer,securityError;
  var raw=global.VeraInitializeRead||s.read.bind(s);
  function hash(x){var a=new Uint8Array(crypto.SHA256(x)),out='';for(var i=0;i<a.length;i++)out+=('0'+a[i].toString(16)).slice(-2);return out;}
  function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(function(k){return JSON.stringify(k)+':'+canonical(x[k]);}).join(',')+'}';return JSON.stringify(x);}
  var privateNames=['verai.provider.js','verai.platform.js','verai.recovery.js','verai.0.boot.js','verai.app.js','verai.target.js','verai.state0','verai.state1','verai.plan','verai.oldboot','verai.oldhash','.widcache','.clkinfocache'];
  function internal(n){if(privateNames.includes(n))return true;for(var i=0;i<t.files.length;i++)if(n==='verai.f'+i)return true;return false;}
  function load(includePlan){var found=false,rows=[0,1].map(function(i){var r=raw('verai.state'+i);if(r===undefined)return;found=true;try{var v=JSON.parse(r);if(hash(v.body)!==v.sha256)return;return JSON.parse(v.body);}catch(_){return;}}).filter(function(x){return !!x;});
    rows.sort(function(a,b){return b.generation-a.generation;});if(!rows.length){if(found)throw Error('Registro corrotto: recupero assistito');return null;}generation=rows[0].generation;var st=rows[0];
    if(st.planHash&&includePlan!==false){var p=raw('verai.plan');if(!p||hash(canonical(JSON.parse(p)))!==st.planHash)throw Error('Piano corrotto');st.plan=JSON.parse(p);}return st;}
  function write(n,b,o,size){if(s.getStats().freeBytes<b.length+(size||0)+32768)throw Error('Spazio insufficiente, nessuna compattazione automatica');if(s.write(n,b,o,size)===false)throw Error('Scrittura fallita');}
  function save(st){
    if(st.plan){var p=JSON.stringify(st.plan);if(p.length>32768)throw Error('Piano oltre limite memoria');if(hash(canonical(st.plan))!==st.planHash)throw Error('Hash piano diverso');if(raw('verai.plan')!==p){write('verai.plan',p);if(raw('verai.plan')!==p)throw Error('Piano non verificato');}}
    st.generation=++generation;var copy={};Object.keys(st).forEach(function(k){if(k!=='plan')copy[k]=st[k];});
    var body=JSON.stringify(copy),bytes=JSON.stringify({body:body,sha256:hash(body)}),name='verai.state'+generation%2;write(name,bytes);if(raw(name)!==bytes)throw Error('Registro non verificato');}
  function describe(n,kind){if(typeof n!=='string'||n.length<1||n.length>28||!/^[\x20-\x7e]+$/.test(n))throw Error('Nome file non supportato');var data;if(kind==='normal')data=raw(n);else{var listed=s.list(undefined,{sf:true}).some(function(v){return v.slice(0,-1)===n;});if(!listed)return null;var f=s.open(n,'r'),p;data='';while((p=f.read(512))!==undefined&&p!==''){data+=p;if(data.length>65536)throw Error('StorageFile oltre 64 KiB');}}
    return data===undefined?null:{name:n,kind:kind,size:data.length,sha256:hash(data)};}
  function inventory(){var rows=s.list(undefined,{sf:false}).filter(function(n){return !internal(n);}).map(function(n){return describe(n,'normal');}),seen={};s.list(undefined,{sf:true}).forEach(function(n){n=n.slice(0,-1);if(!seen[n]){seen[n]=true;rows.push(describe(n,'storage-file'));}});if(rows.length>128)throw Error('Inventario oltre 128 file');return rows;}
  function mac(){return NRF.getAddress().split(' ')[0].toUpperCase();}
  function inspect(){var blockers=[],settings=s.readJSON('setting.json',1)||{};
    if(process.env.BOARD!=='BANGLEJS2'||process.env.VERSION!=='2v29')blockers.push('firmware');
    if(!t.bootloaderHashes.includes(hash(raw('.bootcde')||''))||!t.bootupdateHashes.includes(hash(raw('bootupdate.js')||'')))blockers.push('bootloader');
    if(['.bootPowerOn','.boot1','.boot2','.boot3','.bootrst','.varimg'].some(function(n){return raw(n)!==undefined;}))blockers.push('alternate_boot');
    if(settings.blerepl===false)blockers.push('uart_disabled');
    return {board:process.env.BOARD,firmware:process.env.VERSION,mac:mac(),batteryPercent:E.getBattery(),charging:Bangle.isCharging(),freeBytes:s.getStats().freeBytes,compatible:blockers.length===0,blockers:blockers,security:securityStatus()};}
  function securityStatus(){var st=NRF.getSecurityStatus();return {connected:!!st.connected,encrypted:!!st.encrypted,bonded:!!st.bonded,state:st.encrypted?'encrypted':bonding,error:securityError||null};}
  function requestSecurity(){
    var st=securityStatus();if(!st.connected)throw Error('Collega il Bluetooth prima di associare');if(st.encrypted)return st;
    if(['requested','awaiting-encryption'].includes(bonding))return st;
    if(typeof NRF.startBonding!=='function')throw Error('Associazione cifrata non disponibile');
    bonding='requested';securityError=undefined;
    securityTimer=setTimeout(function(){if(!NRF.getSecurityStatus().encrypted){bonding='timed-out';securityError='Conferma associazione sul telefono e riprova';}},45000);
    try{NRF.startBonding(false).then(function(){if(NRF.getSecurityStatus().encrypted){bonding='encrypted';clearTimeout(securityTimer);}else bonding='awaiting-encryption';},function(){bonding='failed';securityError='Associazione non completata';clearTimeout(securityTimer);});}
    catch(e){bonding='failed';securityError='Associazione non completata';clearTimeout(securityTimer);}
    return securityStatus();
  }
  function isolate(){
    // Existing bootloader is never erased. This temporary .boot0 routes every
    // clock load to recovery, including when setting.json is being replaced.
    if(raw('.boot0')!==raw('verai.recovery.js')){var previous=raw('.boot0');if(typeof previous!=='string')throw Error('Boot assente');write('verai.oldboot',previous);write('verai.oldhash',hash(previous));}
    write('.boot0',raw('verai.recovery.js'));
    if(raw('.boot0')!==raw('verai.recovery.js'))throw Error('Isolamento non verificato');
    setTimeout(function(){global.load('verai.app.js');},250);
  }
  return {target:t,hash:hash,canonical:canonical,load:load,save:save,read:raw,write:write,
    inventory:inventory,describe:describe,mac:mac,inspect:inspect,isolate:isolate,requestSecurity:requestSecurity,securityStatus:securityStatus,
    restoreBoot:function(){var b=raw('verai.oldboot');if(typeof b!=='string'||hash(b)!==raw('verai.oldhash'))throw Error('Boot originale da recuperare');write('.boot0',b);if(raw('.boot0')!==b)throw Error('Ripristino boot non verificato');},
    encrypted:function(){return !!NRF.getSecurityStatus().encrypted;},isolated:function(){return global.VeraDedicatedRecovery===true;},
    settings:function(){return s.readJSON('setting.json',1)||{};},
    erase:function(n,k){if(k==='normal'&&(internal(n)||['.boot0','.bootcde','bootupdate.js'].includes(n)))throw Error('File essenziale');if(k==='storage-file')s.open(n,'r').erase();else s.erase(n);},
    cleanup:function(){t.files.forEach(function(_f,i){s.erase('verai.f'+i);});s.erase('verai.oldboot');s.erase('verai.oldhash');},
    unbase64:atob,progress:function(phase,done,total){var old=global.VeraInitializeProgress,now=getTime();global.VeraInitializeProgress={phase:phase,done:done,total:total};if(global.VeraInitializeDraw&&(!old||old.phase!==phase||done===total||!global.VeraInitializePaintAt||now-global.VeraInitializePaintAt>=0.25)){global.VeraInitializePaintAt=now;global.VeraInitializeDraw();}},
    health:function(){return global.VeraNode&&global.VeraNode.health&&global.VeraNode.health();},
    activate:function(){setTimeout(function(){global.load();},300);}};
};
