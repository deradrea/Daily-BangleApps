(function(){
  try {
  if(!global.VeraDedicatedRecovery)throw Error('Preparazione non isolata');
  var platform=require('verai.platform.js').create();
  global.VeraInitialize=require('verai.provider.js').create(platform);
  var labels={prepared:'Preparazione',staging:'Caricamento',applying:'Installazione',verified:'Verifica conclusa','activation-pending':'Avvio Vera',complete:'Software pronto'};
  function draw(){
    var st=global.VeraInitialize.status(),p=global.VeraInitializeProgress||st,w=g.getWidth(),x=w/2,y=100;
    Bangle.setLCDPower(true);Bangle.setBacklight(true);Bangle.setLCDBrightness(1);
    g.reset().setBgColor('#000000').clear().setFontAlign(0,-1).setColor('#00ffff').setFont('Vector',26).drawString('VERA',x,5);
    g.setColor('#ffffff').setFont('Vector',15).drawString(labels[p.phase]||'Riprendi da app',x,36);
    g.setColor('#0000ff').fillCircle(x,y,37).setColor('#000000').fillCircle(x,y,31);
    if(p.total>0){var ratio=Math.min(1,p.done/p.total),points=[],i,a,steps=Math.max(1,Math.ceil(ratio*24));
      for(i=0;i<=steps;i++){a=-Math.PI/2+Math.PI*2*ratio*i/steps;points.push(x+Math.cos(a)*37,y+Math.sin(a)*37);}
      for(i=steps;i>=0;i--){a=-Math.PI/2+Math.PI*2*ratio*i/steps;points.push(x+Math.cos(a)*31,y+Math.sin(a)*31);}g.setColor('#00ffff').fillPoly(points);}
    g.setColor('#ffffff').setFont('Vector',15).drawString(p.total>0?(p.phase==='staging'?Math.floor(p.done/1024)+' / '+Math.ceil(p.total/1024)+' kB':p.done+' / '+p.total):'Attendi app',x,88);
    if(!st.consent){g.setColor('#00ff00').fillRect(8,143,w-9,175).setColor('#000000').setFont('Vector',15).drawString('Consenti app',x,150);}
    else g.setColor('#00ff00').setFont('Vector',13).drawString('App consentita',x,151);
    if(g.flip)g.flip();
  }
  global.VeraInitializeDraw=draw;
  NRF.on('disconnect',function(){global.VeraInitialize.setConsent(false);draw();});
  Bangle.setUI({mode:'custom',btn:draw,touch:function(_b,xy){if(xy&&xy.y>=143){global.VeraInitialize.setConsent(true);draw();}}});
  draw();
  }catch(e){
    Bangle.setLCDPower(true);Bangle.setBacklight(true);Bangle.setLCDBrightness(1);
    E.showMessage('Riprendi da app\nPreparazione interrotta','VERA');
    global.VeraInitializeError=String(e);
  }
})();
