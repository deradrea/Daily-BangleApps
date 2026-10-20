/* Local candidate, not imported by boot/runtime or exposed over BLE.
 * Every destructive step requires an already verified durable signed intent.
 */
exports.create = function(env) {
  var journal=env.journal, storage=env.storage, core=env.core, auth=env.authorization;
  var prefix=journal.prefix, challenge=null, operation=null, generation=0, verifiedKey=null;
  function load() {
    var a=core.unpack(storage.read(prefix+"erase0")),b=core.unpack(storage.read(prefix+"erase1"));
    var last=a && (!b || a.generation>b.generation) ? a : b;
    if(last)generation=last.generation;
    return last;
  }
  var saved=load();
  if(saved && saved.phase==="intent") { operation=saved; journal.eraseLock=true; }
  function ready() {
    return env.executionEnabled===true && env.resourcesValidated===true && env.consoleDisabled===true &&
      env.trust && env.trust.provisioned===true && auth.hex(env.trust.publicKey,32) &&
      typeof env.verify==="function" && typeof env.sha256==="function" &&
      typeof env.randomHex==="function" && typeof env.monotonic==="function" && typeof env.time==="function" && typeof env.binding==="function";
  }
  function copy(value) { return value ? JSON.parse(JSON.stringify(value)) : value; }
  function verifiedTime() {
    var time=env.time();
    if(!time || time.verified!==true || typeof time.now!=="number" || !isFinite(time.now) ||
      typeof time.uncertaintyMs!=="number" || !isFinite(time.uncertaintyMs) || time.uncertaintyMs<0 || time.uncertaintyMs>2000 ||
      typeof time.revision!=="number" || !isFinite(time.revision) || time.revision<0 || Math.floor(time.revision)!==time.revision)
      throw new Error("Ora non verificata");
    return time;
  }
  function timer() {
    var mono=env.monotonic();
    if(typeof mono!=="number" || !isFinite(mono) || mono<0)throw new Error("Timer non verificato");
    return mono;
  }
  function requireReady() { if(!ready())throw new Error("Esecuzione amministrativa non abilitata"); }
  function binding() {
    var b=env.binding();
    if(!b || b.mac!==env.trust.mac || b.issuer!==env.trust.issuer || b.keyId!==env.trust.keyId)
      throw new Error("Provisioning diverso");
    return b;
  }
  function checkBinding(body) {
    var b=binding();
    ["issuer","keyId","mac","userUuid","companyId","assignmentId","scope"].forEach(function(k){
      if(body[k]!==b[k])throw new Error("Assegnazione o chiave cambiata");
    });
  }
  function signature(grant) {
    if(!grant || Object.keys(grant).length!==2 || !grant.body || !grant.signature)
      throw new Error("Busta firma non valida");
    var message=auth.canonical(grant.body);
    checkBinding(grant.body);
    if(env.verify(message,grant.signature,env.trust.publicKey)!==true)throw new Error("Firma non valida");
    return message;
  }
  function persist(value) {
    value.generation=generation+1;
    var encoded=core.pack(value),name=prefix+"erase"+(value.generation%2);
    storage.write(name,encoded);
    if(storage.read(name)!==encoded)throw new Error("Registro amministrativo non confermato");
    generation=value.generation; saved=value;
  }
  function exists(name) {
    var files=storage.list(undefined,{sf:true});
    return files.includes(name) || files.includes(name+"\x01");
  }
  function fingerprint(name) {
    var reader=storage.open(name,"r"),raw="",line;
    while((line=reader.readLine())!==undefined) {
      var row=core.unpack(line);
      if(!row || row.epoch!==journal.checkpoint.epoch || typeof row.seq!=="number" ||
        row.seq<1 || row.seq>journal.next-1 || Math.floor(row.seq)!==row.seq)throw new Error("Record non verificato");
      raw+=line+"\n";
      if(raw.length>60000)throw new Error("Segmento oltre il limite");
    }
    return env.sha256(raw);
  }
  function plan() {
    if(journal.segments.length>96)throw new Error("Archivio oltre il budget amministrativo validabile");
    return journal.segments.map(function(s){return {name:s.name,count:s.count,last:s.last,hash:fingerprint(s.name)};});
  }
  function digest(rows) {
    return env.sha256(JSON.stringify(rows.map(function(s){return [s.name,s.count,s.last,s.hash];})));
  }
  function assertPlan(record, recovering) {
    if(!Array.isArray(record.plan) || !record.plan.length || record.plan.length>96 || digest(record.plan)!==record.grant.body.planHash)
      throw new Error("Piano non verificato");
    var total=0,names=[];
    record.plan.forEach(function(s){
      var suffix=typeof s.name==="string" ? s.name.slice(prefix.length) : "";
      if(!s.name || s.name.slice(0,prefix.length)!==prefix || !/^[0-9]+$/.test(suffix) || String(Number(suffix))!==suffix ||
        Number(suffix)>=512 || names.includes(s.name) || !auth.hex(s.hash,32) ||
        typeof s.count!=="number" || s.count<0 || s.count>32 || Math.floor(s.count)!==s.count ||
        typeof s.last!=="number" || s.last<0 || s.last>record.grant.body.high || Math.floor(s.last)!==s.last)
        throw new Error("Segmento non valido");
      names.push(s.name);total+=s.count;
      if(exists(s.name)) { if(fingerprint(s.name)!==s.hash)throw new Error("Contenuto cambiato"); }
      else if(!recovering)throw new Error("Segmento mancante");
    });
    if(total!==record.grant.body.stored)throw new Error("Conteggio diverso");
    if(journal.segments.some(function(s){return !names.includes(s.name);}))throw new Error("Nuovi campioni da preservare");
  }
  function checkpoint(pending) {
    var body=operation.grant.body,old=journal.checkpoint;
    if(old.epoch!==body.epoch || journal.next-1!==body.high ||
      ((old.adminCounter||0)!==body.counter && (old.adminCounter||0)!==body.counter-1) || (old.eraseOperation && old.eraseOperation!==body.operationId))
      throw new Error("Archivio o operazione cambiata");
    var value={generation:old.generation+1,ack:old.ack,epoch:old.epoch,
      discardedThrough:body.high,adminCounter:body.counter,eraseOperation:pending ? body.operationId : null};
    journal.saveCheckpoint(value);journal.checkpoint=value;journal.reader=null;
  }
  function createChallenge(operationId) {
    requireReady();
    if(operation || journal.eraseLock)throw new Error("Ripristino amministrativo richiesto");
    var time=verifiedTime(),b=binding(),stats=journal.stats();
    if(stats.stored<1)throw new Error("Archivio vuoto");
    var rows=plan(),nonce=env.randomHex(32),monotonic=timer();
    if(!auth.hex(nonce,32) || !isFinite(monotonic))throw new Error("Nonce o timer non disponibili");
    var body={v:1,issuer:b.issuer,keyId:b.keyId,operationId:operationId,mac:b.mac,userUuid:b.userUuid,
      companyId:b.companyId,assignmentId:b.assignmentId,scope:b.scope,epoch:journal.checkpoint.epoch,
      high:journal.next-1,stored:stats.stored,pending:stats.pending,planHash:digest(rows),nonce:nonce,
      counter:(journal.checkpoint.adminCounter||0)+1,issuedAt:time.now,expiresAt:time.now+60000,clockRevision:time.revision};
    auth.canonical(body);
    challenge={body:body,plan:rows,monotonic:monotonic};
    return JSON.parse(JSON.stringify(body));
  }
  function begin(grant) {
    requireReady();
    var message=signature(grant),body=grant.body;
    // Return only the exact last durable result, without touching newer records.
    if(saved && saved.phase==="done" && saved.grant.body.operationId===body.operationId) {
      if(auth.canonical(saved.grant.body)!==message)throw new Error("Operazione in conflitto");
      return copy(saved.receipt);
    }
    if(operation || journal.eraseLock)throw new Error("Operazione gia in corso");
    var time=verifiedTime(),mono=timer();
    if(!challenge || time.verified!==true || time.revision!==body.clockRevision ||
      time.uncertaintyMs>2000 || time.now-time.uncertaintyMs<body.issuedAt || time.now+time.uncertaintyMs>body.expiresAt ||
      mono<challenge.monotonic || mono-challenge.monotonic>60000 ||
      (journal.checkpoint.adminCounter||0)+1!==body.counter)
      throw new Error("Autorizzazione scaduta o riutilizzata");
    // Only the issuer may shorten the validity window; all destructive bounds
    // must match the live challenge byte-for-byte.
    Object.keys(body).forEach(function(k){
      if(k!=="issuedAt" && k!=="expiresAt" && body[k]!==challenge.body[k])throw new Error("Grant fuori richiesta");
    });
    if(body.issuedAt<challenge.body.issuedAt || body.expiresAt>challenge.body.expiresAt)throw new Error("Validita estesa");
    var record={phase:"intent",grant:JSON.parse(JSON.stringify(grant)),plan:challenge.plan};
    if(journal.checkpoint.epoch!==body.epoch || journal.next-1!==body.high || journal.pending()!==body.pending || journal.stats().stored!==body.stored)
      throw new Error("Nuovi dati: ripeti la verifica");
    assertPlan(record,false);
    journal.eraseLock=true;
    try { persist(record); operation=record;verifiedKey=env.trust.publicKey;challenge=null;checkpoint(true); }
    catch(e) { operation=load();throw e; }
    return {state:"in_progress",operationId:body.operationId};
  }
  function step() {
    requireReady();
    if(!operation || operation.phase!=="intent")throw new Error("Nessuna operazione pendente");
    if(verifiedKey!==env.trust.publicKey) {
      signature(operation.grant);assertPlan(operation,true);verifiedKey=env.trust.publicKey;
    }
    var body=operation.grant.body;
    checkBinding(body);
    if(journal.checkpoint.epoch!==body.epoch || journal.next-1!==body.high ||
      ((journal.checkpoint.adminCounter||0)!==body.counter && (journal.checkpoint.adminCounter||0)!==body.counter-1))throw new Error("Archivio cambiato durante la cancellazione");
    if((journal.checkpoint.adminCounter||0)<body.counter)checkpoint(true);
    if(journal.segments.some(function(s){return !operation.plan.some(function(p){return p.name===s.name;});}))
      throw new Error("Nuovi segmenti da preservare");
    var target=operation.plan.filter(function(s){return exists(s.name);})[0];
    if(target) {
      if(fingerprint(target.name)!==target.hash)throw new Error("Segmento cambiato prima della cancellazione");
      storage.open(target.name,"r").erase();
      if(exists(target.name))throw new Error("Cancellazione non confermata");
      journal.segments=journal.segments.filter(function(s){return s.name!==target.name;});journal.reader=null;
      if(storage.erase)storage.erase(target.name+"idx");
      return {state:"in_progress",operationId:body.operationId};
    }
    journal.segments=[];journal.reader=null;
    checkpoint(false);
    var receipt={state:"completed",operationId:body.operationId,epoch:body.epoch,
      discardedThrough:body.high,removed:body.stored,removedPending:body.pending,counter:body.counter,
      custodyAck:journal.checkpoint.ack,hardwareAttested:false};
    persist({phase:"done",grant:operation.grant,plan:operation.plan,receipt:receipt});
    operation=null;journal.eraseLock=false;journal.full=false;
    return copy(receipt);
  }
  function resume() {
    requireReady();
    if(!operation || operation.phase!=="intent")throw new Error("Nessun ripristino pendente");
    signature(operation.grant);assertPlan(operation,true);verifiedKey=env.trust.publicKey;
    return step();
  }
  return {ready:ready,challenge:createChallenge,begin:begin,step:step,resume:resume,
    status:function(){return {executionEnabled:ready(),pending:!!operation,last:saved && saved.phase==="done" ? copy(saved.receipt) : null};}};
};
