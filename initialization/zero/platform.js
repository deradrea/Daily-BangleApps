/* Trusted zero adapter. Never reads old samples, never calls eraseAll. */
exports.create=function(){
  var s=require('Storage'),c=require('crypto'),t=require('vz.target.js'),sequence=0;
  var raw=global.VeraZeroRawRead||global.VeraInitializeRead||global.VeraMaintenanceStorageRead||s.read.bind(s);
  var bootEntries=['.varimg','.bootcde','.bootrst','.boot3','.boot2','.boot1','.bootPowerOn','.boot0'];
  var cleanupBootEntries=['.bootPowerOn','.boot1','.boot2','.boot3','.bootrst'];
  var names=['vz.provider.js','vz.platform.js','vz.recovery.js','vz.app.js','vz.display.js','0vz.boot.js','vz.target.js','vz.state0','vz.state1'];
  function hash(x){var a=new Uint8Array(c.SHA256(x)),v='';for(var i=0;i<a.length;i++)v+=('0'+a[i].toString(16)).slice(-2);return v;}
  function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(function(k){return JSON.stringify(k)+':'+canonical(x[k]);}).join(',')+'}';return JSON.stringify(x);}
  function own(n){if(names.includes(n))return true;return t.files.some(function(_f,i){return n==='vz.f'+i;});}
  function temporaryBoot(n){return bootEntries.includes(n)&&n!=='.varimg';}
  function checkpointDigest(){return hash(canonical([raw('vz.state0')||null,raw('vz.state1')||null]));}
  function load(){var found=false,rows=[];[0,1].forEach(function(i){var b=raw('vz.state'+i);if(b===undefined)return;found=true;try{var v=JSON.parse(b);if(hash(v.body)!==v.sha256)return;var st=JSON.parse(v.body);if(typeof st.sequence!=='number'||!isFinite(st.sequence)||Math.floor(st.sequence)!==st.sequence||st.sequence<0||st.sequence>9007199254740000)return;rows.push(st);}catch(err){}});rows.sort(function(a,b){return b.sequence-a.sequence;});if(!rows.length){if(found)throw Error('Checkpoint corrotto: richiedi nuova conferma');return null;}sequence=rows[0].sequence;return rows[0];}
  function write(n,b,o,size){if(s.getStats().freeBytes<b.length+(size||0)+32768)throw Error('Spazio insufficiente, recupero conservato');if(s.write(n,b,o,size)===false)throw Error('Scrittura fallita');}
  function save(st){st.sequence=++sequence;var body=JSON.stringify(st),b=JSON.stringify({body:body,sha256:hash(body)}),name='vz.state'+sequence%2;write(name,b);if(raw(name)!==b)throw Error('Checkpoint non verificato');}
  function replace(st,expected){if(checkpointDigest()!==expected)throw Error('Checkpoint cambiato');save(st);save(st);}
  function streamChunks(name){var normal=s.list(undefined,{sf:false});return s.list().filter(function(n){return !normal.includes(n)&&n.length===name.length+1&&n.slice(0,-1)===name;});}
  function streamNames(){var normal=s.list(undefined,{sf:false}),seen={},names=[];s.list().forEach(function(n){if(normal.includes(n))return;var base=n.slice(0,-1);if(!seen[base]){seen[base]=true;names.push(base);}});return names;}
  function inventory(){var rows=s.list(undefined,{sf:false}).map(function(n){return {name:n,kind:'normal'};});streamNames().forEach(function(n){rows.push({name:n,kind:'storage-file'});});return rows.sort(function(a,b){var x=a.kind+':'+a.name,y=b.kind+':'+b.name;return x<y?-1:x>y?1:0;});}
  function removable(){var rows=s.list(undefined,{sf:false}).filter(function(n){return !own(n)&&!temporaryBoot(n);}).map(function(n){return {name:n,kind:'normal'};});streamNames().forEach(function(n){rows.push({name:n,kind:'storage-chunk'});});return rows;}
  function exists(f){if(f.kind==='normal')return raw(f.name)!==undefined;if(f.kind==='storage-chunk')return streamChunks(f.name).length>0;throw Error('Elemento non previsto');}
  function progress(phase,done,total,message){if(global.VeraZeroDisplay)global.VeraZeroDisplay.set(phase,done,total,message);}
  function arm(n){if(!bootEntries.includes(n))throw Error('Avvio non previsto');if(n==='.varimg'){if(raw(n)!==undefined)s.erase(n);if(raw(n)!==undefined)throw Error('Immagine precedente non rimossa');return;}var b=raw('vz.recovery.js');if(typeof b!=='string')throw Error('Recovery assente');if(raw(n)!==b){write(n,b);if(raw(n)!==b)throw Error('Recovery non verificata');}}
  function erase(f){if(own(f.name)||temporaryBoot(f.name))throw Error('Supporto recupero protetto');if(f.kind==='normal'){s.erase(f.name);return;}if(f.kind!=='storage-chunk')throw Error('Tipo cancellazione non previsto');if(!streamChunks(f.name).length)return;s.open(f.name,'r').erase();streamChunks(f.name).forEach(function(n){s.erase(n);});if(streamChunks(f.name).length)throw Error('Archivio non rimosso');}
  function securityStatus(){var st=NRF.getSecurityStatus();return {connected:!!st.connected,encrypted:!!st.encrypted,bonded:!!st.bonded};}
  function requestSecurity(){var st=securityStatus();if(!st.connected)throw Error('Bluetooth scollegato');if(!st.encrypted){if(typeof NRF.startBonding!=='function')throw Error('Associazione non disponibile');NRF.startBonding(false).then(function(){},function(){});}return securityStatus();}
  return {unbase64:atob,target:t,hash:hash,canonical:canonical,read:raw,write:write,load:load,save:save,replace:replace,checkpointDigest:checkpointDigest,currentBinding:function(){var st=load();return st&&st.binding;},
    supportIntact:function(){return t.supportFiles.every(function(f){var b=raw(f.name);return typeof b==='string'&&b.length===f.size&&hash(b)===f.sha256;});},
    bootEntries:bootEntries,cleanupBootEntries:cleanupBootEntries,arm:arm,inventory:inventory,countRemovable:function(){return removable().length;},nextRemovable:function(){return removable()[0];},exists:exists,erase:erase,
    unexpected:function(){return inventory().some(function(f){return f.kind!=='normal'||(!own(f.name)&&!temporaryBoot(f.name)&&!t.files.some(function(x){return x.name===f.name;}));});},
    inspect:function(){return {board:process.env.BOARD,firmware:process.env.VERSION,mac:NRF.getAddress().split(' ')[0].toUpperCase(),batteryPercent:E.getBattery(),freeBytes:s.getStats().freeBytes,compatible:process.env.BOARD==='BANGLEJS2'&&process.env.VERSION==='2v29'};},
    mac:function(){return NRF.getAddress().split(' ')[0].toUpperCase();},encrypted:function(){return NRF.getSecurityStatus().encrypted===true;},isolated:function(){return global.VeraZeroRecovery===true;},securityStatus:securityStatus,requestSecurity:requestSecurity,
    enter:function(){setTimeout(function(){global.load('vz.app.js');},200);},removeBoot:function(n){if(!cleanupBootEntries.includes(n))throw Error('Avvio non previsto');if(raw(n)!==undefined)s.erase(n);if(raw(n)!==undefined)throw Error('Avvio temporaneo non rimosso');},
    invalidateBoot:function(){delete global.VeraZeroBootGeneration;delete global.VeraZeroBootExecutionId;},bootReceipt:function(){return {generation:global.VeraZeroBootGeneration,executionId:global.VeraZeroBootExecutionId};},
    setClock:function(ms){setTime(ms/1000);return Math.round(getTime()*1000);},clockUtcMs:function(){return Math.round(getTime()*1000);},consentChanged:function(on){if(global.VeraZeroDisplay)global.VeraZeroDisplay.setConsent(on);},
    settings:function(){try{return JSON.parse(raw('setting.json'));}catch(err){return {};}},health:function(){var n=global.VeraNode;if(!n||!n.health)return null;var h=n.health();h.sampleCount=n.samples?Math.max(0,n.samples.next-1):0;return h;},progress:progress,
    activate:function(){setTimeout(function(){global.load();},300);},cleanup:function(){t.files.forEach(function(_f,i){if(raw('vz.f'+i)!==undefined)s.erase('vz.f'+i);});}
  };
};
