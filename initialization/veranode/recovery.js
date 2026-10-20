/* Temporary boot executed before the standard .bootcde. Retains UART recovery. */
(function(){
  global.VeraDedicatedRecovery=true;
  var s=require('Storage'),r=s.read.bind(s);global.VeraInitializeRead=r;
  s.read=function(n,o,l){if(o===undefined&&l===undefined&&/\.app\.js$/.test(n)&&n!=='verai.app.js')return r('verai.app.js');return r(n,o,l);};
  NRF.setServices({}, {uart:true});
  Bluetooth.setConsole(true);
  Bangle.setOptions({wakeOnBTN1:true,wakeOnFaceUp:false,wakeOnTouch:false,lockTimeout:0,lcdPowerTimeout:0,backlightTimeout:0,btnLoadTimeout:0});
  Bangle.setLCDTimeout(0);Bangle.setLCDPower(true);Bangle.setBacklight(true);Bangle.setLCDBrightness(1);Bangle.setLocked(false);
  // Recovery must remain visible even if .bootcde was interrupted during copy.
  setTimeout(function(){if(!global.VeraInitialize){try{eval(r('verai.app.js'));}catch(e){E.showMessage('Riprendi da app','VERA');}}},0);
})();
