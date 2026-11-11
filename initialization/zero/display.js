/* 176px: independent regions for phase, progress, and the action. */
exports.create = function() {
  var p = {phase:"preparing",done:0,total:0}, allowed=false, prompt=false;
  var frame=0, changed=0, dirty=true;
  var steps={preparing:1,prepared:1,staging:2,upload:2,quarantining:3,wiping:4,installing:5,verified:5,activating:6,"activation-pending":6,complete:7};
  var labels=["Preparazione","Trasferimento","Avvio protetto","Formattazione","Installazione","Riavvio","Vera pronta"];
  function visible() { return prompt && !!global.VeraZero && !stopped() && !allowed; }
  function stopped() { return p.phase==="error" || p.phase==="paused"; }
  function text(value,y,size,color) {
    g.setFont("Vector",size);
    while (size>10 && g.stringWidth(value)>156) g.setFont("Vector",--size);
    g.setColor(color).setFontAlign(0,-1).drawString(value,88,y);
  }
  function ring(ratio,color) {
    var cx=88, cy=86, outer=40, inner=34;
    g.setColor("#0000ff").fillCircle(cx,cy,outer);
    g.setColor("#000000").fillCircle(cx,cy,inner);
    var count=ratio===null?7:Math.round(ratio*48), start=ratio===null?frame%48:0;
    g.setColor(color);
    for (var i=0;i<count;i++) {
      var a=(start+i)*Math.PI/24-Math.PI/2,b=a+Math.PI/24+0.025;
      g.fillPoly([cx+Math.cos(a)*outer,cy+Math.sin(a)*outer,cx+Math.cos(b)*outer,cy+Math.sin(b)*outer,
        cx+Math.cos(b)*inner,cy+Math.sin(b)*inner,cx+Math.cos(a)*inner,cy+Math.sin(a)*inner]);
    }
  }
  function symbol(step,color) {
    var y=86;
    g.setColor(color);
    switch(step) {
      case 1:
        g.drawRect(78,76,98,96);
        g.fillCircle(88,86,2+frame%4);
        break;
      case 2:
        y+=frame%5-2;
        g.drawPoly([88,y-12,88,y+7,80,y,88,y+7,96,y,88,y+7]);
        g.drawPoly([77,101,99,101]);
        break;
      case 3:
        g.drawPoly([76,77,88,73,100,77,99,89,88,101,77,89,76,77]);
        g.drawPoly([82,86,87,91,94,81]);
        break;
      case 4:
        g.drawPoly([77,77,99,77,96,100,80,100,77,77]);
        g.drawPoly([74,77,102,77,94,77,93,72,83,72,82,77]);
        break;
      case 5:
        g.drawRect(77,77,99,98);
        g.drawPoly([81,87,86,92,95,82]);
        break;
      case 6:
        g.drawCircle(88,86,12);
        g.setColor("#000000").fillRect(88,71,104,80);
        g.setColor(color).drawPoly([89,74,98,76,97,67]);
        break;
      case 7:
        g.drawPoly([76,86,85,95,101,78]);
        g.drawPoly([76,88,85,97,101,80]);
        break;
      default:
        g.drawPoly([88,73,102,99,74,99,88,73]);
        g.drawPoly([88,81,88,90]);
        g.fillCircle(88,94,1);
    }
  }
  function draw() {
    var step=steps[p.phase], finished=step===7, paused=stopped();
    var ratio=p.total>0?Math.max(0,Math.min(1,p.done/p.total)):null;
    if (!dirty && (visible() || paused || finished)) return;
    dirty=false;
    Bangle.setLCDPower(true); Bangle.setBacklight(true); Bangle.setLCDBrightness(1); Bangle.setLocked(false);
    g.reset().setBgColor("#000000").clear();
    if (visible()) {
      text("Collega a Vera",20,20,"#ffffff");
      g.setColor("#00ffff").drawRect(74,52,102,92);
      g.drawPoly([80,78,87,85,98,66]);
      g.setColor("#00ff00").fillRect(8,112,167,171);
      text("CONSENTI",132,19,"#000000");
    } else {
      var color=paused?"#ffff00":finished?"#00ff00":"#00ffff";
      text(paused?(p.phase==="paused"?"Collegamento perso":"Operazione sospesa"):(labels[step-1]||"Inizializzazione"),14,17,"#ffffff");
      ring(paused?0:finished?1:ratio,color);
      symbol(step,color);
      if (!paused && !finished && ratio!==null) {
        var angle=frame*Math.PI/12;
        g.setColor(color).fillCircle(88+44*Math.cos(angle),86+44*Math.sin(angle),2);
      }
      if (paused) text("Riprendi dalla app",148,13,color);
      else {
        for (var i=1;i<=7;i++) {
          g.setColor(i<=step?color:"#0000ff");
          g.fillCircle(40+(i-1)*16,148,i===step?4:2);
        }
      }
    }
    if (g.flip) g.flip();
  }
  var timer=setInterval(function(){frame++;draw();},250);
  draw();
  return {
    enableConsent:function(){prompt=true;dirty=true;draw();},
    canConsent:function(xy){return visible()&&(!xy||(xy.x>=8&&xy.x<=167&&xy.y>=112&&xy.y<=171));},
    status:function(){return {phase:p.phase,step:steps[p.phase]||null,lastUpdateSeconds:Math.floor((frame-changed)/4),consentRequested:prompt,consentVisible:visible(),consentAccepted:allowed};},
    setConsent:function(on){allowed=on===true;dirty=true;draw();},
    set:function(phase,done,total){var transition=p.phase!==phase;p={phase:phase,done:done||0,total:total||0};changed=frame;dirty=true;if(transition)draw();},
    draw:draw,
    dispose:function(){clearInterval(timer);}
  };
};

