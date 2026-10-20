/* Canonical dedicated initialization state machine. No firmware or eraseAll. */
exports.create = function(e) {
  var state=e.load(), upload, consent=false;
  function fail(s){throw Error(s);}
  function integer(n){return typeof n==='number'&&isFinite(n)&&Math.floor(n)===n;}
  function same(a,b){return e.canonical(a)===e.canonical(b);}
  function valid(b){return b && typeof b.mac==='string'&&b.mac.length===17&&/^[A-F0-9:]+$/.test(b.mac)&&b.mac.split(':').length===6&&b.mac.split(':').every(function(p){return p.length===2;}) &&
    typeof b.packageSha256==='string'&&b.packageSha256.length===64&&/^[a-f0-9]+$/.test(b.packageSha256) && typeof b.operationId==='string' &&
    b.operationId.length>=16&&b.operationId.length<=80&&/^[a-zA-Z0-9-]+$/.test(b.operationId) && integer(b.assignment) && b.assignment>0;}
  function connected(){if(!e.encrypted())fail('Collegamento cifrato necessario: conferma associazione sul telefono');}
  function guard(){connected();if(!state || e.mac()!==state.binding.mac || !e.isolated())fail('Preparazione isolata necessaria');}
  function save(){e.save(state);}
  function paint(){e.progress(state.phase,state.done||0,state.total||0);}
  function matches(name,f){var raw=e.read(name);return typeof raw==='string'&&raw.length===f.size&&e.hash(raw)===f.sha256;}
  function stageName(i){return 'verai.f'+i;}
  function target(i){if(!integer(i)||i<0||i>=e.target.files.length)fail('File non previsto');return e.target.files[i];}
  function inventory(){return e.inventory().sort(function(a,b){var x=a.kind+':'+a.name,y=b.kind+':'+b.name;return x<y?-1:x>y?1:0;});}
  function status(){return {protocol:1,phase:state?state.phase:'unprepared',binding:state&&state.binding,
    done:state&&state.done||0,total:state&&state.total||0,planHash:state&&state.planHash,
    staged:state?state.staged.length:0,targetFiles:e.target.files.length,consent:consent,
    softwareReady:!!state&&state.phase==='complete'};}
  function prepare(binding){
    connected();if(!valid(binding)||e.mac()!==binding.mac)fail('Contesto o MAC diverso');
    if(state&& !['complete','cancelled'].includes(state.phase)){if(!same(state.binding,binding))fail('Operazione precedente presente');return status();}
    var info=e.inspect();if(!info.compatible)fail('Bootloader o firmware non compatibile');
    if(info.batteryPercent<20&&!info.charging)fail('Collega il caricatore');
    if(info.freeBytes<e.target.stagingBytes*2+65536)fail('Spazio insufficiente per preparazione e recupero');
    state={generation:0,binding:binding,phase:'prepared',staged:[],done:0,total:0};save();
    e.isolate();paint();return status();
  }
  function plan(){
    guard();if(!['prepared','staging'].includes(state.phase)){
      if(state.plan)return {planHash:state.planHash,removeApps:state.plan.removeApps,removeData:state.plan.removeData,replace:state.plan.replace,files:state.plan.files};
      fail('Piano non disponibile');
    }
    var rows=inventory(),names=e.target.files.map(function(f){return f.name;}),apps=[],data=[],replace=[];
    rows.forEach(function(f){if(names.includes(f.name)&&f.kind==='normal')replace.push(f);
      else if(f.kind==='normal'&&(/\.(js|info|img)$/.test(f.name)))apps.push(f);else data.push(f);});
    var p={binding:state.binding,targetFingerprint:e.target.fingerprint,files:rows,removeApps:apps,removeData:data,replace:replace};
    var digest=e.hash(e.canonical(p));
    if(state.planHash && state.planHash!==digest)fail('Inventario cambiato: ripeti la preparazione assistita');
    state.plan=p;state.planHash=digest;state.phase='staging';save();paint();
    return {planHash:digest,removeApps:apps,removeData:data,replace:replace,files:rows};
  }
  function stage(index,offset,total,base64){
    guard();if(state.phase!=='staging'||!state.plan)fail('Piano necessario');
    var f=target(index),raw=e.unbase64(base64);
    if(total!==f.size||!integer(offset)||offset<0||!raw.length||raw.length>384||offset+raw.length>total)fail('Blocco non valido');
    if(state.staged.includes(index)){if(!matches(stageName(index),f))fail('Staging corrotto');return status();}
    if(offset===0){upload={index:index,next:0};e.write(stageName(index),'',0,total);}
    if(!upload||upload.index!==index||upload.next!==offset)fail('Ordine blocchi diverso');
    e.write(stageName(index),raw,offset);upload.next+=raw.length;
    if(upload.next===total){if(!matches(stageName(index),f))fail('SHA256 staging diverso');state.staged.push(index);save();upload=undefined;}
    var received=state.staged.reduce(function(n,i){return n+target(i).size;},0)+(upload?upload.next:0);
    e.progress('staging',received,e.target.stagingBytes);return status();
  }
  function authorize(){guard();if(!consent)fail('Consenso sul Bangle necessario');}
  function apply(hash){
    authorize();if(hash!==state.planHash||!state.plan)fail('Piano diverso');
    if(state.phase==='staging'){
      if(state.staged.length!==e.target.files.length||e.target.files.some(function(f,i){return !matches(stageName(i),f);}))fail('Staging incompleto');
      if(!same(inventory(),state.plan.files))fail('Inventario cambiato prima della cancellazione');
      state.phase='applying';state.done=0;state.total=state.plan.removeApps.length+state.plan.removeData.length+e.target.files.length-1;save();
    }
    if(state.phase==='verified')return status();
    if(state.phase!=='applying')fail('Fase non valida');
    var deletions=state.plan.removeApps.concat(state.plan.removeData),operations=deletions.concat(e.target.files.filter(function(f){return f.name!=='.boot0';}));
    if(state.done>=operations.length){verify();return status();}
    var item=operations[state.done],remove=state.done<deletions.length;
    if(!state.pending){state.pending={index:state.done,name:item.name,remove:remove};save();}
    if(state.pending.index!==state.done||state.pending.name!==item.name||state.pending.remove!==remove)fail('Registro operazione incoerente');
    if(remove){
      var current=e.describe(item.name,item.kind);
      if(current && !same(current,item))fail('File da cancellare cambiato');
      if(current)e.erase(item.name,item.kind);
      if(e.describe(item.name,item.kind))fail('Cancellazione non verificata');
    }else{
      var index=e.target.files.findIndex(function(f){return f.name===item.name;});
      if(!matches(stageName(index),item))fail('Copia di recupero assente');
      if(!matches(item.name,item)){e.write(item.name,e.read(stageName(index)));if(!matches(item.name,item))fail('Scrittura non verificata');}
    }
    state.done++;state.pending=null;save();paint();return status();
  }
  function verify(){
    guard();if(!['applying','verified','activation-pending','complete'].includes(state.phase)||state.pending||state.done!==state.total)fail('Preparazione incompleta');
    e.target.files.forEach(function(f){if(f.name!=='.boot0'&&!matches(f.name,f))fail('Target diverso: '+f.name);});
    var allowed=e.target.files.map(function(f){return f.name;});
    if(inventory().some(function(f){return f.kind!=='normal'||!allowed.includes(f.name);}))fail('File inatteso dopo inizializzazione');
    if(e.settings().clock!=='veranode.app.js')fail('Home Vera non impostata');
    if(state.phase==='applying'){state.phase='verified';save();paint();}
    return {verified:true,home:'veranode.app.js',files:e.target.files.length,planHash:state.planHash};
  }
  function activate(){
    authorize();verify();if(state.phase!=='verified'&&state.phase!=='activation-pending')fail('Attivazione non prevista');
    state.phase='activation-pending';save();paint();
    var i=e.target.files.findIndex(function(f){return f.name==='.boot0';}),f=target(i);
    if(!matches(stageName(i),f))fail('Boot di recupero mancante');e.write(f.name,e.read(stageName(i)));
    if(!matches(f.name,f))fail('Boot non verificato');e.activate();return {activationScheduled:true,softwareReady:false};
  }
  function recover(binding){
    connected();if(!state||!valid(binding)||!same(binding,state.binding)||e.mac()!==binding.mac)fail('Ripresa di un altro contesto');
    consent=false;upload=undefined;
    if(state.phase==='prepared'||state.phase==='activation-pending'&&!(e.health()||{}).running)e.isolate();
    paint();return status();
  }
  function confirm(){
    connected();if(!state||e.mac()!==state.binding.mac||!['activation-pending','complete'].includes(state.phase))fail('Attivazione da completare');
    var h=e.health();if(e.settings().clock!=='veranode.app.js'||!h||h.running!==true||h.scheduled!==true||h.hrmRequested!==true)fail('Raccolta non avviata');
    e.target.files.forEach(function(f){if(f.name!=='.boot0'&&!matches(f.name,f))fail('Software diverso');});
    state.phase='complete';save();if(e.cleanup)e.cleanup();paint();return {softwareReady:true,clockVerified:false,profileVerified:false,planHash:state.planHash,binding:state.binding};
  }
  function cancel(){
    guard();if(!['prepared','staging','cancelled'].includes(state.phase)||state.done||state.pending)fail('Rimozioni iniziate: completa il recupero della stessa operazione');
    state.phase='cancelled';save();e.restoreBoot();e.activate();return {cancelled:true,userDataErased:false};
  }
  return {inspect:e.inspect,requestSecurity:e.requestSecurity,securityStatus:e.securityStatus,prepare:prepare,status:status,plan:plan,stage:stage,apply:apply,verify:verify,activate:activate,recover:recover,confirm:confirm,cancel:cancel,
    setConsent:function(on){consent=on===true;},inventoryPage:function(offset,limit){guard();if(!state.plan||!integer(offset)||!integer(limit)||offset<0||limit<1||limit>24||offset>state.plan.files.length)fail('Pagina non valida');return {offset:offset,total:state.plan.files.length,next:Math.min(offset+limit,state.plan.files.length),planHash:state.planHash,files:state.plan.files.slice(offset,offset+limit)};}};
};
