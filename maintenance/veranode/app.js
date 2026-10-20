(function(){
  if(!global.VeraIsolatedMaintenance)throw Error('Ambiente non isolato');
  var platform=require('veram.platform.js').create(),status=platform.load();
  NRF.on('disconnect',function(){platform.setConsent(false);});
  global.VeraMaintenance=require('veram.provider.js').create(platform);
  Bangle.setHRMPower(0,'veranode');
  Bangle.setOptions({wakeOnBTN1:true,lockTimeout:0,lcdPowerTimeout:0,backlightTimeout:0,btnLoadTimeout:0});
  Bangle.setLCDTimeout(0);Bangle.setLCDPower(true);Bangle.setBacklight(true);Bangle.setLCDBrightness(1);Bangle.setLocked(false);
  function draw() {
    var w=g.getWidth();g.reset().setBgColor('#000000').clear().setColor('#00ffff').setFont('Vector',24).setFontAlign(0,-1);
    g.drawString('VERA',w/2,6).setColor('#ffffff').setFont('Vector',17).drawString('Manutenzione',w/2,35);
    g.setFont('Vector',13).drawString('Dati conservati',w/2,58);
    g.setColor('#00ff00').fillRect(8,80,w-9,121).setColor('#000000').setFont('Vector',16).drawString('Consenti app',w/2,92);
    g.setColor('#00ffff').drawRect(8,126,w-9,168).setFont('Vector',14).drawString('Riprendi attivita',w/2,140);if(g.flip)g.flip();
  }
  Bangle.setUI({mode:'custom',btn:function(){Bangle.setLCDPower(true);Bangle.setBacklight(true);draw();},
    touch:function(button,xy){if(xy && xy.y>=80 && xy.y<=121){platform.setConsent(true);g.setColor('#000000').fillRect(8,80,167,121).setColor('#00ff00').drawString('App consentita',88,94);if(g.flip)g.flip();}else if(xy&&xy.y>=126&&xy.y<=168){try{global.VeraMaintenance.cancelLocally();}catch(e){E.showMessage('Continua il recupero\ndall app','VERA');}}}});
  draw();
})();
