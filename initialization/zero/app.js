(function(){
  global.VeraZeroUiReady=false;delete global.VeraZeroError;
  try{
    if(global.VeraZeroDisplay&&global.VeraZeroDisplay.dispose)global.VeraZeroDisplay.dispose();
    global.VeraZeroDisplay=require('vz.display.js').create();
    if(!global.VeraZero)global.VeraZero=require('vz.provider.js').create(require('vz.platform.js').create());
    if(!global.VeraZeroDisconnectAttached){global.VeraZeroDisconnectAttached=true;NRF.on('disconnect',function(){global.VeraZero.setConsent(false);global.VeraZeroDisplay.set('paused',0,0,'Riprendi dalla app');});}
    Bangle.setOptions({wakeOnBTN1:true,wakeOnFaceUp:false,wakeOnTouch:false,lockTimeout:0,lcdPowerTimeout:0,backlightTimeout:0,btnLoadTimeout:0});
    Bangle.setLCDTimeout(0);
    var appConfirmed=require('vz.target.js').authorizationMode==='app-confirmed';
    Bangle.setUI({mode:'custom',btn:function(){global.VeraZeroDisplay.draw();},touch:function(_b,xy){if(!appConfirmed&&xy&&global.VeraZeroDisplay.canConsent(xy)){global.VeraZero.setConsent(true);global.VeraZeroDisplay.draw();}}});
    if(!appConfirmed)global.VeraZeroDisplay.enableConsent();var st=global.VeraZero.status();global.VeraZeroDisplay.setConsent(st.consent);global.VeraZeroDisplay.set(global.VeraZeroRecovery?st.phase:'preparing',st.removed,st.wipeTotal,appConfirmed?'Procedura dalla app':'');global.VeraZeroUiReady=true;
  }catch(err){if(global.VeraZeroDisplay)global.VeraZeroDisplay.set('error',0,0,String(err));else E.showMessage('Riprendi dalla app','VERA');global.VeraZeroError=String(err);}
})();
