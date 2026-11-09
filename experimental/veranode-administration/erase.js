/* Trusted boot adapter candidate; not imported by the active default boot.
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
  if(saved && saved.phase==="intent") { operation=saved; journal.eraseLock=true;
    journal.eraseReserved=Array.isArray(saved.plan)?saved.plan.map(function(s){return s.name;}):[]; }
  function ready() {
    return env.executionEnabled===true && env.resourcesValidated===true && env.consoleDisabled===true &&
      env.trust && env.trust.provisioned===true && auth.hex(env.trust.publicKey,32) &&
      (typeof env.verify==="function" || typeof env.verifyAsync==="function") && typeof env.sha256==="function" &&
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
  function signature(grant,proof) {
    if(!grant || Object.keys(grant).length!==2 || !grant.body || !grant.signature)
      throw new Error("Busta firma non valida");
    var message=auth.canonical(grant.body);
    checkBinding(grant.body);
    if(!(proof && proof.message===message && proof.signature===grant.signature && proof.key===env.trust.publicKey) &&
      (typeof env.verify!=="function" || env.verify(message,grant.signature,env.trust.publicKey)!==true))throw new Error("Firma non valida");
    return message;
  }
  function persist(value) {
    value.generation=generation+1;
    var encoded=core.pack(value),name=prefix+"erase"+(value.generation%2);
    storage.write(name,encoded);
    if(storage.read(name)!==encoded)throw new Error("Registro amministrativo non confermato");
    generation=value.generation; saved=value;
  }
  function storageFiles() {
    return storage.list(undefined,{sf:true});
  }
  function exists(files,name) {
    return files.includes(name) || files.includes(name+"\x01");
  }
  function fingerprint(name,maximum,minimum) {
    var reader=storage.open(name,"r"),raw="",line,records=0;
    while((line=reader.readLine())!==undefined) {
      var row=core.unpack(line);
      if(!row || row.epoch!==journal.checkpoint.epoch || typeof row.seq!=="number" ||
        row.seq<1 || row.seq>(maximum===undefined?journal.next-1:maximum) ||
        (minimum!==undefined && row.seq<=minimum) || Math.floor(row.seq)!==row.seq)throw new Error("Record non verificato");
      raw+=line+"\n";
      records++;
      if(raw.length>60000)throw new Error("Segmento oltre il limite");
    }
    if(minimum!==undefined && records===0)throw new Error("Segmento futuro non verificato");
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
    var total=0,names=[],files=storageFiles();
    record.plan.forEach(function(s){
      var suffix=typeof s.name==="string" ? s.name.slice(prefix.length) : "";
      if(!s.name || s.name.slice(0,prefix.length)!==prefix || !/^[0-9]+$/.test(suffix) || String(Number(suffix))!==suffix ||
        Number(suffix)>=512 || names.includes(s.name) || !auth.hex(s.hash,32) ||
        typeof s.count!=="number" || s.count<0 || s.count>32 || Math.floor(s.count)!==s.count ||
        typeof s.last!=="number" || s.last<0 || s.last>record.grant.body.high || Math.floor(s.last)!==s.last)
        throw new Error("Segmento non valido");
      names.push(s.name);total+=s.count;
      if(exists(files,s.name)) { if(fingerprint(s.name,record.grant.body.high)!==s.hash)throw new Error("Contenuto cambiato"); }
      else if(!recovering)throw new Error("Segmento mancante");
    });
    if(total!==record.grant.body.stored)throw new Error("Conteggio diverso");
    // The signed snapshot is sealed before verification. Later records must be
    // in different segments and strictly above its high-water mark; never erase
    // them or turn them into custody ACKs.
    journal.segments.forEach(function(s){if(!names.includes(s.name))fingerprint(s.name,journal.next-1,record.grant.body.high);});
  }
  function checkpoint(pending) {
    var body=operation.grant.body,old=journal.checkpoint;
    if(old.epoch!==body.epoch || journal.next-1<body.high ||
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
    var tail=journal.segments[journal.segments.length-1];
    // The signed plan also covers archives with no spare segment.
    var sealedTail=tail && !tail.sealed ? tail : null;
    if(sealedTail)sealedTail.sealed=true;
    challenge={body:body,plan:rows,monotonic:monotonic,sealedTail:sealedTail};
    return JSON.parse(JSON.stringify(body));
  }
  function beginVerified(grant,proof) {
    requireReady();
    var message=signature(grant,proof),body=grant.body;
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
    var snapshotPending=body.high-Math.max(journal.checkpoint.ack,journal.checkpoint.discardedThrough||0);
    if(journal.checkpoint.epoch!==body.epoch || journal.next-1<body.high || snapshotPending!==body.pending)
      throw new Error("Nuovi dati: ripeti la verifica");
    assertPlan(record,false);
    journal.eraseLock=true;journal.eraseReserved=record.plan.map(function(s){return s.name;});
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
    if(journal.checkpoint.epoch!==body.epoch || journal.next-1<body.high ||
      ((journal.checkpoint.adminCounter||0)!==body.counter && (journal.checkpoint.adminCounter||0)!==body.counter-1))throw new Error("Archivio cambiato durante la cancellazione");
    if((journal.checkpoint.adminCounter||0)<body.counter)checkpoint(true);
    journal.segments.forEach(function(s){if(!operation.plan.some(function(p){return p.name===s.name;}))fingerprint(s.name,journal.next-1,body.high);});
    var files=storageFiles(),target;
    for(var i=0;i<operation.plan.length;i++) {
      if(exists(files,operation.plan[i].name)) {target=operation.plan[i];break;}
    }
    if(target) {
      if(fingerprint(target.name,body.high)!==target.hash)throw new Error("Segmento cambiato prima della cancellazione");
      storage.open(target.name,"r").erase();
      if(exists(storageFiles(),target.name))throw new Error("Cancellazione non confermata");
      journal.segments=journal.segments.filter(function(s){return s.name!==target.name;});journal.reader=null;
      if(storage.erase)storage.erase(target.name+"idx");
      return {state:"in_progress",operationId:body.operationId};
    }
    journal.reader=null;
    checkpoint(false);
    var receipt={state:"completed",operationId:body.operationId,epoch:body.epoch,
      discardedThrough:body.high,removed:body.stored,removedPending:body.pending,counter:body.counter,
      custodyAck:journal.checkpoint.ack,hardwareAttested:false};
    persist({phase:"done",grant:operation.grant,plan:operation.plan,receipt:receipt});
    operation=null;journal.eraseLock=false;journal.eraseReserved=undefined;journal.full=journal.stats().available===0;
    return copy(receipt);
  }
  function resumeVerified(proof) {
    requireReady();
    if(!operation || operation.phase!=="intent")throw new Error("Nessun ripristino pendente");
    signature(operation.grant,proof);assertPlan(operation,true);verifiedKey=env.trust.publicKey;
    return step();
  }
  function asynchronous(grant,resuming,progress,complete) {
    requireReady();
    if(typeof env.verifyAsync!=="function")throw new Error("Verifica cooperativa non disponibile");
    // This copy and proof never come back from BLE and cannot be injected by a
    // caller. All live binding/time/archive checks run again after verification.
    var frozen=copy(grant),message=auth.canonical(frozen.body),key=env.trust.publicKey,active=true;
    checkBinding(frozen.body);
    var cancel=env.verifyAsync(message,frozen.signature,key,progress,function(valid){
      if(!active)return;active=false;
      if(!valid){complete(null,new Error("Firma non valida"));return;}
      var result;
      try {
        var proof={message:message,signature:frozen.signature,key:key};
        result=resuming?resumeVerified(proof):beginVerified(frozen,proof);
      }catch(e){complete(null,e);return;}
      complete(result,null);
    });
    return function(){active=false;if(typeof cancel==="function")cancel();};
  }
  return {ready:ready,challenge:createChallenge,challengePlan:function(){
      requireReady();if(!challenge)throw new Error("Richiesta mancante");return copy(challenge.plan);
    },cancelChallenge:function(){
      if(operation)return false;
      if(challenge && journal.next-1===challenge.body.high) {
        var tail=journal.segments[journal.segments.length-1];
        if(tail && tail===challenge.sealedTail) {
          tail.sealed=false;
          journal.full=false;
        }
      }
      challenge=null;return true;
    },begin:function(grant){return beginVerified(grant,null);},step:step,resume:function(){return resumeVerified(null);},
    cooperative:typeof env.verifyAsync==="function",
    beginAsync:function(grant,progress,complete){return asynchronous(grant,false,progress,complete);},
    resumeAsync:function(progress,complete){if(!operation)throw new Error("Nessun ripristino pendente");return asynchronous(operation.grant,true,progress,complete);},
    status:function(){return {executionEnabled:ready(),pending:!!operation,
      total:operation?operation.grant.body.stored:null,pendingSamples:operation?operation.grant.body.pending:null,
      remaining:operation?operation.plan.reduce(function(total,p){return total+(journal.segments.some(function(s){return s.name===p.name;})?p.count:0);},0):null,
      last:saved && saved.phase==="done" ? copy(saved.receipt) : null};}};
};
