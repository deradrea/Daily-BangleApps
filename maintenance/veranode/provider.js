/* Vera isolated software maintenance. No telemetry rewrite, ACK, clock or erase API. */
exports.create = function(env) {
  var names = ['veranode.clock.js','veranode.app.js','veranode.core.js','veranode.runtime.js',
    'veranode.wire.js','veranode.img','veranode.boot.js','veranode.info'];
  if (!env.isolated()) throw new Error('Ambiente non isolato');
  var state = env.load(), lease, expires = 0, upload, rowsCache;
  function integer(n) { return typeof n==='number' && isFinite(n) && Math.floor(n)===n; }
  function fail(text) { throw new Error(text); }
  function digest(raw) { return env.hash(raw); }
  function persist() { env.save(state); }
  if (!state || !state.binding || !state.plan || !Array.isArray(state.plan.files) || state.plan.files.length!==names.length ||
    names.some(function(n){return state.plan.files.filter(function(f){return f.name===n;}).length!==1;}) ||
    state.plan.files.some(function(f){return !/^[a-f0-9]{64}$/.test(f.hash)||!/^[a-f0-9]{64}$/.test(f.sourceHash)||
      !integer(f.size)||!integer(f.sourceSize)||f.size<1||f.sourceSize<1||f.size>100000||f.sourceSize>100000;})) fail('Piano manutenzione non valido');

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
    if (!names.includes(tx.name)) fail('Transazione non valida');
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
    if (!same(env.profileIdentity(), {user:state.binding.user,scope:state.binding.scope,mac:state.binding.mac}))
      fail('Profilo cambiato');
  }
  function protectedFiles(rows) { return rows.filter(function(f) { return !(f.kind==='normal' && names.includes(f.name)); }); }
  function inventoryRows() { return env.inventory().sort(function(a,b) { var x=a.kind+':'+a.name,y=b.kind+':'+b.name;return x<y?-1:x>y?1:0; }); }
  function unchanged(rows) {
    if (!same(protectedFiles(rows || inventoryRows()), state.protected)) fail('Dati o profilo cambiati');
  }
  function response() { return {token:lease,snapshot:state.snapshot,isolated:true,consent:true,binding:state.binding,ttlMs:expires-env.now()}; }
  function begin(binding, ttl, resume) {
    if (!env.isolated() || !env.encrypted() || !env.consent()) fail('Consenso necessario');
    if (!same(binding,state.binding) || (resume && resume!==state.snapshot)) fail('Contesto diverso');
    if (!integer(ttl) || ttl<1 || ttl>60000) fail('Durata non valida');
    recover();
    if (!state.protected) {
      var rows=inventoryRows();
      names.forEach(function(n) { var f=rows.find(function(v) { return v.name===n && v.kind==='normal'; });
        var p=state.plan.files.find(function(v) { return v.name===n; });
        if (!f || !p || f.hash!==p.sourceHash || f.size!==p.sourceSize) fail('Software origine diverso'); });
      state.protected=protectedFiles(rows); state.phase='backup';persist();
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
    if (offset===0) { upload={name:name,total:total,next:0};env.writeNormal('veram.stage','',0,total); }
    if (!upload||upload.name!==name||upload.total!==total||upload.next!==offset) fail('Ordine blocchi diverso');
    env.writeNormal('veram.stage',raw,offset);upload.next+=raw.length;
    if (upload.next===total) {
      var next=file('veram.stage'),old=file(name);
      if (!allowed(name,next)||!allowed(name,old)) fail('Hash software inatteso');
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
    state.phase='rolled-back';persist();env.activate();return {resumeRequested:true};
  }
  function end(token) {
    guard(token);recover();unchanged();var resume=originalReady();
    if(resume)cancelLocally();lease=undefined;expires=0;return {token:token,released:true,resumeRequested:resume};
  }
  function activate(token, rollback) {
    guard(token);recover();unchanged();
    state.plan.files.forEach(function(f){if(!matches(f.name,rollback?f.sourceHash:f.hash,rollback?f.sourceSize:f.size))fail('Software incompleto');});
    state.phase=rollback?'rolled-back':'activation-pending';persist();
    env.activate();return {token:lease,activationRequested:true};
  }
  // Recovery is possible without an active BLE lease; no acquisition starts here.
  recover();
  return {protocol:1,begin:begin,renew:renew,inventory:inventory,inventoryPage:inventoryPage,read:read,replaceSoftware:replaceSoftware,end:end,activate:activate,cancelLocally:cancelLocally};
};
