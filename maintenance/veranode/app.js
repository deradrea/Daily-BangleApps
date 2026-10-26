(function(){
  if(!global.VeraIsolatedMaintenance)throw Error('Ambiente non isolato');
  var platform=require('veram.platform.js').create(),status=platform.load(),timer;
  var automatic=status.authorizationMode==='app-confirmed',accepted=automatic,disconnected=false,started=getTime();
  global.VeraMaintenance=require('veram.provider.js').create(platform);
  NRF.on('disconnect',function(){platform.setConsent(false);disconnected=true;if(!automatic)accepted=false;draw();});
  NRF.on('connect',function(){disconnected=false;draw();});
  Bangle.setHRMPower(0,'veranode');
  Bangle.setOptions({wakeOnBTN1:true,lockTimeout:0,lcdPowerTimeout:0,backlightTimeout:0,btnLoadTimeout:0});
  Bangle.setLCDTimeout(0);Bangle.setLCDPower(true);Bangle.setBacklight(true);Bangle.setLCDBrightness(1);Bangle.setLocked(false);
  function draw(){
    var w=g.getWidth(),p=global.VeraMaintenanceProgress||{},known=p.total>0;
    var fraction=known?Math.max(0,Math.min(1,p.done/p.total)):(Math.floor(getTime())%24)/24;
    var labels={backup:'Copia di sicurezza',writing:'Aggiornamento',rollback:'Ripristino software',boot:'Avvio Vera'};
    g.reset().setBgColor('#000000').clear().setColor('#00ffff').setFont('Vector',24).setFontAlign(0,-1).drawString('VERA',w/2,4);
    g.setColor('#ffffff').setFont('Vector',16).drawString('Manutenzione',w/2,33);
    if(!accepted){
      g.setFont('Vector',13).drawString('Dati conservati',w/2,58);
      g.setColor('#00ff00').fillRect(8,80,w-9,121).setColor('#000000').setFont('Vector',16).drawString('Consenti app',w/2,92);
      g.setColor('#00ffff').drawRect(8,126,w-9,168).setFont('Vector',14).drawString('Riprendi attivita',w/2,140);
    }else{
      g.setColor('#00ffff').setFont('Vector',14).drawString(p.phase==='boot'?labels.boot:disconnected?'Collegamento perso':labels[p.phase]||'Preparo il recupero',w/2,58);
      g.setColor('#ffffff').setFont('Vector',12).drawString(p.fileIndex?'File '+p.fileIndex+' di '+p.fileTotal:disconnected?'Riprendi dalla app':'Gestione dalla app',w/2,79);
      var x=w/2,y=115;
      for(var i=0;i<24;i++){var a=(i/24)*Math.PI*2-Math.PI/2;g.setColor(i/24<fraction?'#00ffff':'#303030').fillCircle(x+Math.cos(a)*23,y+Math.sin(a)*23,2);}
      g.setColor('#ffffff').setFont('Vector',15).setFontAlign(0,0).drawString(known?Math.floor(fraction*100)+'%':'...',x,y);
      g.setFontAlign(0,-1).setFont('Vector',12).drawString(Math.floor(getTime()-started)+' s trascorsi',x,146).setColor('#00ffff').drawString('Dati conservati',x,161);
    }
    if(g.flip)g.flip();
  }
  Bangle.setUI({mode:'custom',btn:function(){Bangle.setLCDPower(true);Bangle.setBacklight(true);draw();},
    touch:function(button,xy){
      if(automatic||accepted||!xy)return;
      if(xy.y>=80&&xy.y<=121){platform.setConsent(true);accepted=true;draw();}
      else if(xy.y>=126&&xy.y<=168){try{global.VeraMaintenance.cancelLocally();}catch(e){E.showMessage('Continua il recupero\ndalla app','VERA');}}
    },remove:function(){if(timer)clearInterval(timer);}});
  draw();timer=setInterval(draw,1000);
})();
