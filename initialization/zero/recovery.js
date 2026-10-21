/* Every temporary boot entry runs this same idempotent barrier. */
(function(){
  if(global.VeraZeroRecovery)return;
  global.VeraZeroRecovery=true;
  var s=require('Storage'),r=global.VeraZeroRawRead||global.VeraInitializeRead||global.VeraMaintenanceStorageRead||s.read.bind(s);global.VeraZeroRawRead=r;
  s.read=function(n,o,l){if(o===undefined&&l===undefined&&/\.app\.js$/.test(n)&&n!=='vz.app.js')return r('vz.app.js');return r(n,o,l);};
  NRF.setServices({}, {uart:true});Bluetooth.setConsole(true);
  Bangle.setLCDPower(true);Bangle.setBacklight(true);Bangle.setLCDBrightness(1);
  try{eval(r('vz.app.js'));}catch(err){E.showMessage('Riprendi dalla app','VERA');global.VeraZeroError=String(err);}
})();
