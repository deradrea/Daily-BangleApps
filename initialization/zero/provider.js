/* Zero initialization: new destructive intent, selective wipe, no eraseAll. */
exports.create=function(e){
  var state=null,loadError=null,consent=false,upload,stagedVerified=false,appConfirmed=e.target.authorizationMode==='app-confirmed';
  function fail(s){throw Error(s);}
  function integer(n){return typeof n==='number'&&isFinite(n)&&Math.floor(n)===n;}
  function same(a,b){return e.canonical(a)===e.canonical(b);}
  function uuid(s){return typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);}
  function valid(b){var keys=['executionId','generation','deviceId','mac','board','firmware','packageSha256','intent'];return b&&Object.keys(b).length===keys.length&&Object.keys(b).every(function(k){return keys.includes(k);})&&uuid(b.executionId)&&uuid(b.generation)&&integer(b.deviceId)&&b.deviceId>0&&b.deviceId<=9007199254740991&&typeof b.mac==='string'&&/^([A-F0-9]{2}:){5}[A-F0-9]{2}$/.test(b.mac)&&b.board==='BANGLEJS2'&&b.firmware==='2v29'&&b.intent==='initialize-from-zero'&&typeof b.packageSha256==='string'&&/^[a-f0-9]{64}$/.test(b.packageSha256);}
  function validState(st){
    var phases=['prepared','staging','quarantining','wiping','installing','verified','activating','activation-pending','complete'];
    if(!st||!valid(st.binding)||st.protocol!==1||st.targetFingerprint!==e.target.fingerprint||!phases.includes(st.phase)||!Array.isArray(st.staged))return false;
    if(st.staged.some(function(n,i,a){return !integer(n)||n<0||n>=e.target.files.length||a.indexOf(n)!==i;}))return false;
    if(typeof st.wipeConsumed!=='boolean'||typeof st.bootCommitted!=='boolean')return false;
    var limits={removed:9007199254740991,wipeTotal:9007199254740991,installed:e.target.files.length-1,armed:e.bootEntries.length,activation:e.cleanupBootEntries.length};
    if(Object.keys(limits).some(function(k){return !integer(st[k])||st[k]<0||st[k]>limits[k];}))return false;
    if(st.pending&&(!['boot','normal','storage-chunk','install','activation'].includes(st.pending.kind)||typeof st.pending.name!=='string'))return false;
    if(!st.wipeConsumed&&!['prepared','staging'].includes(st.phase))return false;
    if(st.clock&&(!uuid(st.clock.requestId)||!integer(st.clock.serverUtcMs)||!integer(st.clock.deviceUtcMs)))return false;
    return true;
  }
  try{state=e.load();if(state&&!validState(state))throw Error('Registro non riconosciuto');}catch(err){loadError=String(err);state=null;}
  function secure(){if(!e.encrypted())fail('Collegamento cifrato necessario');}
  function bound(){secure();if(!state||e.mac()!==state.binding.mac||!same(e.currentBinding(),state.binding))fail('Esecuzione superata o MAC non corrispondente');}
  function save(){e.save(state);}
  function paint(){if(state)e.progress(state.phase,state.phase==='wiping'?state.removed:state.phase==='installing'?state.installed:state.phase==='quarantining'?state.armed:state.staged.length,state.phase==='wiping'?state.wipeTotal:state.phase==='quarantining'?e.bootEntries.length:state.phase==='installing'?e.target.files.length-1:e.target.files.length);}
  function file(i){if(!integer(i)||i<0||i>=e.target.files.length)fail('File target non previsto');return e.target.files[i];}
  function stageName(i){return 'vz.f'+i;}
  function matches(n,f){var b=e.read(n);return typeof b==='string'&&b.length===f.size&&e.hash(b)===f.sha256;}
  function staged(){if(stagedVerified)return;if(state.staged.length!==e.target.files.length||e.target.files.some(function(f,i){return !matches(stageName(i),f);}))fail('Staging incompleto o corrotto');stagedVerified=true;}
  function status(){return {protocol:1,authorizationMode:appConfirmed?'app-confirmed':'physical-device',physicalConsentRequired:!appConfirmed,binding:state&&state.binding,phase:loadError?'checkpoint-error':state?state.phase:'unprepared',checkpointDigest:e.checkpointDigest(),targetFingerprint:e.target.fingerprint,stagedFiles:state?state.staged.length:0,targetFiles:e.target.files.length,wipeConsumed:!!state&&state.wipeConsumed,removed:state&&state.removed||0,wipeTotal:state&&state.wipeTotal||0,installed:state?(state.installed+(state.bootCommitted?1:0)):0,clockInitialized:!!state&&!!state.clock,consent:consent,isolated:e.isolated(),softwareReady:!!state&&state.phase==='complete',error:loadError};}
  function inspect(){var info=e.inspect();info.checkpointDigest=e.checkpointDigest();info.status=status();return info;}
  function prepare(binding,previousCheckpointDigest){
    secure();if(!valid(binding)||e.mac()!==binding.mac)fail('Identita o binding non validi');
    if(state&&same(state.binding,binding))return status();
    if(!appConfirmed&&!consent)fail('Conferma attuale sul Bangle necessaria');
    if(previousCheckpointDigest!==e.checkpointDigest())fail('Checkpoint cambiato prima della nuova esecuzione');
    var info=e.inspect();if(!info.compatible)fail('Modello o firmware non supportato');
    if(!integer(info.batteryPercent)||info.batteryPercent<50||info.batteryPercent>100)fail('Carica il Bangle almeno al 50%');
    if(!integer(info.freeBytes)||info.freeBytes<e.target.stagingBytes*2+65536)fail('Spazio insufficiente per staging e recupero');
    state={protocol:1,binding:binding,targetFingerprint:e.target.fingerprint,phase:'prepared',staged:[],wipeConsumed:false,removed:0,wipeTotal:0,installed:0,bootCommitted:false,armed:0,activation:0,pending:null};
    e.replace(state,previousCheckpointDigest);e.invalidateBoot();loadError=null;upload=undefined;stagedVerified=false;paint();return status();
  }
  function recover(binding){bound();if(!same(binding,state.binding))fail('Ripresa di un altra esecuzione');consent=false;e.consentChanged(false);upload=undefined;stagedVerified=false;paint();return status();}
  function stage(index,offset,total,base64){
    bound();if(['activating','activation-pending','complete'].includes(state.phase))fail('Caricamento non previsto');
    var f=file(index),raw=e.unbase64(base64);if(!integer(offset)||offset<0||total!==f.size||!raw.length||raw.length>384||offset+raw.length>total)fail('Blocco non valido');
    if(state.staged.includes(index)){if(matches(stageName(index),f))return status();if(offset!==0)fail('Ripeti il file corrotto da zero');state.staged=state.staged.filter(function(n){return n!==index;});save();}stagedVerified=false;
    if(offset===0){upload={index:index,next:0};e.write(stageName(index),'',0,total);}
    if(!upload||upload.index!==index||upload.next!==offset)fail('Ordine blocchi non valido');
    e.write(stageName(index),raw,offset);upload.next+=raw.length;
    if(upload.next===total){if(!matches(stageName(index),f))fail('Hash staging non corrispondente');state.staged.push(index);if(!state.wipeConsumed)state.phase='staging';save();upload=undefined;}
    var bytes=state.staged.reduce(function(n,i){return n+file(i).size;},0)+(upload?upload.next:0);e.progress('upload',bytes,e.target.stagingBytes);return status();
  }
  function physical(){bound();if(!appConfirmed&&!consent)fail('Consenso sul display necessario');}
  function beginWipe(fingerprint){
    physical();if(fingerprint!==e.target.fingerprint)fail('Target differente');
    if(state.wipeConsumed)return status();
    staged();if(!e.supportIntact())fail('Supporto di recupero non integro');if(!['prepared','staging'].includes(state.phase))fail('Fase non valida');
    state.wipeConsumed=true;state.phase='quarantining';save();paint();return status();
  }
  function step(){
    physical();if(!state.wipeConsumed)fail('Formattazione non autorizzata');staged();
    if(state.phase==='quarantining'){
      if(state.armed<e.bootEntries.length){var entry=e.bootEntries[state.armed];state.pending={kind:'boot',name:entry};save();e.arm(entry);state.armed++;state.pending=null;save();paint();return status();}
      state.wipeTotal=e.countRemovable();state.phase='wiping';save();paint();e.enter();return status();
    }
    if(!e.isolated())fail('Recovery non isolata');
    if(state.phase==='wiping'){
      var row=state.pending||e.nextRemovable();
      if(!row){state.phase='installing';save();paint();return status();}
      if(!state.pending){state.pending={kind:row.kind,name:row.name};save();}
      if(e.exists(row))e.erase(row);
      if(e.exists(row))fail('Cancellazione non verificata');
      state.removed++;state.pending=null;save();paint();return status();
    }
    if(state.phase==='installing'){
      var targets=e.target.files.filter(function(f){return f.name!=='.boot0'&&f.name!=='.bootcde';}).concat(e.target.files.filter(function(f){return f.name==='.bootcde';}));
      if(state.installed>=targets.length){verify();return status();}
      var target=targets[state.installed],i=e.target.files.findIndex(function(f){return f.name===target.name;});
      if(!matches(stageName(i),target))fail('Staging file corrotto, ripeti il caricamento');state.pending={kind:'install',name:target.name};save();
      if(!matches(target.name,target)){e.write(target.name,e.read(stageName(i)));if(!matches(target.name,target))fail('Installazione non verificata');}
      state.installed++;state.pending=null;save();paint();return status();
    }
    if(state.phase==='verified')return status();fail('Usa attivazione o ripresa della stessa esecuzione');
  }
  function verify(){
    bound();if(!['installing','verified','activating','activation-pending','complete'].includes(state.phase)||(state.pending&&!(state.phase==='activating'&&state.pending.kind==='activation'&&state.pending.name===e.cleanupBootEntries[state.activation]))||state.installed!==e.target.files.length-1)fail('Installazione incompleta');
    e.target.files.forEach(function(f){if(f.name!=='.boot0'&&!matches(f.name,f))fail('Target non corrispondente: '+f.name);});
    if(state.phase==='installing'||state.phase==='verified'){
      if(e.unexpected())fail('Contenuti estranei dopo la formattazione');
      state.phase='verified';save();paint();
    }
    return {verified:true,binding:state.binding,targetFingerprint:e.target.fingerprint,files:e.target.files.length};
  }
  function syncTime(binding,serverUtcMs,requestId){
    bound();if(!same(binding,state.binding)||state.phase!=='verified'||!integer(serverUtcMs)||serverUtcMs<1577836800000||serverUtcMs>4102444800000||!uuid(requestId))fail('Orario o fase non validi');
    if(state.clock&&state.clock.requestId===requestId){if(state.clock.serverUtcMs!==serverUtcMs)fail('Richiesta orario cambiata');return state.clock;}
    var actual=e.setClock(serverUtcMs);if(Math.abs(actual-serverUtcMs)>1000)fail('Orario non verificato');state.clock={requestId:requestId,serverUtcMs:serverUtcMs,deviceUtcMs:actual};save();return state.clock;
  }
  function activate(){
    physical();if(!state.clock)fail('Sincronizza prima l orario con Vera');if(!['verified','activating','activation-pending'].includes(state.phase))fail('Attivazione non prevista');verify();staged();if(!e.supportIntact())fail('Supporto di recupero non integro');
    e.invalidateBoot();state.phase='activating';save();paint();
    while(state.activation<e.cleanupBootEntries.length){var n=e.cleanupBootEntries[state.activation];state.pending={kind:'activation',name:n};save();e.removeBoot(n);state.activation++;state.pending=null;save();}
    var i=e.target.files.findIndex(function(f){return f.name==='.boot0';}),f=file(i);
    if(!matches(stageName(i),f))fail('Staging avvio corrotto');if(!matches(f.name,f)){e.write(f.name,e.read(stageName(i)));if(!matches(f.name,f))fail('Avvio non verificato');}
    state.bootCommitted=true;state.phase='activation-pending';save();paint();e.activate();return {activationScheduled:true,softwareReady:false,binding:state.binding};
  }
  function confirm(binding){
    bound();if(!same(binding,state.binding)||!['activation-pending','complete'].includes(state.phase))fail('Esito di un altra esecuzione');
    var receipt=e.bootReceipt();if(receipt.generation!==state.binding.generation||receipt.executionId!==state.binding.executionId)fail('Riavvio ufficiale non ancora verificato');
    var h=e.health();if(e.settings().clock!=='veranode.app.js'||!h||h.running!==true||h.scheduled!==true||h.hrmRequested!==true)fail('Vera o raccolta non avviati');
    verify();state.phase='complete';save();e.cleanup();paint();return {softwareReady:true,clockVerified:false,sensorSamplesVerified:false,collectionRunning:true,binding:state.binding,clockUtcMs:e.clockUtcMs(),runtimePackageSha256:e.target.runtimePackageSha256,health:h};
  }
  function inventoryPage(offset,limit){bound();if(!integer(offset)||!integer(limit)||offset<0||limit<1||limit>24)fail('Pagina non valida');var rows=e.inventory();return {offset:offset,total:rows.length,next:Math.min(rows.length,offset+limit),files:rows.slice(offset,offset+limit)};}
  var api={protocol:1,status:status,inspect:inspect,requestSecurity:e.requestSecurity,securityStatus:e.securityStatus,setConsent:function(on){consent=on===true;e.consentChanged(consent);paint();},prepare:prepare,recover:recover,stage:stage,beginWipe:beginWipe,step:step,verify:verify,syncTime:syncTime,activate:activate,confirm:confirm,inventoryPage:inventoryPage};
  Object.keys(api).forEach(function(k){if(typeof api[k]==='function'){var fn=api[k];api[k]=function(){try{return fn.apply(null,arguments);}catch(err){e.progress('error',0,0,String(err));throw err;}};}});return api;
};
