/* First boot hook: block the ordinary collector whenever an upgrade is pending. */
(function(){
  var s=require('Storage'),p;
  try {p=require('veram.platform.js').create();var state=p.load();}
  catch(e){if(s.read('veram.state0')===undefined && s.read('veram.state1')===undefined)return;state={phase:'recovery-required'};}
  if(state.phase==='complete'||state.phase==='rolled-back')return;
  // A complete target is verified before this state is written. App must verify running collector.
  if(state.phase==='activation-pending'){
    global.VeraMaintenanceActivation={protocol:1,confirm:function(){
      var n=global.VeraNode,health=n&&n.health&&n.health(),identity=p.profileIdentity();
      if(!health||health.running!==true||health.scheduled!==true||health.hrmRequested!==true||
        identity.user!==state.binding.user||identity.scope!==state.binding.scope||identity.mac!==state.binding.mac||
        NRF.getAddress().split(' ')[0].toUpperCase()!==state.binding.mac)throw Error('Avvio raccolta da verificare');
      state.plan.files.forEach(function(f){var r=s.read(f.name);if(!r||r.length!==f.size||p.hash(r)!==f.hash)throw Error('Software diverso');});
      var profile=(state.protected||[]).find(function(f){return f.kind==='normal'&&f.name==='veranode.policy.json';});
      if(!profile||p.hash(s.read(profile.name))!==profile.hash)throw Error('Profilo diverso');
      state.phase='complete';p.save(state);
      return {confirmed:true,targetHash:state.binding.targetHash,snapshot:state.snapshot,running:true};
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
