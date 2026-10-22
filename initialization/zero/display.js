/* 176px maintenance feedback. Real counters, bounded text, visible connection loss. */
exports.create=function(){
  var p={phase:'preparing',done:0,total:0,message:''},allowed=false,prompt=false,tick=0;
  var labels={preparing:'Preparazione',prepared:'Preparazione',staging:'Caricamento',upload:'Caricamento',quarantining:'Avvio protetto',wiping:'Formatta contenuti',installing:'Installa Vera',verified:'Verifica conclusa',activating:'Prepara riavvio','activation-pending':'Riavvio Vera',complete:'VERA pronta',paused:'Collegamento perso',error:'Procedura interrotta'};
  function visible(){return prompt&&!!global.VeraZero&&p.phase!=='error'&&p.phase!=='paused'&&!allowed;}
  function draw(){var x=g.getWidth()/2,y=92,ratio=p.total>0?Math.min(1,p.done/p.total):null;
    Bangle.setLCDPower(true);Bangle.setBacklight(true);Bangle.setLCDBrightness(1);Bangle.setLocked(false);
    g.reset().setBgColor('#000000').clear().setFontAlign(0,-1).setColor('#00ffff').setFont('Vector',24).drawString('VERA',x,4);
    if(visible()){
      g.setColor('#ffffff').setFont('Vector',17).drawString('Conferma richiesta',x,39);
      g.setFont('Vector',13).drawString('Tocca il pulsante',x,70).drawString('per consentire alla app',x,88);
      g.setColor('#00ff00').fillRect(8,112,g.getWidth()-9,171).setColor('#000000').setFont('Vector',20).drawString('CONSENTI',x,124);
      g.setFont('Vector',13).drawString('alla app',x,149);
      if(g.flip)g.flip();return;
    }
    g.setColor('#ffffff').setFont('Vector',15).drawString(labels[p.phase]||'Inizializzazione',x,34);
    g.setColor('#303030').fillCircle(x,y,34).setColor('#000000').fillCircle(x,y,28);
    for(var i=0;i<24;i++){var on=ratio===null?i===(tick%24):i<Math.ceil(ratio*24);if(on){var a=i*Math.PI/12-Math.PI/2;g.setColor(p.phase==='error'?'#ff0000':'#00ffff').fillCircle(x+Math.cos(a)*31,y+Math.sin(a)*31,3);}}
    g.setColor('#ffffff').setFont('Vector',13).drawString(p.total>0?(p.phase==='upload'?Math.floor(p.done/1024)+'/'+Math.ceil(p.total/1024)+'kB':p.done+'/'+p.total):'Attendi',x,y-6);
    var text=p.message||(p.phase==='paused'?'Riprendi dalla app':p.phase==='error'?'Controlla la app':'Attendi, non riavviare');
    g.setFont('Vector',12).drawString(String(text).slice(0,25),x,132);
    if(g.flip)g.flip();
  }
  var timer=setInterval(function(){tick++;draw();},1000);draw();
  return {enableConsent:function(){prompt=true;draw();},canConsent:function(xy){return visible()&&(!xy||(xy.x>=8&&xy.x<=g.getWidth()-9&&xy.y>=112&&xy.y<=171));},status:function(){return {phase:p.phase,consentRequested:prompt,consentVisible:visible(),consentAccepted:allowed};},setConsent:function(on){allowed=on===true;draw();},set:function(phase,done,total,message){p={phase:phase,done:done||0,total:total||0,message:message||''};draw();},draw:draw,dispose:function(){clearInterval(timer);}};
};
