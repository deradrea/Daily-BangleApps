/* Persist after installation so interrupted initialization returns to recovery. */
(function(){
  var s=require('Storage'),st;
  try{st=require('verai.platform.js').create().load(false);}catch(e){st={phase:'recovery-required'};}
  if(!st||st.phase==='complete'||st.phase==='cancelled'||st.phase==='activation-pending')return;
  eval(s.read('verai.recovery.js'));
  global.VeraNode={state:{running:false,maintenancePaused:true},start:function(){}};
})();
