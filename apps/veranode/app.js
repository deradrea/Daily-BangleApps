(function openVeraFace() {
  var startup = global.VeraBoot;
  if (startup && startup.resume) {
    startup.onReady = openVeraFace;
    startup.resume();
    return;
  }
  var node = global.VeraNode;
  if (!node) { E.showMessage("Riavvia dopo\nl'installazione", "Vera Node"); return; }
  var core = require("veranode.core.js"), state = node.state;
  // Ensure acquisition is running after system boot/fast-load clears deferred timers.
  if (!state.running && node.start) node.start();
  var clock = {now: Date.now, setTimeout: setTimeout, clearTimeout: clearTimeout};
  var ui, redrawTimer, minuteTimer, ringTimer, animationStyle, disposed = false;
  var interaction, pressedAt, cues, page = "clock", menuIndex = 0, systemIndex = 0, history = [], consentReadyAt = 0;
  var consentFrame = false, consentEnded = false, consentChoosing = false;
  // Bounded RAM-only evidence for physical consent problems. No user identity,
  // flash writes, polling or changes to telemetry/authorization messages.
  var consentTrace = node.uiConsentTrace = [];
  function traceConsent(event, detail) {
    consentTrace.push({at: Date.now(), event: event, mode: ui && ui.mode, detail: detail});
    if (consentTrace.length > 16) consentTrace.shift();
  }
  var storage = require("Storage");
  var displaySettings = node.displaySettings || new core.DisplayPreferences(storage);
  var displayValues;
  try { displayValues=displaySettings.read(); } catch (_) { displayValues={brightnessPercent:100,standbySeconds:10,effect:"cycle"}; }
  var installedInfo = storage.readJSON("veranode.info", 1) || {};
  var styles = ["cycle", "pulse", "trace", "still"];
  var style = displayValues.effect;
  var previousPulse, previousPulseColor, previousCycle, styleError = false, candidate = styles.indexOf(style), animationEpoch = Date.now(), lastTap = 0;
  var previousOptions = Bangle.getOptions();
  var previousBrightness = (require("Storage").readJSON("setting.json", 1) || {}).brightness;
  if (typeof previousBrightness !== "number") previousBrightness = 1;
  var colors = {bg: "#000000", surface: "#000000", text: "#ffffff", muted: "#ffffff",
    success: "#00ff00", accent: "#00ffff", heart: "#ff0000", warning: "#ffff00"};
  // Only a deliberate button press or an alert wakes the display. Measurements
  // continue in boot runtime; no face-up/tap gestures, no hidden redraw loop.
  Bangle.setOptions({wakeOnBTN1: false, wakeOnFaceUp: false, wakeOnTouch: false,
    wakeOnDoubleTap: false, lockTimeout: 0, lcdPowerTimeout: 0, backlightTimeout: 0, btnLoadTimeout: 0});
  Bangle.setLCDTimeout(0);
  function power(on) {
    // Standby preserves navigation and menu position; only explicit Home resets them.
    // Do not leave an expired authorization question in the LCD framebuffer.
    if (!on && consentFrame) {
      g.reset().setBgColor(colors.bg).clear(); consentFrame = false;
    }
    if (on && consentEnded && !(ui && ui.alert)) page = "consent-ended";
    Bangle.setLCDPower(on);
    // Keep the button dispatch available while the LCD is off. Touch is
    // explicitly ignored below until a deliberate button press wakes the UI.
    Bangle.setLocked(false);
    // Brightness and backlight power are separate on firmware 2v29.
    Bangle.setLCDBrightness(on ? displayValues.brightnessPercent / 100 : 0);
    Bangle.setBacklight(on);
    startAnimation(on);
    if (minuteTimer) clearInterval(minuteTimer);
    minuteTimer = on ? setInterval(function() { if (ui) draw(ui); }, 60000) : undefined;
  }
  function startAnimation(on) {
    var eligible = on && page === "clock" && style !== "still" && !(ui && ui.alert) &&
      (style === "cycle" ? cycleProgress(Date.now()) !== null : !!recentHeart());
    if (eligible && ringTimer !== undefined && animationStyle === style) return;
    if (ringTimer !== undefined) clearInterval(ringTimer);
    ringTimer = undefined; animationStyle = undefined;
    if (!eligible) return;
    animationStyle = style;
    animationEpoch = Date.now();
    ringTimer = setInterval(function() {
      if (ui && ui.mode !== "off" && !ui.alert && page === "clock") {
        // Stop animation when its measurement expires; a fresh sensor event
        // restarts it via update(), without keeping an idle repaint loop alive.
        startAnimation(true); drawProgress();
      }
    }, style === "cycle" ? 1000 : 250);
  }
  function renewIdle() {
    // Only deliberate interaction renews standby: sensor/status redraws do not.
    if (ui.mode === "temporary" && !ui.alert) ui.show("temporary");
  }
  function setPage(next) { menuPointer=undefined; page = next; if (next === "effects") candidate = styles.indexOf(style); previousPulse = undefined; startAnimation(ui.mode !== "off"); draw(ui); }
  function openPage(next) { history.push(page); setPage(next); }
  function back() {
    if(page==="admin" && node.administration) {
      var admin=node.administration.status();
      if((admin.phase==="confirmation" || admin.phase==="verifying") && !admin.pending)node.administration.cancel();
    }
    if (page === "consent-ended") consentEnded = false; setPage(history.pop() || "clock");
  }
  function home() { consentEnded = false; history = []; setPage("clock"); }
  function button(x1, y1, x2, y2, label, size) {
    g.setColor(colors.accent).drawRect(x1, y1, x2, y2);
    text(label, (x1 + x2) / 2, (y1 + y2 - size) / 2, size, colors.text, 0);
  }
  function inside(point, x1, y1, x2, y2) { return point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2; }
  function pageHeader(title) {
    g.setColor(colors.accent).drawPoly([23, 8, 13, 17, 23, 26]);
    text(title, 104, 8, 18, colors.text, 0);
    var tint=page==="memory" || page==="admin" ? colors.warning : page==="collection" || page==="status" ? colors.success : page==="effects" ? colors.heart : colors.accent;
    g.setColor(tint).drawPoly([8,31,168,31]);
  }
  // Icon geometry is shared by rendering and hit targets: no hidden tap zones.
  var menuPointer, menuMovedAt = -Infinity;
  var menuRows = [[35,86],[92,143]];
  function listPage() { return page === "menu" || page === "settings"; }
  function scrollList(delta) {
    var system = page === "settings", index = system ? systemIndex : menuIndex;
    var next = Math.max(0, Math.min((system ? systemItems : menuItems).length-2,index+delta));
    if(next===index)return;
    if(system)systemIndex=next;else menuIndex=next;
    draw(ui);
  }
  var menuItems = [
    {label:"Raccolta", page:"collection", icon:"collect", color:"#00ff00", x:8, y:36},
    {label:"Memoria", page:"memory", icon:"memory", color:"#ffff00", x:92, y:36},
    {label:"Bluetooth", page:"bluetooth", icon:"ble", color:"#00ffff", x:8, y:105},
    {label:"Sistema", page:"settings", icon:"system", color:"#ffffff", x:92, y:105}
  ];
  function icon(kind, x, y, color) {
    g.setColor(color);
    if (kind === "collect" || kind === "effects") {
      g.drawPoly([x-13,y,x-7,y,x-3,y-9,x+2,y+9,x+7,y-3,x+13,y-3]);
      g.fillCircle(x-13,y,2); g.fillCircle(x+13,y-3,2);
    } else if (kind === "memory") {
      g.drawRect(x-12,y-10,x+12,y+10).drawRect(x-8,y-6,x+8,y-1);
      g.drawPoly([x-7,y+4,x+7,y+4]); g.drawPoly([x-7,y+7,x+3,y+7]);
    } else if (kind === "ble") {
      g.drawPoly([x,y-13,x,y+13,x+9,y+5,x-8,y-7]);
      g.drawPoly([x-8,y+7,x+9,y-5,x,y-13]);
    } else if (kind === "battery") {
      g.drawRect(x-12,y-8,x+10,y+8).fillRect(x+11,y-3,x+14,y+3);
      g.fillPoly([x+1,y-6,x-5,y+1,x,y+1,x-2,y+7,x+6,y-2,x+1,y-2]);
    } else if (kind === "admin") {
      g.drawPoly([x-11,y-9,x,y-13,x+11,y-9,x+10,y+4,x,y+13,x-10,y+4,x-11,y-9]);
      g.drawRect(x-4,y-1,x+4,y+6).drawPoly([x-3,y-1,x-3,y-5,x+3,y-5,x+3,y-1]);
    } else if (kind === "profile") {
      g.drawRect(x-12,y-10,x+12,y+10); g.fillCircle(x-5,y-3,3);
      g.drawPoly([x-9,y+6,x-9,y+3,x-5,y+1,x-1,y+3,x-1,y+6]);
      g.drawPoly([x+3,y-3,x+8,y-3]); g.drawPoly([x+3,y+3,x+8,y+3]);
    } else if (kind === "clock") {
      var ring=[]; for(var k=0;k<=16;k++){var t=k*Math.PI/8;ring.push(x+12*Math.cos(t),y+12*Math.sin(t));}
      g.drawPoly(ring);g.drawPoly([x,y-7,x,y,x+6,y+3]);
    } else {
      var points=[];for(var j=0;j<=24;j++){var angle=j*Math.PI/12,r=j%3===0?14:11;points.push(x+r*Math.cos(angle),y+r*Math.sin(angle));}
      g.drawPoly(points);g.setColor(colors.bg).fillCircle(x,y,5);g.setColor(color);
      g.drawRect(x-3,y-3,x+3,y+3);
    }
  }
  function menuPage(settings) {
    pageHeader(settings ? "Sistema" : "Menu");
    var battery=E.getBattery();
    text(typeof battery === "number" ? Math.round(battery)+"%" : "--%",169,12,10,colors.text,1);
    var items=settings?systemItems:menuItems, index=settings?systemIndex:menuIndex;
    for(var i=0;i<menuRows.length;i++){
      var item=items[index+i], bounds=menuRows[i], center=(bounds[0]+bounds[1])/2;
      icon(item.icon,26,center,item.color);
      var size=22;g.setFont("Vector",size);
      while(size>17 && g.stringWidth(item.label)>105){size--;g.setFont("Vector",size);}
      text(item.label,49,center-size/2,size,colors.text,-1);
      g.setColor(colors.text).drawPoly([157,center-5,162,center,157,center+5]);
      g.setColor(colors.accent).drawPoly([8,bounds[1],168,bounds[1]]);
    }
    g.setColor(colors.accent);
    if(index>0)g.drawPoly([34,165,44,155,54,165]);
    if(index<items.length-2)g.drawPoly([122,155,132,165,142,155]);
  }
  var systemItems=[
    {label:"Effetti",page:"effects",icon:"effects",color:colors.heart},
    {label:"Configurazione",page:"status",icon:"profile",color:colors.success},
    {label:"Ora e data",page:"time",icon:"clock",color:colors.warning},
    {label:"Software",page:"software",icon:"system",color:colors.accent},
    {label:"Amministr.",page:"admin",icon:"admin",color:colors.warning}
  ];

  function sampleStats() {
    // Uses cached segment counters: never reads records or writes flash for UI.
    if (node.samples && node.samples.stats) return node.samples.stats();
    return {pending: node.samples ? node.samples.pending() : "--", stored: "--", capacity: "--", available: "--"};
  }
  var collectionError = false;
  function collectionPage(w) {
    var linked = !!NRF.getSecurityStatus().connected, stats = sampleStats();
    pageHeader("Raccolta");
    var paused = !!state.maintenancePaused, blocked = state.paused || stats.full || !!state.storageError;
    var off = state.collectionEnabled === false;
    var appMode = state.collectionMode === "app";
    var title = off ? "Disattivata" : paused ? "In pausa" : !state.running ? "Ferma" : blocked ? "Da verificare" : appMode ? "App" : "Attiva";
    var statusColor = off || paused || !state.running || blocked ? colors.warning : colors.success;
    icon("collect",27,49,statusColor);
    text(title,106,36,21,statusColor,0,112);
    text(linked ? "BLE collegato" : "Offline",w/2,64,21,linked ? colors.accent : colors.text,0);
    var elapsed=typeof state.lastRecordAt === "number" ? Date.now()-state.lastRecordAt : -1;
    var recent=elapsed >= 0 && elapsed <= Math.max(90000,state.recordIntervalMs*2);
    var last=recent ? new Date(state.lastRecordAt) : null;
    text(collectionError ? "Riprova" : state.storageError ? "Verifica memoria" : paused || off ? "Dati conservati" : appMode ? "Archivio di riserva" : recent ?
      "Ultimo: "+("0"+last.getHours()).slice(-2)+":"+("0"+last.getMinutes()).slice(-2) : "Dato non recente",w/2,88,16,
      collectionError || state.storageError || (!paused && !off && !recent) ? colors.warning : colors.text,0);
    if (node.setCollectionMode) button(8,105,168,136,"Modalità raccolta",17);
    else if (node.setCollection) button(8,105,168,136,off ? "Attiva Raccolta" : "Disattiva Raccolta",17);
    button(8,141,168,174,state.storageError || stats.full ? "Verifica memoria" : "Memoria: "+stats.pending,18);
    // Recent sample age is available in the memory view; no new polling timer.
  }
  var collectionModes = ["active", "off", "app"];
  function collectionModePage() {
    pageHeader("Modalità raccolta");
    ["Attiva", "Disattiva", "App"].forEach(function(label, i) {
      var top = 37 + i * 43;
      button(8,top,168,top+36,
        label + (state.collectionMode === collectionModes[i] ? "  •" : ""),20);
    });
  }
  function memoryPage(w) {
    var stats = sampleStats();
    pageHeader("Memoria");
    text(stats.full ? "Memoria piena" : "Da trasferire", w / 2, 34, 18, stats.full ? colors.warning : colors.text, 0);
    icon("memory",26,73,stats.full ? colors.warning : colors.accent);
    text(stats.pending, 103, 55, 36, stats.full ? colors.warning : colors.accent, 0);
    text("Usati " + stats.stored + "/" + stats.capacity, w / 2, 96, 18, colors.text, 0);
    text("Liberi " + stats.available, w / 2, 115, 18, stats.full ? colors.warning : colors.text, 0);
    g.setColor(colors.accent).drawRect(8,91,168,94);
    if(typeof stats.stored === "number" && stats.capacity>0)
      g.setColor(stats.full?colors.warning:colors.success).fillRect(9,92,9+Math.round(158*Math.min(1,stats.stored/stats.capacity)),93);
    button(8, 137, 168, 174, "Gestisci dati", 18);
  }
  function effectsPage(w) {
    pageHeader("Effetti");
    var names = ["Ciclo sensori", "Pulsazione", "Traccia", "Statico"];
    var descriptions = ["Anello di raccolta", "Segue il bpm recente", "Illustrativa, non ECG", "Nessuna animazione"];
    icon("effects",26,49,colors.heart);
    text(names[candidate], 104, 40, 19, colors.accent, 0,112);
    text(styleError ? "Non salvato: riprova" : descriptions[candidate], w / 2, 68, 16, styleError ? colors.warning : colors.text, 0);
    button(8, 90, 76, 130, "<", 26); button(100, 90, 168, 130, ">", 26);
    button(8, 134, 168, 174, styles[candidate] === style ? "Attivo / Esci" : "Applica", 18);
  }
  function statusPage(w) {
    pageHeader("Configurazione");
    var policyColor=state.policy && !state.policyStale?colors.success:colors.warning;
    icon("profile",24,51,policyColor);
    text(state.policyStale ? "Scaduta" : state.policy ? "Applicata" : "Da applicare", 103, 41, 19, policyColor, 0);
    var rules = state.policy && Array.isArray(state.policy.rules) ? state.policy.rules.length : null;
    text(state.policy && !state.policyStale ? "Revisione " + state.policy.revision : "La raccolta continua", w / 2, 74, 17, colors.text, 0);
    text(state.policy && !state.policyStale ? rules ? rules + " regole avvisi" : "Senza regole avvisi" : "Verifica da Vera App", w / 2, 104, 16, colors.text, 0);
    button(8, 134, 168, 174, "Indietro", 18);
  }
  function timePage(w) {
    pageHeader("Ora e data");
    var now=new Date();
    icon("clock",24,57,colors.warning);
    text(("0"+now.getHours()).slice(-2)+":"+("0"+now.getMinutes()).slice(-2),104,40,32,colors.text,0);
    text(now.getFullYear()<2020?"Data da verificare":now.getDate()+" / "+(now.getMonth()+1)+" / "+now.getFullYear(),w/2,82,18,colors.warning,0);
    button(8,103,168,141,"Imposta sul Bangle",17);
    text("Sincronizza da Vera App",w/2,151,13,colors.accent,0);
  }
  var timeDraft = null, timeField = 0, timeError = null;
  var timeLabels = ["Anno", "Mese", "Giorno", "Ora", "Minuti"];
  function beginLocalTime() {
    try {
      if (!node.readClock || !node.setLocalClock) throw new Error("Aggiorna Vera Node");
      var now = new Date();
      timeDraft = {parts: [Math.max(2020,Math.min(2099,now.getFullYear())),now.getMonth()+1,now.getDate(),now.getHours(),now.getMinutes()],
        timezoneMinutes: -now.getTimezoneOffset(), snapshot: node.readClock()};
      timeField = 0; timeError = null; openPage("time-edit");
    } catch (e) { timeError = "Controllo ora non disponibile"; openPage("time-result"); }
  }
  function timeTarget() {
    var p=timeDraft.parts, leap=p[0]%4===0 && (p[0]%100!==0 || p[0]%400===0);
    var days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    if(p[1]<1 || p[1]>12 || p[2]<1 || p[2]>days[p[1]-1])throw new Error("Data non valida");
    // Espruino 2v29 has Date.parse, but no Date.UTC or getUTC* methods.
    var utc=Date.parse(p[0]+"-"+("0"+p[1]).slice(-2)+"-"+("0"+p[2]).slice(-2)+"T"+
      ("0"+p[3]).slice(-2)+":"+("0"+p[4]).slice(-2)+":00Z");
    if(!isFinite(utc))throw new Error("Data non valida");
    return utc-timeDraft.timezoneMinutes*60000;
  }
  function localTimePage(w) {
    pageHeader(page === "time-edit" ? timeLabels[timeField] : "Ora e data");
    if(page === "time-result") {
      icon("clock",w/2,55,timeError ? colors.warning : colors.success);
      text(timeError || "Ora impostata",w/2,82,18,timeError ? colors.warning : colors.success,0);
      text("Verifica con Vera App",w/2,113,16,colors.text,0);
      button(8,137,168,174,"Indietro",18); return;
    }
    var p=timeDraft.parts;
    if(page === "time-edit") {
      text((timeField>0 && p[timeField]<10 ? "0" : "")+p[timeField],w/2,timeError ? 40 : 43,timeError ? 30 : 37,colors.text,0);
      if(timeError)text(timeError,w/2,74,12,colors.warning,0);
      button(8,88,76,129,"-",28); button(100,88,168,129,"+",28);
      button(8,137,168,174,timeField===4 ? "Riepilogo" : "Avanti",18); return;
    }
    text(p[2]+" / "+p[1]+" / "+p[0],w/2,40,21,colors.text,0);
    text(("0"+p[3]).slice(-2)+":"+("0"+p[4]).slice(-2),w/2,68,29,colors.text,0);
    text(timeError || "Orario manuale",w/2,105,16,colors.warning,0);
    text("Da verificare con Vera",w/2,123,12,colors.text,0);
    button(8,141,168,175,"Conferma ora",18);
  }
  function changeTimePart(direction) {
    var limits=[[2020,2099],[1,12],[1,31],[0,23],[0,59]], range=limits[timeField];
    timeDraft.parts[timeField]+=direction;
    if(timeDraft.parts[timeField]<range[0])timeDraft.parts[timeField]=range[1];
    if(timeDraft.parts[timeField]>range[1])timeDraft.parts[timeField]=range[0];
    timeError=null; draw(ui);
  }
  function applyLocalTime() {
    try {
      var snapshot=timeDraft.snapshot;
      node.setLocalClock({utcMs:timeTarget(),timezoneMinutes:timeDraft.timezoneMinutes,
        epoch:snapshot.epoch,boot:snapshot.boot,revision:snapshot.revision});
      timeError=null;setPage("time-result");
    } catch(e) {
      timeError=e.message === "Data non valida" ? "Data non valida" : "Esito da verificare";
      if(timeError === "Data non valida"){timeField=2;setPage("time-edit");}
      else setPage("time-result");
    }
  }
  function batteryPage(w) {
    pageHeader("Batteria");
    var charging=Bangle.isCharging(), percent=E.getBattery();
    icon("battery",26,59,charging ? colors.success : colors.accent);
    text(typeof percent==="number" && isFinite(percent) ? Math.round(Math.max(0,Math.min(100,percent)))+"%" : "--%",104,41,34,colors.text,0);
    text(charging ? "In ricarica" : "Non in carica",w/2,85,21,charging ? colors.success : colors.text,0);
    text("Luce al "+displaySettings.read().brightnessPercent+"%",w/2,118,17,colors.text,0);
    text("solo a display acceso",w/2,143,14,colors.accent,0);
  }
  function softwarePage(w) {
    pageHeader("Software");
    icon("system",w/2,52,colors.accent);
    text("Vera Node",w/2,75,24,colors.text,0);
    // Display the actual runtime version, not an assumed catalogue update.
    var version=typeof state.v==="string" && state.v.length<=20 && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(state.v) ? state.v : null;
    text(version ? "Versione "+version : "Versione: vedi app",w/2,106,16,colors.text,0);
    var revision=typeof installedInfo.revision==="string" && /^veranode-[a-z0-9.-]+$/.test(installedInfo.revision) ? installedInfo.revision : null;
    text(revision ? "Build "+revision.slice(-8) : "Dettagli in Vera App",w/2,134,13,colors.accent,0);
  }
  function adminPage(w) {
    var stats=sampleStats();
    pageHeader("Elimina dati");
    var admin=node.administration && node.administration.status();
    if(admin && admin.executionEnabled) {
      var verifying=admin.phase === "verifying",busy=admin.phase === "running" || verifying;
      icon("admin",26,51,colors.warning);
      text(verifying ? "Verifica firma" : busy ? "Cancellazione" : admin.phase === "completed" ? "Completata" : typeof admin.total==="number" ? "Da cancellare" : "Campioni",105,39,17,colors.warning,0,112);
      text(verifying ? (admin.verificationPercent||0)+"%" : typeof admin.total === "number" ? (admin.removed===null ? "--" : admin.removed)+" / "+admin.total : stats.stored+" in memoria",w/2,72,23,colors.text,0);
      text(verifying ? "Controllo permesso" : admin.error ? "Da verificare" : admin.phase === "confirmation" ? "Anche non trasferiti" : admin.phase === "awaiting_authorization" ? "Autorizza da Vera App" : busy ? "Non spegnere" : "Profilo conservato",w/2,105,15,colors.text,0);
      if(admin.phase === "confirmation")button(8,137,168,174,"Verifica e cancella",16);
      else if(admin.phase === "interrupted" && admin.pending)button(8,137,168,174,"Riprendi",18);
      else if(verifying && !admin.pending)button(8,137,168,174,"Annulla verifica",16);
      else if(!busy)button(8,137,168,174,"Indietro",18);
      return;
    }
    icon("memory",26,53,colors.warning);
    text("Tutti i campioni",105,40,17,colors.warning,0,112);
    text(String(stats.stored)+" in memoria",w/2,74,22,colors.text,0);
    text(String(stats.pending)+" non trasferiti",w/2,102,17,colors.warning,0);
    text("Solo amministratore",w/2,128,16,colors.text,0);
    text("Da abilitare via Vera",w/2,149,14,colors.accent,0);
    // Fail closed until the common Vera authorization contract is available.
    // A local PIN, BLE pairing or a touch can never authorize destruction.
  }
  var ringPoints = [];
  for (var segment = 0; segment <= 60; segment++) {
    var angle = -Math.PI / 2 + segment * Math.PI / 30;
    ringPoints.push(88 + Math.cos(angle) * 46, 69 + Math.sin(angle) * 46);
  }
  function cycleProgress(now) {
    var interval = state.recordIntervalMs, next = state.nextRecordAt;
    if (!state.running || typeof interval !== "number" || !isFinite(interval) || interval <= 0 ||
      typeof next !== "number" || !isFinite(next)) return null;
    // Hold at the endpoint until acquisition actually starts the next cycle.
    return Math.max(0, Math.min(1, 1 - (next - now) / interval));
  }
  function drawProgress() {
    if (style === "still") return;
    if (style === "pulse" || style === "trace") { drawHeartEffect(); return; }
    var progress = cycleProgress(Date.now()) || 0;
    var count = Math.floor(progress * 60), frame=count+":"+!!state.paused;
    if(previousCycle===frame)return;
    previousCycle=frame;
    g.setColor("#0000ff").drawPoly(ringPoints);
    if (count > 0) g.setColor(state.paused ? colors.warning : colors.accent).drawPoly(ringPoints.slice(0, (count + 1) * 2));
  }
  var pulseRings = [40, 42, 44, 46].map(function(radius) {
    var points = [];
    for (var i = 0; i <= 36; i++) {
      var angle = -Math.PI / 2 + i * Math.PI / 18;
      points.push(88 + Math.cos(angle) * radius, 69 + Math.sin(angle) * radius);
    }
    return points;
  });
  function recentHeart() {
    var sample=state.values.battito, now=Date.now();
    return sample && typeof sample.value==="number" && isFinite(sample.value) &&
      sample.value>=30 && sample.value<=240 && now>=sample.at && now-sample.at<=45000 ? sample : null;
  }
  function drawHeartEffect() {
    var sample = recentHeart(), now = Date.now(), valid=!!sample;
    var period = valid ? 60000 / sample.value : 1000;
    var elapsed = Math.max(0, now - animationEpoch);
    var phase = (elapsed % period) / period;
    if (style === "pulse") {
      var nextPulse=valid ? Math.round(3 * Math.max(0, 1 - phase * 2)) : 0;
      var tint=valid ? colors.heart : colors.text;
      if(previousPulse===nextPulse && previousPulseColor===tint)return;
      if (previousPulse !== undefined) g.setColor(colors.bg).drawPoly(pulseRings[previousPulse]);
      previousPulse=nextPulse; previousPulseColor=tint;
      g.setColor(tint).drawPoly(pulseRings[previousPulse]);
      return;
    }
    // Decorative trace: no ECG sensor or invented waveform is being reported.
    g.setColor(colors.bg).fillRect(12, 98, 164, 120);
    var progress = cycleProgress(now);
    var points = [], centre = 18 + (progress === null ? 0 : progress) * 140;
    // A contrasting travelling stroke is easier to follow than a red baseline.
    g.setColor(valid && progress !== null ? "#0000ff" : colors.text).drawPoly([18, 110, 158, 110]);
    if (!valid || progress === null) return;
    for (var x = 18; x <= 158; x += 4) {
      var distance = x - centre, offset = 0;
      if (distance < -24 || distance > 24) continue;
      if (distance < -12) offset = (distance + 24) / 12 * 2;
      else if (distance < -6) offset = 2 - (distance + 12) / 6 * 4;
      else if (distance < 0) offset = -2 - (distance + 6) / 6 * 8;
      else if (distance < 6) offset = -10 + distance / 6 * 18;
      else if (distance < 12) offset = 8 - (distance - 6) / 6 * 8;
      points.push(x, 110 + offset);
    }
    if (points.length >= 4) {
      g.setColor(colors.heart).drawPoly(points);
      var thicker = points.map(function(v, i) { return i % 2 ? v + 1 : v; });
      g.drawPoly(thicker);
    }
    g.setColor(colors.heart).fillCircle(centre, 110, 2);

  }
  function text(value, x, y, size, color, align, maxWidth) {
    value=String(value); align=align === undefined ? -1 : align;
    var available=align===0 ? Math.min(x-4,g.getWidth()-4-x)*2 : align===1 ? x-4 : g.getWidth()-4-x;
    if(typeof maxWidth==="number") available=Math.min(available,maxWidth);
    g.setFont("Vector",size);
    while(size>10 && g.stringWidth(value)>available)g.setFont("Vector",--size);
    g.setColor(color || colors.text).setFontAlign(align,-1).drawString(value,x,y);
  }
  function box(x, y, w, h) { g.setColor(colors.surface).fillRect(x, y, x + w, y + h); }
  function heart(x, y) {
    g.setColor(colors.heart).fillCircle(x - 3, y, 4).fillCircle(x + 3, y, 4);
    g.fillPoly([x - 7, y, x + 7, y, x, y + 9]);
  }
  function bluetooth(x, y, connected) {
    g.setColor(connected ? colors.accent : colors.warning);
    g.drawPoly([x, y - 8, x, y + 8, x + 6, y + 3, x - 5, y - 5]);
    g.drawPoly([x - 5, y + 5, x + 6, y - 3, x, y - 8]);
    if (!connected) g.drawPoly([x - 8, y - 9, x + 9, y + 9]);
  }
  var bleActionError = false;
  function toggleConnections() {
    var enabled = state.bleEnabled === false;
    try {
      storage.write("veranode.ble.json", JSON.stringify({enabled: enabled}));
      if ((storage.readJSON("veranode.ble.json", 1) || {}).enabled !== enabled) throw new Error("Readback");
      if (enabled) NRF.wake(); else NRF.sleep();
      state.bleEnabled = enabled; bleActionError = false;
    } catch (e) { bleActionError = true; }
    draw(ui);
  }
  function connectionPage(w) {
    var security = NRF.getSecurityStatus(), connected = !!security.connected;
    var enabled = state.bleEnabled !== false;
    pageHeader("Bluetooth");
    icon("ble",25,47,connected ? colors.accent : colors.warning);
    text(connected ? "Collegato" : enabled ? "Disponibile" : "BLE sospeso", 105, 36, 19, connected ? colors.accent : colors.warning, 0);
    var name = connected ? state.peerName || "Nome non comunicato" : "Nessun dispositivo";
    // Wrap against actual Vector-font width, not a guessed character count.
    g.setFont("Vector", 16);
    var lines = ["", ""], cursor = 0;
    for (var line = 0; line < 2; line++) {
      while (cursor < name.length && g.stringWidth(lines[line] + name[cursor]) <= w - 16) lines[line] += name[cursor++];
      if (line === 0 && cursor < name.length && lines[0].lastIndexOf(" ") > 0) {
        var space = lines[0].lastIndexOf(" ");
        cursor -= lines[0].length - space - 1;
        lines[0] = lines[0].slice(0, space);
      }
    }
    if (cursor < name.length) {
      while (g.stringWidth(lines[1] + "...") > w - 16) lines[1] = lines[1].slice(0, -1);
      lines[1] += "...";
    }
    text(lines[0], w / 2, 62, 16, colors.text, 0);
    if (lines[1]) text(lines[1], w / 2, 80, 16, colors.text, 0);
    var address = connected && typeof security.connected_addr === "string" ? security.connected_addr.split(" ")[0] : "";
    text(address || (enabled ? "In attesa dell'app" : "Collegamento spento"), w / 2, 100, 14, colors.text, 0);
    button(8, 118, 168, 156, enabled ? connected ? "Scollega" : "Disattiva BLE" : "Abilita BLE", 18);
    text(bleActionError ? "Riprova" : state.maintenancePaused ? "Raccolta in pausa" : state.running ? "La raccolta continua" : "Raccolta ferma", w / 2, 160, 14, bleActionError ? colors.warning : colors.text, 0);
  }
  function value(field, digits) {
    var sample = state.values[field], now = Date.now();
    return sample && now >= sample.at && now - sample.at <= 45000 ? sample.value.toFixed(digits) : "--";
  }
  function draw(screen) {
    if (disposed || screen.mode === "off") return;
    if (["time-edit","time-confirm","time-result"].includes(page) && !screen.alert) {localTimePage(g.getWidth());return;}
    g.reset().setBgColor(colors.bg).clear();
    consentFrame = false;
    var w = g.getWidth(), h = g.getHeight(), battery = E.getBattery();
    if (page === "consent-ended" && !screen.alert) {
      pageHeader("Collegamento");
      text("Richiesta", w / 2, 43, 22, colors.warning, 0);
      text("terminata", w / 2, 69, 22, colors.warning, 0);
      text("Riprova da Vera", w / 2, 101, 16, colors.text, 0);
      text("sul telefono", w / 2, 120, 16, colors.text, 0);
      button(8, 143, 168, 174, "Quadrante", 18); return;
    }
    previousPulse = undefined; previousCycle=undefined;
    if (page === "menu" && !screen.alert) { menuPage(false); return; }
    if (page === "settings" && !screen.alert) { menuPage(true); return; }
    if (page === "collection" && !screen.alert) { collectionPage(w); return; }
    if (page === "collection-mode" && !screen.alert) { collectionModePage(); return; }
    if (page === "memory" && !screen.alert) { memoryPage(w); return; }
    if (page === "status" && !screen.alert) { statusPage(w); return; }
    if (page === "effects" && !screen.alert) { effectsPage(w); return; }
    if (page === "battery" && !screen.alert) { batteryPage(w); return; }
    if (page === "time" && !screen.alert) { timePage(w); return; }
    if (page === "software" && !screen.alert) { softwarePage(w); return; }
    if (page === "admin" && !screen.alert) { adminPage(w); return; }
    if (page === "bluetooth" && !screen.alert) { connectionPage(w); return; }
    if (page === "ble-confirm" && !screen.alert) {
      pageHeader("Bluetooth");
      text("Sospendere BLE?",w/2,40,18,colors.warning,0);
      text("Dati conservati",w/2,65,16,colors.text,0);
      button(8,88,168,124,"Sospendi BLE",18);
      button(8,135,168,174,"Annulla",18);return;
    }
    var batteryKnown = typeof battery === "number" && isFinite(battery);
    battery = batteryKnown ? Math.max(0, Math.min(100, battery)) : 0;
    [5, 11, 17].forEach(function(y) { g.setColor(colors.text).drawPoly([3, y, 12, y]); });
    text(state.mac.replace(/:/g, "").slice(-4), 38, 4, 12, colors.muted, 0);
    var now = new Date();
    text(("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2), w / 2, 4, 12, colors.text, 0);
    text(batteryKnown ? Math.round(battery) + "%" : "--%", 148, 5, 11, colors.text, 1);
    g.setColor(colors.muted).drawRect(152, 5, 168, 17).fillRect(169, 8, 171, 14);
    if (battery > 0) g.setColor(colors.accent).fillRect(154, 7, 154 + Math.round(12 * battery / 100), 15);
    // Shape communicates charging even without distinguishing colours.
    if (Bangle.isCharging()) {
      g.setColor(colors.success).fillPoly([113, 3, 107, 10, 111, 10, 109, 18, 117, 8, 113, 8]);
    }
    if (screen.alert) {
      var alert = screen.alert;
      box(7, 29, w - 15, 91);
      text(alert.channel === "consent" ? "Consenso" : "ALERT", 15, 36, 19, alert.severity === "critical" ? colors.heart : colors.warning);
      if (alert.channel === "consent") {
        consentFrame = true;
        var words = alert.presentation.question.split(" "), lines = [""];
        words.forEach(function(word) {
          var last = lines.length - 1;
          if ((lines[last] + word).length > 12) lines.push("");
          lines[lines.length - 1] += (lines[lines.length - 1] ? " " : "") + word;
        });
        lines.slice(0, 2).forEach(function(line, i) { text(line, w / 2, 63 + i * 25, 20, colors.text, 0); });
        text(state.consent.purpose==="display" ? "Solo display" : "Utente " + state.consent.user.slice(-6), w / 2, 116, 14, colors.muted, 0);
        ["yes", "no"].forEach(function(choice, i) {
          var x = i ? w / 2 + 4 : 8, x2 = i ? w - 9 : w / 2 - 4;
          g.setColor(colors.text).fillRect(x, 134, x2, h - 2);
          text(i ? "No" : "Si", (x + x2) / 2, 144, 20, colors.bg, 0);
        });
      } else {
        text(alert.metric === "battito" ? "Battito" : "Temperatura", 15, 62, 17);
        text(alert.value.toFixed(1), 15, 82, 27);
        text(state.storageError ? "Storico da verificare" : alert.returned ? "Condizione rientrata" : "Rilevato sul Bangle", 8, 126, 12, colors.muted);
        g.setColor(colors.accent).fillRect(8, h - 31, w - 9, h - 4);
        text("Chiudi", w / 2, h - 25, 17, colors.bg, 0);
      }
      return;
    }
    // Centred metrics; cycle ring reflects runtime cadence, not heart beats.
    drawProgress();
    heart(w / 2, 36);
    text(value("battito", 0), w / 2, 46, 38, colors.text, 0);
    text("bpm", w / 2, 86, 11, colors.text, 0);
    // Keep this row above the status icons, without touching the trace area.
    g.setColor(colors.accent).fillRect(48, 122, 54, 137).fillCircle(51, 136, 5);
    g.setColor(colors.bg).fillRect(50, 124, 52, 133);
    text(value("temperatura", 1), w / 2, 121, 21, colors.text, 0);
    text("\u00b0C", 135, 127, 12, colors.text, 0);
    var linked = !!NRF.getSecurityStatus().connected;
    // Three equal status columns, with icons and captions on common baselines.
    bluetooth(30, 154, linked);
    text(linked ? "BLE ON" : "BLE OFF", 30, 165, 10, linked ? colors.accent : colors.warning, 0);
    g.setColor(state.storageError ? colors.warning : colors.text).drawRect(82, 146, 94, 157);
    g.drawPoly([84, 150, 92, 150]); g.drawPoly([84, 153, 92, 153]);
    text(node.samples ? node.samples.pending() : "--", 88, 165, 10, colors.text, 0);
    g.setColor(colors.text).drawRect(140, 146, 152, 157);
    if (screen.mode === "pinned") g.fillRect(144, 149, 148, 154);
    text(screen.mode === "pinned" ? "Fisso" : "10 s", 146, 165, 10, colors.text, 0);

  }
  ui = new core.DisplayState(clock, draw, power, {timeout: displayValues.standbySeconds * 1000, doubleMs: 400, doubleOnMs: 700});
  cues = new core.Cues(clock, {
    light: function(on) {
      var visible = !!(ui && ui.mode !== "off");
      Bangle.setLCDBrightness(on || visible ? 1 : 0);
      Bangle.setBacklight(on || visible);
    },
    sound: function(ms) { if (Bangle.beep) Bangle.beep(ms); },
    vibrate: function(ms) { if (Bangle.buzz) Bangle.buzz(ms, 0.5); },
    stop: function() { if (Bangle.buzz) Bangle.buzz(0); if (Bangle.beep) Bangle.beep(0); }
  });
  function present(alert) {
    alert.presentation = alert.channel === "consent" ? core.validatePresentation(alert.presentation) : core.validatePresentation();
    interaction = new core.Interaction(alert.presentation, function(action) {
      return alert.channel === "consent" ? !!state.consent && state.consent.decide(action === "yes") : node.respond(alert.id, "dismissed");
    });
    ui.presentAlert(alert);
    if (alert.channel === "consent") {
      consentEnded = false; consentChoosing = false;
      if (page === "consent-ended") { page = "clock"; history = []; }
      // The protocol owns the 60-second expiry. Keep its question lit until an
      // explicit touch choice or cancellation; the normal 20-second LCD timer
      // must not hide a pending management request.
      consentReadyAt = Date.now() + 400;
      ui.show("pinned");
      power(true);
      traceConsent("present");
    }
    startAnimation(ui.mode !== "off"); cues.start(alert.presentation);
  }
  function complete() { cues.stop(); ui.closeAlert(); interaction = null; startAnimation(ui.mode !== "off"); update(); }
  var eraseConfirmReadyAt = 0, eraseConfirmationShown = false;
  function update() {
    if (disposed) return;
    startAnimation(ui.mode !== "off");
    // A pending authorization must not be hidden behind a local alert. The
    // runtime still owns that alert and will present it again after the choice.
    if (state.consent && ui.alert && ui.alert.channel !== "consent") {
      cues.stop(); ui.closeAlert(); interaction = null;
    }
    if (ui.alert && ui.alert.channel === "consent" && !state.consent) {
      traceConsent("cancelled", state.management && state.management.decisions);
      consentEnded = !consentChoosing;
      cues.stop(); ui.closeAlert(); interaction = null; startAnimation(ui.mode !== "off");
    }
    if (state.consent && !ui.alert) {
      present({id: state.consent.id, channel: "consent", severity: "warning",
        presentation: {mode: "question", question: state.consent.purpose==="display" ? "Modificare display?" : "Consentire Vera App?", light: false, sound: false,
          vibration: false, dismiss: "either", repeats: 1, pulseMs: 150}}); return;
    }
    if (state.queue.length && !ui.alert) { present(state.queue[0]); return; }
    var admin=node.administration && node.administration.status();
    var awaitingErase = admin && admin.executionEnabled && admin.phase==="confirmation";
    if (!awaitingErase) eraseConfirmationShown = false;
    if (!ui.alert && awaitingErase && !eraseConfirmationShown) {
      eraseConfirmationShown = true;
      eraseConfirmReadyAt = Date.now() + 400;
      if (page!=="admin") openPage("admin");
      if (ui.mode!=="pinned") { adminPinnedByOperation=true; ui.show("pinned"); }
    }
    if (ui.mode !== "off" && !redrawTimer) redrawTimer = setTimeout(function() { redrawTimer = undefined; draw(ui); }, 2000);
  }
  var unsubscribeDisplay=displaySettings.onChange(function(value){
    displayValues=value;
    var changedStyle=style!==value.effect; style=value.effect;
    ui.setTimeoutSeconds(value.standbySeconds);
    if(ui.mode!=="off") {
      Bangle.setLCDBrightness(value.brightnessPercent/100);
      if(changedStyle){previousPulse=undefined;startAnimation(true);}
      draw(ui);
    }
  });
  var observedClockRevision = state.clockRevision;
  var adminPinnedByOperation=false;
  var unsubscribe = node.onChange(function() {
    var admin=node.administration && node.administration.status();
    var adminActive=page==="admin" && admin && (admin.phase==="confirmation" || admin.phase==="verifying" || admin.phase==="running");
    if(adminActive && !ui.alert && ui.mode==="temporary"){adminPinnedByOperation=true;ui.show("pinned");}
    else if(adminPinnedByOperation && !adminActive){adminPinnedByOperation=false;if(!ui.alert && ui.mode==="pinned")ui.show("temporary");}
    if (observedClockRevision !== state.clockRevision) {
      observedClockRevision = state.clockRevision; lastTap = 0; pressedAt = undefined;
      if (ui.click !== null) clearTimeout(ui.click);
      ui.click = null; ui.lastPress = null; ui.quietUntil = 0;
      if (ringTimer !== undefined) clearInterval(ringTimer);
      ringTimer = undefined; previousPulse = undefined;
      startAnimation(ui.mode !== "off");
    }
    update();
  });
  function chargingChanged() {
    // Refresh visible status immediately; do not wake or restart its timeout.
    if (!disposed && ui.mode !== "off") draw(ui);
  }
  function lockedChanged(locked) {
    // A queued system lock can arrive after a long boot/archive recovery.
    // With automatic button wake disabled it would suppress every button event.
    if (!disposed && locked) Bangle.setLocked(false);
  }
  function lcdChanged(on) {
    if (!disposed && !on && state.consent && ui.alert && ui.alert.channel === "consent") {
      traceConsent("lcd-restored"); power(true); draw(ui);
    }
  }
  Bangle.on("charging", chargingChanged);
  Bangle.on("lock", lockedChanged);
  Bangle.on("lcdPower", lcdChanged);
  Bangle.setUI({mode: "custom", clock: 0,
    btn: function() {
      pressedAt = Date.now();
      if (consentEnded) traceConsent("button-after-consent");
      if (ui.alert && ui.alert.channel === "consent") {
        traceConsent("button-down");
        consentReadyAt = pressedAt + 400;
        ui.show("pinned"); power(true);
      }
    },
    btnRelease: function() {
      var duration = pressedAt === undefined ? 0 : Date.now() - pressedAt; pressedAt = undefined;
      if (ui.alert && ui.alert.channel === "consent") {
        traceConsent("button-up", duration);
        // A wake/pin gesture never chooses Yes/No or dismisses authorization.
        consentReadyAt = Date.now() + 400;
        ui.show("pinned"); power(true);
        return;
      }
      if (ui.alert && ui.mode !== "off") {
        if (interaction.button(duration)) complete(); else draw(ui);
      } else if (!adminPinnedByOperation) {
        var origin = page;
        ui.press(function() {
          if (page !== origin) return;
          if (page === "clock") openPage("menu");
          else back();
          // Navigating from a fixed display returns to automatic standby.
          if (ui.mode === "pinned") ui.show("temporary");
        });
      }
    },
    swipe: function(direction, vertical) {
      if (ui.mode === "off" || ui.alert) return;
      renewIdle();
      if (listPage()) {
        // The firmware can report a swipe before or after drag release.
        if(vertical && !menuPointer && Date.now()-menuMovedAt>=180)scrollList(vertical<0?1:-1);
        return;
      }
      if (page === "effects" && direction) { candidate = (candidate + (direction < 0 ? 1 : styles.length - 1)) % styles.length; draw(ui); return; }
      if (vertical === -1 && page === "clock") openPage("effects");
      else if (vertical === 1 && page === "clock") openPage("menu");
      else if (vertical === 1 || direction === 1) back();
      else if (direction === -1 && page === "clock") openPage("bluetooth");
    },
    drag: function(point) {
      if (!listPage() || ui.mode==="off" || ui.alert) {menuPointer=undefined;return;}
      if(point.b){
        if(!menuPointer || menuPointer.page!==page){
          menuPointer={page:page,x:point.x,y:point.y,dx:0,dy:0,moved:false};renewIdle();
        }else{
          menuPointer.dx=point.x-menuPointer.x;
          menuPointer.dy=point.y-menuPointer.y;
          if(Math.abs(menuPointer.dx)>=10 || Math.abs(menuPointer.dy)>=10)menuPointer.moved=true;
        }
        return;
      }
      var pointer=menuPointer;menuPointer=undefined;
      if(!pointer || pointer.page!==page || !pointer.moved)return;
      menuMovedAt=Date.now();renewIdle();
      if(Math.abs(pointer.dy)>=18 && Math.abs(pointer.dy)>Math.abs(pointer.dx)*1.2)
        scrollList(pointer.dy<0?1:-1);
    },
    touch: function(_, point) {
      if (ui.mode === "off" || !point) return;
      if (!ui.alert) {
        renewIdle();
        var now = Date.now();
        if (listPage() && (point.type>0 || (menuPointer && menuPointer.moved) || now-menuMovedAt<180)) return;
        if (now - lastTap < (listPage()?140:300)) return;
        lastTap = now;
        if (page !== "clock" && inside(point, 0, 0, 44, 32)) { back(); return; }
        if (page === "consent-ended" && inside(point, 8, 143, 168, 174)) {
          consentEnded = false; home(); return;
        }
        if (page === "clock" && inside(point,116,0,175,27)) { openPage("battery"); return; }
        if (page === "clock" && inside(point,44,30,132,119)) { openPage("effects"); return; }
        if (page === "clock" && inside(point,40,121,155,141)) { openPage("collection"); return; }
        if (page === "clock" && inside(point, 0, 0, 58, 28)) { openPage("menu"); return; }
        if (listPage()) {
          var items=page==="settings"?systemItems:menuItems, index=page==="settings"?systemIndex:menuIndex;
          for(var i=0;i<menuRows.length;i++)if(inside(point,4,menuRows[i][0],171,menuRows[i][1])){
            openPage(items[index+i].page);return;
          }
          if(inside(point,8,148,80,175))scrollList(-1);
          else if(inside(point,96,148,168,175))scrollList(1);
          return;
        }
        if (page === "ble-confirm") {
          if(inside(point,8,135,168,174))back();
          else if(inside(point,8,88,168,124)){back();toggleConnections();}
          return;
        }
        if (page === "collection") {
          if (inside(point, 8, 141, 168, 174)) openPage("memory");
          else if (node.setCollectionMode && inside(point, 8, 105, 168, 136)) openPage("collection-mode");
          else if (node.setCollection && inside(point, 8, 105, 168, 136)) {
            try { node.setCollection(state.collectionEnabled === false); collectionError = false; }
            catch (_) { collectionError = true; }
            draw(ui);
          }
          return;
        }
        if (page === "collection-mode") {
          for (var modeIndex=0;modeIndex<collectionModes.length;modeIndex++) {
            var modeTop=37+modeIndex*43;
            if (!inside(point,8,modeTop,168,modeTop+36)) continue;
            try { node.setCollectionMode(collectionModes[modeIndex]); collectionError=false; }
            catch (_) { collectionError=true; }
            back();
            return;
          }
          return;
        }
        if (page === "memory") {
          if (inside(point, 8, 137, 168, 174)) openPage("admin");
          return;
        }
        if (page === "effects") {
          if (inside(point, 8, 86, 76, 126)) candidate = (candidate + styles.length - 1) % styles.length;
          else if (inside(point, 100, 86, 168, 126)) candidate = (candidate + 1) % styles.length;
          else if (inside(point, 8, 134, 168, 174)) {
            try {
              var currentDisplay=displaySettings.read();
              displaySettings.set({expectedRevision:currentDisplay.revision,operationId:"local-"+Date.now(),values:{
                brightnessPercent:currentDisplay.brightnessPercent,standbySeconds:currentDisplay.standbySeconds,effect:styles[candidate]}});
              style = styles[candidate]; styleError = false; home(); return;
            } catch (e) { styleError = true; }
          }
          draw(ui);
        } else if (page === "bluetooth") {
          if (inside(point, 8, 118, 168, 156)) {if(state.bleEnabled !== false)openPage("ble-confirm");else toggleConnections();}
        } else if (page === "time") {
          if(inside(point,8,103,168,141))beginLocalTime();
        } else if (page === "time-edit") {
          if(inside(point,8,88,76,129))changeTimePart(-1);
          else if(inside(point,100,88,168,129))changeTimePart(1);
          else if(inside(point,8,137,168,174)){if(timeField<4){timeField++;draw(ui);}else setPage("time-confirm");}
        } else if (page === "time-confirm") {
          if(inside(point,8,141,168,175))applyLocalTime();
        } else if (page === "time-result") {
          if(inside(point,8,137,168,174))back();
        } else if(page === "admin") {
          var admin=node.administration && node.administration.status();
          if(admin && admin.executionEnabled && inside(point,8,137,168,174)) {
            if(admin.phase === "confirmation"){
              if (eraseConfirmationShown && Date.now()>=eraseConfirmReadyAt) node.administration.confirm();
            }
            else if(admin.phase === "interrupted" && admin.pending)node.administration.resume();
            else if(admin.phase!=="running"){node.administration.cancel();back();}
            draw(ui);
          }
        } else if (["software","battery"].includes(page)) {
          return;
        } else if (page !== "clock") {
          if (inside(point, 8, 134, 168, 174)) back();
        } else if (point.y >= 142 && point.y <= 175) {
          if (point.x >= 8 && point.x <= 54) openPage("bluetooth");
          else if (point.x >= 64 && point.x <= 112) openPage("collection");
          else if (point.x >= 122 && point.x <= 168) ui.press();
        }
        return;
      }
      if (ui.alert.channel === "consent") {
        // Gripping the side button can also generate a capacitive touch before
        // its release. Reject that whole gesture, not only the release tail.
        if (pressedAt !== undefined || Date.now() < consentReadyAt) {
          traceConsent("touch-guarded"); return;
        }
        var choice = inside(point, 8, 134, g.getWidth() / 2 - 4, g.getHeight() - 2) ? "yes" :
          inside(point, g.getWidth() / 2 + 4, 134, g.getWidth() - 9, g.getHeight() - 2) ? "no" : null;
        traceConsent("touch", choice || "outside");
        if (choice) {
          consentChoosing = true;
          if (interaction.touch(choice)) complete();
          consentChoosing = false;
        }
        return;
      }
      var signal = ui.alert.presentation.mode === "signal";
      if (!signal && (point.y < g.getHeight() - 34 || point.x < 8 || point.x > g.getWidth() - 9)) return;
      if (interaction.touch(point.x < g.getWidth() / 2 ? "yes" : "no")) complete();
    },
    remove: function() {
      if (ui.alert && ui.alert.channel === "consent") traceConsent("ui-removed");
      disposed = true; unsubscribeDisplay(); unsubscribe(); ui.dispose();
      Bangle.removeListener("charging", chargingChanged);
      Bangle.removeListener("lock", lockedChanged);
      Bangle.removeListener("lcdPower", lcdChanged);
      cues.stop();
      if (redrawTimer) clearTimeout(redrawTimer);
      if (minuteTimer) clearInterval(minuteTimer);
      if (ringTimer) clearInterval(ringTimer);
      Bangle.setOptions(previousOptions);
      Bangle.setLCDBrightness(previousBrightness);
      // Runtime deliberately remains alive when this UI is removed.
    }
  });
  Bangle.setLocked(false);
  update();
  // Replace the loader frame with visible evidence that startup completed.
  // Only once per runtime boot; returning from settings must not keep waking
  // the display, and a pending consent/alert must retain precedence.
  if (!node.uiReadyShown && global.__FILE__ === "veranode.app.js") {
    node.uiReadyShown = true;
    if (!ui.alert) ui.show("temporary");
  }
})();


