/* First boot hook: block the ordinary collector whenever an upgrade is pending. */
(function(){
  var s=require('Storage'),p;
  try {p=require('veram.platform.js').create();var state=p.load();}
  catch(e){if(s.read('veram.state0')===undefined && s.read('veram.state1')===undefined)return;state={phase:'recovery-required'};}
  if(state.phase==='complete'||state.phase==='rolled-back')return;
  // A complete target is verified before this state is written. App must verify running collector.
  if(state.phase==='activation-pending'||state.phase==='rollback-pending'){
    global.VeraMaintenanceActivation={protocol:1,confirm:function(){
      if(!p.encrypted())throw Error('Associazione cifrata necessaria');
      var n=global.VeraNode,health=n&&n.health&&n.health(),identity=p.profileIdentity(),rollback=state.phase==='rollback-pending'||state.phase==='rolled-back';
      var shouldRun=state.expectedCollectionRunning===undefined?state.collectionWasRunning!==false:state.expectedCollectionRunning===true;
      if(!health||(shouldRun && (health.running!==true||health.scheduled!==true||health.hrmRequested!==true))||
        (state.profileCaptured!==true && (identity.user!==state.binding.user||identity.scope!==state.binding.scope||identity.mac!==state.binding.mac))||
        NRF.getAddress().split(' ')[0].toUpperCase()!==state.binding.mac)throw Error('Avvio raccolta da verificare');
      state.plan.files.forEach(function(f){var r=s.read(f.name);if(!r||r.length!==(rollback?f.sourceSize:f.size)||p.hash(r)!==(rollback?f.sourceHash:f.hash))throw Error('Software diverso');});
      var profile=(state.protected||[]).find(function(f){return f.kind==='normal'&&f.name==='veranode.policy.json';});
      var raw=s.read('veranode.policy.json'),actual=raw===undefined?null:p.hash(raw);
      if(state.profileCaptured===true ? actual!==state.profileSha256 : (!profile||actual!==profile.hash))throw Error('Profilo diverso');
      var result=rollback?'rolled-back':'complete';if(state.phase!==result){state.phase=result;p.save(state);}
      return {confirmed:true,targetHash:state.binding.targetHash,snapshot:state.snapshot,operationBinding:state.operationBinding,
        running:health.running===true,profileSha256:actual,result:state.phase};
    }};
    return;
  }
  global.VeraIsolatedMaintenance=true;
  var policy=s.readJSON('veranode.policy.json',1)||{};
  global.VeraNode={state:{policy:policy,running:false,maintenancePaused:true},start:function(){}};
  var original=s.read.bind(s);global.VeraMaintenanceStorageRead=original;
  s.read=function(name,offset,length){
    if(name==='veranode.app.js' && offset===undefined && length===undefined)return 'try{eval(require("Storage").read("veram.app.js"));}catch(e){E.showMessage("Ripristino da app","VERA");}';
    return original(name,offset,length);
  };
})();
