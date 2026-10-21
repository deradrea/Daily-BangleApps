/* Included by the official base boot generator; never starts the old collector. */
(function(){
  var s=require('Storage'),st;
  try{st=require('vz.platform.js').create().load();}catch(err){st={phase:'checkpoint-error'};}
  if(!st)return;
  if(st.phase==='activation-pending'||st.phase==='complete'){global.VeraZeroBootGeneration=st.binding.generation;global.VeraZeroBootExecutionId=st.binding.executionId;return;}
  eval(s.read('vz.recovery.js'));
  global.VeraNode={state:{running:false,maintenancePaused:true},start:function(){}};
})();
