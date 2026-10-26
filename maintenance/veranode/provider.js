/* Vera isolated software maintenance. No telemetry rewrite, ACK, clock or erase API. */
exports.create = function(env) {
  var names = ['veranode.clock.js','veranode.app.js','veranode.core.js','veranode.runtime.js',
    'veranode.wire.js','veranode.img','veranode.boot.js','veranode.info'];
  if (!env.isolated()) throw new Error('Ambiente non isolato');
  var state = env.load(), lease, expires = 0, upload, rowsCache;
  function integer(n) { return typeof n==='number' && isFinite(n) && Math.floor(n)===n; }
  function fail(text) { throw new Error(text); }
  function digest(raw) { return env.hash(raw); }
  // Espruino 2v29 does not implement counted regular-expression repetitions.
  function sha(value) { return typeof value==='string' && value.length===64 && !/[^a-f0-9]/.test(value); }
  function operation(value) {
    var fields=['operationId','deviceId','mac','actorId','upgradeSha256','targetPackageSha256','contextSha256'];
    function uuid(x){if(typeof x!=='string')return false;var a=x.split('-'),lens=[8,4,4,4,12];return a.length===5&&a.every(function(v,i){return v.length===lens[i]&&!/[^a-f0-9]/.test(v);});}
    return value && Object.keys(value).length===fields.length && fields.every(function(k){return value[k]!==undefined;}) &&
      uuid(value.operationId) &&
      integer(value.deviceId) && value.deviceId>0 && value.mac===state.binding.mac &&
      ((typeof value.actorId==='string' && value.actorId.length>0 && value.actorId.length<=128)||(integer(value.actorId)&&value.actorId>0)) &&
      value.upgradeSha256===state.binding.targetHash && sha(value.upgradeSha256) && sha(value.targetPackageSha256) && sha(value.contextSha256);
  }
  function profileHash() {var raw=env.readNormal('veranode.policy.json');return raw===undefined?null:digest(raw);}
  function persist() { env.save(state); }
  if (!state || !state.binding || !state.plan || !Array.isArray(state.plan.files) || state.plan.files.length!==names.length ||
    names.some(function(n){return state.plan.files.filter(function(f){return f.name===n;}).length!==1;}) ||
    state.plan.files.some(function(f){return !sha(f.hash)||!sha(f.sourceHash)||
      !integer(f.size)||!integer(f.sourceSize)||f.size<1||f.sourceSize<1||f.size>100000||f.sourceSize>100000;})) fail('Piano manutenzione non valido');
  if(state.operationBinding && !operation(state.operationBinding))fail('Operazione non valida');

  function same(a,b) { return env.canonical(a) === env.canonical(b); }
  function allowed(name, raw) {
    var hash = digest(raw);
    return state.plan.files.some(function(f) { return f.name === name &&
      ((f.sourceHash === hash && f.sourceSize === raw.length) || (f.hash === hash && f.size === raw.length)); });
  }
  function file(name) { return env.readNormal(name); }
  function matches(name, hash, size) { var raw=file(name); return typeof raw==='string' && raw.length===size && digest(raw)===hash; }
  function recover() {
    var tx = state.transaction;
    if (!tx) return;
    var p=state.plan.files.find(function(f){return f.name===tx.name;});
    function planned(hash,size) {return p && ((hash===p.sourceHash && size===p.sourceSize)||(hash===p.hash && size===p.size));}
    if (!planned(tx.oldHash,tx.oldSize)||!planned(tx.newHash,tx.newSize)) fail('Transazione non valida');
    if (!matches(tx.name,tx.oldHash,tx.oldSize) && !matches(tx.name,tx.newHash,tx.newSize)) {
      if (!matches('veram.old',tx.oldHash,tx.oldSize)) fail('Ripristino file da completare');
      env.writeNormal(tx.name,file('veram.old'));
      if (!matches(tx.name,tx.oldHash,tx.oldSize)) fail('Ripristino file non verificato');
    }
    state.transaction = null; persist();
  }
  function guard(token) {
    if (!env.isolated() || !env.encrypted() || !lease || token!==lease || env.now()>=expires)
      fail('Sessione manutenzione assente o scaduta');
    if (state.profileCaptured===true ? profileHash()!==state.profileSha256 :
      !same(env.profileIdentity(), {user:state.binding.user,scope:state.binding.scope,mac:state.binding.mac}))
      fail('Profilo cambiato');
  }
  function protectedFiles(rows) { return rows.filter(function(f) { return !(f.kind==='normal' && names.includes(f.name)); }); }
  function inventoryRows() { return env.inventory().sort(function(a,b) { var x=a.kind+':'+a.name,y=b.kind+':'+b.name;return x<y?-1:x>y?1:0; }); }
  function unchanged(rows) {
    if (!same(protectedFiles(rows || inventoryRows()), state.protected)) fail('Dati o profilo cambiati');
  }
  function response() { return {token:lease,snapshot:state.snapshot,isolated:true,consent:true,binding:state.binding,operationBinding:state.operationBinding,ttlMs:expires-env.now()}; }
  function begin(binding, ttl, resume, operationBinding) {
    if (!env.isolated() || !env.encrypted() || !env.consent()) fail('Consenso necessario');
    if (!same(binding,state.binding) || (resume && resume!==state.snapshot)) fail('Contesto diverso');
    if (state.operationBinding && !same(operationBinding,state.operationBinding)) fail('Operazione diversa');
    if (!integer(ttl) || ttl<1 || ttl>60000) fail('Durata non valida');
    recover();
    if (!state.protected) {
      var rows=inventoryRows();
      names.forEach(function(n) { var f=rows.find(function(v) { return v.name===n && v.kind==='normal'; });
        var p=state.plan.files.find(function(v) { return v.name===n; });
        if (!f || !p || !((f.hash===p.sourceHash && f.size===p.sourceSize)||(state.mode==='rollback-only' && f.hash===p.hash && f.size===p.size))) fail('Software origine diverso'); });
      state.protected=protectedFiles(rows);state.profileSha256=profileHash();state.profileCaptured=true;state.phase='backup';persist();
    } else unchanged();
    if(env.consumeConsent)env.consumeConsent();
    lease=env.random(); expires=env.now()+ttl;upload=undefined;rowsCache=undefined;
    return response();
  }
  function renew(token,ttl) { guard(token);if(!integer(ttl)||ttl<1||ttl>60000)fail('Durata non valida');expires=env.now()+ttl;return response(); }
  function inventory(token) { guard(token);recover();var rows=inventoryRows();unchanged(rows);rowsCache=rows;return {token:lease,snapshot:state.snapshot,isolated:true,binding:state.binding,files:rows}; }
  function inventoryPage(token,offset,limit) {
    guard(token);
    if(!integer(offset)||!integer(limit)||offset<0||limit<1||limit>32)fail('Pagina inventario non valida');
    if(offset===0)inventory(token);
    if(!rowsCache||offset>rowsCache.length)fail('Inventario da rileggere');
    return {token:lease,snapshot:state.snapshot,isolated:true,binding:state.binding,offset:offset,
      next:Math.min(offset+limit,rowsCache.length),total:rowsCache.length,files:rowsCache.slice(offset,offset+limit)};
  }
  function read(token, descriptor, offset, length) {
    guard(token);if(!rowsCache)rowsCache=inventoryRows();var f=rowsCache.find(function(r){return r.kind===descriptor.kind&&r.name===descriptor.name;});
    if (!f || !same(f,descriptor) || !integer(offset)||!integer(length)||offset<0||length<1||length>512||offset+length>f.size) fail('Blocco non valido');
    return {token:lease,offset:offset,base64:env.base64(env.read(f,offset,length))};
  }
  function replaceSoftware(token,name,offset,total,base64) {
    guard(token);if(offset===0)unchanged();
    var p=state.plan.files.find(function(f){return f.name===name;}), raw=env.unbase64(base64);
    if (!p || !names.includes(name) || !integer(offset)||!integer(total)||offset<0||raw.length<1||raw.length>384||offset+raw.length>total||total>100000 ||
      (total!==p.size && total!==p.sourceSize)) fail('File software non consentito');
    if(state.mode==='rollback-only' && total!==p.sourceSize)fail('Solo ripristino consentito');
    if (offset===0) upload={name:name,total:total,next:0};
    if (!upload||upload.name!==name||upload.total!==total||upload.next!==offset) fail('Ordine blocchi diverso');
    // Allocation and first bytes must be one write: another offset-zero write
    // truncates an existing Storage file on the native Espruino implementation.
    env.writeNormal('veram.stage',raw,offset,offset===0?total:undefined);upload.next+=raw.length;
    if (upload.next===total) {
      var next=file('veram.stage'),old=file(name);
      if (!allowed(name,next)||!allowed(name,old)) fail('Hash software inatteso');
      if(state.mode==='rollback-only' && (digest(next)!==p.sourceHash||next.length!==p.sourceSize))fail('Solo ripristino consentito');
      env.writeNormal('veram.old',old);
      if (!matches('veram.old',digest(old),old.length)) fail('Copia precedente non verificata');
      state.transaction={name:name,oldHash:digest(old),oldSize:old.length,newHash:digest(next),newSize:next.length};
      state.phase='writing';persist();
      env.writeNormal(name,next);
      if (!matches(name,state.transaction.newHash,state.transaction.newSize)) fail('File scritto non verificato');
      state.transaction=null;persist();upload=undefined;rowsCache=undefined;
      env.progress(name);
    }
    return {token:lease,next:offset+raw.length};
  }
  function originalReady() {return state.plan.files.every(function(f){return matches(f.name,f.sourceHash,f.sourceSize);});}
  function cancelLocally() {
    recover();unchanged();if(!originalReady())fail('Riprendi il recupero dall app');
    state.phase='rollback-pending';persist();env.activate();return {resumeRequested:true};
  }
  function end(token) {
    guard(token);recover();unchanged();var resume=originalReady();
    if(resume)cancelLocally();lease=undefined;expires=0;return {token:token,released:true,resumeRequested:resume};
  }
  function activate(token, rollback) {
    guard(token);recover();unchanged();
    if(state.mode==='rollback-only' && rollback!==true)fail('Solo ripristino consentito');
    state.plan.files.forEach(function(f){if(!matches(f.name,rollback?f.sourceHash:f.hash,rollback?f.sourceSize:f.size))fail('Software incompleto');});
    state.phase=rollback?'rollback-pending':'activation-pending';persist();
    env.activate();return {token:lease,activationRequested:true};
  }
  // Recovery is possible without an active BLE lease; no acquisition starts here.
  recover();
  function status() {
    if(!env.encrypted())fail('Associazione cifrata necessaria');
    var rows=inventoryRows(),protectedRows=protectedFiles(rows);
    if(state.protected)unchanged(rows);
    return {operationBinding:state.operationBinding,binding:state.binding,snapshot:state.snapshot,phase:state.phase,
      frozen:env.isolated(),consent:env.consent(),inventorySha256:digest(env.canonical({token:state.snapshot,files:rows})),
      protectedSha256:digest(env.canonical(protectedRows)),profileSha256:profileHash(),
      collectionWasRunning:state.collectionWasRunning===true,expectedCollectionRunning:state.expectedCollectionRunning===undefined?state.collectionWasRunning===true:state.expectedCollectionRunning===true,mode:state.mode||'update',files:rows.filter(function(f){return f.kind==='normal'&&names.includes(f.name);})};
  }
  function operationContext() {
    if(!env.encrypted())fail('Associazione cifrata necessaria');
    return {operationBinding:state.operationBinding,snapshot:state.snapshot,frozen:env.isolated(),consent:env.consent(),phase:state.phase};
  }
  function adoptRecovery(parent,child) {
    if(!env.isolated()||!env.encrypted()||!env.consent())fail('Consenso necessario');
    if(!same(parent,state.operationBinding)||!operation(child)||child.operationId===parent.operationId||
      child.deviceId!==parent.deviceId||child.actorId!==parent.actorId||child.targetPackageSha256!==parent.targetPackageSha256)fail('Recupero diverso');
    recover();unchanged();state.parentOperationBinding=parent;state.operationBinding=child;state.mode='rollback-only';persist();
    lease=undefined;expires=0;upload=undefined;rowsCache=undefined;
    return status();
  }
  return {protocol:1,status:status,operationContext:operationContext,adoptRecovery:adoptRecovery,begin:begin,renew:renew,inventory:inventory,inventoryPage:inventoryPage,read:read,replaceSoftware:replaceSoftware,end:end,activate:activate,cancelLocally:cancelLocally};
};
