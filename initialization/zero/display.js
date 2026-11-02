/* Native 176px initialization UI: measured text, separate rows, real progress. */
exports.create=function(){
  var p={phase:'preparing',done:0,total:0,message:''},allowed=false,prompt=false,tick=0,changed=0,lastKey='',dirty=true;
  var steps={preparing:1,prepared:1,staging:2,upload:2,quarantining:3,wiping:4,installing:5,verified:5,activating:6,'activation-pending':6,complete:7};
  var labels={preparing:'Preparazione',prepared:'Preparazione',staging:'Trasferimento',upload:'Trasferimento',quarantining:'Avvio protetto',wiping:'Formatta contenuti',installing:'Installa Vera',verified:'Verifica file',activating:'Prepara riavvio','activation-pending':'Riavvio Vera',complete:'Vera pronta',paused:'Collegamento perso',error:'Operazione sospesa'};
  function visible(){return prompt&&!!global.VeraZero&&p.phase!=='error'&&p.phase!=='paused'&&!allowed;}
  function text(s,y,size,color,width,center){
    width=width||156;
    s=String(s);g.setFont('Vector',size);
    while(g.stringWidth(s)>width&&size>10){size--;g.setFont('Vector',size);}
    while(g.stringWidth(s)>width&&s.length)s=s.slice(0,-1);
    g.setColor(color||'#ffffff').setFontAlign(0,center?0:-1).drawString(s,88,y);
  }
  function ring(ratio,color){
    // Saturated colours only: the Bangle palette dithers intermediate greys.
    var cx=88,cy=96,outer=28,inner=24;
    g.setColor('#0000ff').fillCircle(cx,cy,outer).setColor('#000000').fillCircle(cx,cy,inner);
    var count=ratio===null?5:Math.round(ratio*48),start=ratio===null?(tick*4)%48:0;
    g.setColor(color);
    for(var i=0;i<count;i++){
      var a=(start+i)*Math.PI/24-Math.PI/2,b=a+Math.PI/24+0.025;
      g.fillPoly([cx+Math.cos(a)*outer,cy+Math.sin(a)*outer,cx+Math.cos(b)*outer,cy+Math.sin(b)*outer,cx+Math.cos(b)*inner,cy+Math.sin(b)*inner,cx+Math.cos(a)*inner,cy+Math.sin(a)*inner]);
    }
  }
  function footer(){
    if(visible())return;
    g.setColor('#000000').fillRect(0,150,175,175);
    var stopped=p.phase==='error'||p.phase==='paused',age=tick-changed;
    var s=stopped?'Riprendi dalla app':p.phase==='complete'?'Puoi usare il Bangle':age>=15?'Attendo la app: '+age+' s':'Non riavviare';
    text(s,155,11,stopped?'#ffff00':'#ffffff');
  }
  function draw(){
    var stopped=p.phase==='error'||p.phase==='paused',ratio=p.total>0?Math.max(0,Math.min(1,p.done/p.total)):null;
    var key=JSON.stringify([p,allowed,prompt]);
    Bangle.setLCDPower(true);Bangle.setBacklight(true);Bangle.setLCDBrightness(1);Bangle.setLocked(false);
    if(key===lastKey&&!dirty&&(ratio!==null||stopped)){footer();if(g.flip)g.flip();return;}
    lastKey=key;dirty=false;
    g.reset().setBgColor('#000000').clear();
    text('VERA',6,21,'#00ffff');
    if(visible()){
      text('Conferma richiesta',40,16);
      text('Consenti il collegamento',68,12);
      text('con Vera sul telefono',86,12);
      g.setColor('#00ff00').fillRect(8,112,167,171);
      text('CONSENTI',128,19,'#000000');
      if(g.flip)g.flip();return;
    }
    text(labels[p.phase]||'Inizializzazione',35,15);
    text(steps[p.phase]?'PASSO '+steps[p.phase]+' DI 7':stopped?'CONTROLLA IL TELEFONO':'IN CORSO',54,10,stopped?'#ffff00':'#00ffff');
    var color=stopped?'#ffff00':p.phase==='complete'?'#00ff00':'#00ffff';
    ring(stopped?0:p.phase==='complete'?1:ratio,color);
    text(stopped?'!':p.phase==='complete'?'OK':ratio===null?'...':Math.floor(ratio*100)+'%',96,22,color,40,true);
    var counter=stopped?(p.phase==='error'&&p.message&&p.message.length<26?p.message:'Procedura conservata'):p.total>0?(p.phase==='upload'?(p.done>=p.total?Math.ceil(p.total/1024):Math.floor(p.done/1024))+' / '+Math.ceil(p.total/1024)+' kB':p.done+' / '+p.total):p.phase==='complete'?'Installazione conclusa':p.phase==='activation-pending'||p.phase==='activating'?'Attendi il riavvio':'Preparo Vera Node';
    // Counter sits below the entire ring, never inside its lower edge.
    text(counter,133,11);
    footer();if(g.flip)g.flip();
  }
  var timer=setInterval(function(){tick++;draw();},1000);draw();
  return {enableConsent:function(){prompt=true;dirty=true;draw();},canConsent:function(xy){return visible()&&(!xy||(xy.x>=8&&xy.x<=167&&xy.y>=112&&xy.y<=171));},status:function(){return {phase:p.phase,step:steps[p.phase]||null,lastUpdateSeconds:tick-changed,consentRequested:prompt,consentVisible:visible(),consentAccepted:allowed};},setConsent:function(on){allowed=on===true;dirty=true;draw();},set:function(phase,done,total,message){var transition=p.phase!==phase;p={phase:phase,done:done||0,total:total||0,message:message||''};changed=tick;dirty=true;if(transition)draw();},draw:draw,dispose:function(){clearInterval(timer);}};
};
