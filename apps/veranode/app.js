(function() {
  var node = global.VeraNode;
  if (!node) { E.showMessage("Riavvia dopo\nl'installazione", "Vera Node"); return; }
  var core = require("veranode.core.js"), state = node.state;
  // Ensure acquisition is running after system boot/fast-load clears deferred timers.
  if (!state.running && node.start) node.start();
  var clock = {now: Date.now, setTimeout: setTimeout, clearTimeout: clearTimeout};
  var ui, redrawTimer, minuteTimer, ringTimer, animationStyle, disposed = false;
  var interaction, pressedAt, cues, page = "clock", menuIndex = 0, history = [], consentReadyAt = 0;
  var consentFrame = false, consentEnded = false, consentChoosing = false;
  // Bounded RAM-only evidence for physical consent problems. No user identity,
  // flash writes, polling or changes to telemetry/authorization messages.
  var consentTrace = node.uiConsentTrace = [];
  function traceConsent(event, detail) {
    consentTrace.push({at: Date.now(), event: event, mode: ui && ui.mode, detail: detail});
    if (consentTrace.length > 16) consentTrace.shift();
  }
  var storage = require("Storage"), savedFace = storage.readJSON("veranode.face.json", 1) || {};
  var styles = ["cycle", "pulse", "trace", "still"];
  var style = styles.includes(savedFace.style) ? savedFace.style : "cycle";
  var previousPulse, styleError = false, candidate = styles.indexOf(style), animationEpoch = Date.now(), lastTap = 0;
  var previousOptions = Bangle.getOptions();
  var previousBrightness = (require("Storage").readJSON("setting.json", 1) || {}).brightness;
  if (typeof previousBrightness !== "number") previousBrightness = 1;
  var colors = {bg: "#000000", surface: "#000000", text: "#ffffff", muted: "#ffffff",
    accent: "#00ffff", heart: "#ff0000", warning: "#ffff00"};
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
    Bangle.setLCDBrightness(on ? 1 : 0);
    Bangle.setBacklight(on);
    startAnimation(on);
    if (minuteTimer) clearInterval(minuteTimer);
    minuteTimer = on ? setInterval(function() { if (ui) draw(ui); }, 60000) : undefined;
  }
  function startAnimation(on) {
    var eligible = on && page === "clock" && style !== "still" && !(ui && ui.alert);
    if (eligible && ringTimer !== undefined && animationStyle === style) return;
    if (ringTimer !== undefined) clearInterval(ringTimer);
    ringTimer = undefined; animationStyle = undefined;
    if (!eligible) return;
    animationStyle = style;
    animationEpoch = Date.now();
    ringTimer = setInterval(function() {
      if (ui && ui.mode !== "off" && !ui.alert && page === "clock") drawProgress();
    }, style === "cycle" ? 1000 : 250);
  }
  function renewIdle() {
    // Only deliberate interaction renews standby: sensor/status redraws do not.
    if (ui.mode === "temporary" && !ui.alert) ui.show("temporary");
  }
  function setPage(next) { page = next; if (next === "effects") candidate = styles.indexOf(style); previousPulse = undefined; startAnimation(ui.mode !== "off"); draw(ui); }
  function openPage(next) { history.push(page); setPage(next); }
  function back() { if (page === "consent-ended") consentEnded = false; setPage(history.pop() || "clock"); }
  function home() { consentEnded = false; history = []; setPage("clock"); }
  function button(x1, y1, x2, y2, label, size) {
    g.setColor(colors.text).drawRect(x1, y1, x2, y2);
    text(label, (x1 + x2) / 2, (y1 + y2 - size) / 2, size, colors.text, 0);
  }
  function inside(point, x1, y1, x2, y2) { return point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2; }
  function pageHeader(title) {
    g.setColor(colors.text).drawPoly([23, 8, 13, 17, 23, 26]);
    text(title, 104, 8, 18, colors.text, 0);
  }
  // Icon geometry is shared by rendering and hit targets: no hidden tap zones.
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
    if (!settings) {
      for(var i=0;i<2;i++) {
        var item=menuItems[menuIndex+i],top=35+i*58;
        g.setColor(item.color).drawRect(8,top,168,top+50);
        icon(item.icon,28,top+25,item.color);
        var size=22;g.setFont("Vector",size);
        while(size>18 && g.stringWidth(item.label)>110){size--;g.setFont("Vector",size);}
        text(item.label,52,top+(50-size)/2,size,colors.text,-1);
      }
      // A vertical scroll indicator replaces page numbers and paging buttons.
      g.setColor(colors.text).drawPoly([173,35,173,143]);
      g.fillRect(172,35+menuIndex*27,174,89+menuIndex*27);
      if(menuIndex<menuItems.length-2)g.drawPoly([79,153,88,161,97,153]);
      return;
    }
    ["Effetti", "Profilo", "Quadrante"].forEach(function(label,i) {
      var top=36+i*47;
      g.setColor(colors.text).drawRect(8,top,168,top+39);
      icon(["effects","profile","clock"][i],29,top+20,colors.accent);
      text(label,96,top+11,18,colors.text,0);
      g.drawPoly([154,top+15,160,top+20,154,top+25]);
    });
  }
  function sampleStats() {
    // Uses cached segment counters: never reads records or writes flash for UI.
    if (node.samples && node.samples.stats) return node.samples.stats();
    return {pending: node.samples ? node.samples.pending() : "--", stored: "--", capacity: "--", available: "--"};
  }
  function collectionPage(w) {
    var linked = !!NRF.getSecurityStatus().connected, stats = sampleStats();
    pageHeader("Raccolta");
    var paused = !!state.maintenancePaused, blocked = state.paused || stats.full || !!state.storageError;
    var title = paused ? "In pausa" : !state.running ? "Ferma" : blocked ? "Da verificare" : "Attiva";
    text(title,w/2,35,23,paused || !state.running || blocked ? colors.warning : colors.text,0);
    text(linked ? "BLE collegato" : "Offline",w/2,64,21,linked ? colors.accent : colors.text,0);
    text(paused ? "Pausa di test" : linked ? "Non prova invio" : "Senza telefono",w/2,91,18,colors.text,0);
    var elapsed=typeof state.lastRecordAt === "number" ? Date.now()-state.lastRecordAt : -1;
    var recent=elapsed >= 0 && elapsed <= Math.max(90000,state.recordIntervalMs*2);
    var last=recent ? new Date(state.lastRecordAt) : null;
    text(state.storageError ? "Verifica memoria" : paused ? "Dati conservati" : recent ?
      "Ultimo: "+("0"+last.getHours()).slice(-2)+":"+("0"+last.getMinutes()).slice(-2) : "Dato non recente",w/2,114,17,
      state.storageError || (!paused && !recent) ? colors.warning : colors.text,0);
    button(8,137,168,174,state.storageError || stats.full ? "Verifica memoria" : "Memoria: "+stats.pending,18);
    // Recent sample age is available in the memory view; no new polling timer.
  }
  function memoryPage(w) {
    var stats = sampleStats();
    pageHeader("Memoria");
    text(stats.full ? "Memoria piena" : "Da trasferire", w / 2, 34, 18, stats.full ? colors.warning : colors.text, 0);
    text(stats.pending, w / 2, 55, 36, stats.full ? colors.warning : colors.accent, 0);
    text("Usati " + stats.stored + "/" + stats.capacity, w / 2, 96, 18, colors.text, 0);
    text("Liberi " + stats.available, w / 2, 115, 18, stats.full ? colors.warning : colors.text, 0);
    button(8, 137, 168, 174, "Indietro", 18);
  }
  function effectsPage(w) {
    pageHeader("Effetti");
    var names = ["Ciclo sensori", "Pulsazione", "Traccia", "Statico"];
    var descriptions = ["Anello di raccolta", "Segue il bpm recente", "Illustrativa, non ECG", "Nessuna animazione"];
    text(names[candidate], w / 2, 40, 22, colors.accent, 0);
    text(styleError ? "Non salvato: riprova" : descriptions[candidate], w / 2, 68, 16, styleError ? colors.warning : colors.text, 0);
    button(8, 90, 76, 130, "<", 26); button(100, 90, 168, 130, ">", 26);
    button(8, 134, 168, 174, styles[candidate] === style ? "Attivo / Esci" : "Applica", 18);
  }
  function statusPage(w) {
    pageHeader("Profilo");
    text(state.policy ? "Profilo Vera" : "Nessun profilo", w / 2, 39, 22, colors.text, 0);
    text(state.policy ? "Revisione " + state.policy.revision : "Da Vera App", w / 2, 67, 18, colors.text, 0);
    var rules = state.policy && Array.isArray(state.policy.rules) ? state.policy.rules.length : null;
    text(rules === null ? "Regole: --" : rules + " regole", w / 2, 91, 18, colors.text, 0);
    text(state.policyStale ? "Scaduto" : state.policy ? "Presente" : "Da configurare", w / 2, 115, 16, state.policyStale ? colors.warning : colors.text, 0);
    button(8, 134, 168, 174, "Indietro", 18);
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
    g.setColor("#0000ff").drawPoly(ringPoints);
    var count = Math.floor(progress * 60);
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
  function drawHeartEffect() {
    var sample = state.values.battito, now = Date.now();
    var valid = sample && typeof sample.value === "number" && isFinite(sample.value) &&
      sample.value >= 30 && sample.value <= 240 && now >= sample.at && now - sample.at <= 45000;
    var period = valid ? 60000 / sample.value : 1000;
    var elapsed = Math.max(0, now - animationEpoch);
    var phase = (elapsed % period) / period;
    if (style === "pulse") {
      if (previousPulse !== undefined) g.setColor(colors.bg).drawPoly(pulseRings[previousPulse]);
      previousPulse = valid ? Math.round(3 * Math.max(0, 1 - phase * 2)) : 0;
      g.setColor(valid ? colors.heart : colors.text).drawPoly(pulseRings[previousPulse]);
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
  function text(value, x, y, size, color, align) {
    g.setColor(color || colors.text).setFont("Vector", size).setFontAlign(align === undefined ? -1 : align, -1).drawString(String(value), x, y);
  }
  function box(x, y, w, h) { g.setColor(colors.surface).fillRect(x, y, x + w, y + h); }
  function heart(x, y) {
    g.setColor(colors.heart).fillCircle(x - 3, y, 4).fillCircle(x + 3, y, 4);
    g.fillPoly([x - 7, y, x + 7, y, x, y + 9]);
  }
  function bluetooth(x, y, connected) {
    g.setColor(connected ? colors.accent : colors.text);
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
    text(connected ? "Collegato" : enabled ? "Disponibile" : "BLE sospeso", w / 2, 34, 22, connected ? colors.accent : colors.text, 0);
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
    previousPulse = undefined;
    if (page === "menu" && !screen.alert) { menuPage(false); return; }
    if (page === "settings" && !screen.alert) { menuPage(true); return; }
    if (page === "collection" && !screen.alert) { collectionPage(w); return; }
    if (page === "memory" && !screen.alert) { memoryPage(w); return; }
    if (page === "status" && !screen.alert) { statusPage(w); return; }
    if (page === "effects" && !screen.alert) { effectsPage(w); return; }
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
      g.setColor(colors.text).fillPoly([113, 3, 107, 10, 111, 10, 109, 18, 117, 8, 113, 8]);
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
        text("Utente " + state.consent.user.slice(-6), w / 2, 116, 14, colors.muted, 0);
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
    text(linked ? "On" : "Off", 30, 165, 10, colors.text, 0);
    g.setColor(state.storageError ? colors.warning : colors.text).drawRect(82, 146, 94, 157);
    g.drawPoly([84, 150, 92, 150]); g.drawPoly([84, 153, 92, 153]);
    text(node.samples ? node.samples.pending() : "--", 88, 165, 10, colors.text, 0);
    g.setColor(colors.text).drawRect(140, 146, 152, 157);
    if (screen.mode === "pinned") g.fillRect(144, 149, 148, 154);
    text(screen.mode === "pinned" ? "Fisso" : "10 s", 146, 165, 10, colors.text, 0);

  }
  ui = new core.DisplayState(clock, draw, power, {timeout: 10000, doubleMs: 400, doubleOnMs: 700});
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
  function update() {
    if (disposed) return;
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
        presentation: {mode: "question", question: "Consentire Vera App?", light: false, sound: false,
          vibration: false, dismiss: "either", repeats: 1, pulseMs: 150}}); return;
    }
    if (state.queue.length && !ui.alert) { present(state.queue[0]); return; }
    if (ui.mode !== "off" && !redrawTimer) redrawTimer = setTimeout(function() { redrawTimer = undefined; draw(ui); }, 2000);
  }
  var observedClockRevision = state.clockRevision;
  var unsubscribe = node.onChange(function() {
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
      } else ui.press();
    },
    swipe: function(direction, vertical) {
      if (ui.mode === "off" || ui.alert) return;
      renewIdle();
      if (page === "menu" && vertical) {menuIndex=Math.max(0,Math.min(menuItems.length-2,menuIndex+(vertical<0?1:-1)));draw(ui);return;}
      if (page === "effects" && direction) { candidate = (candidate + (direction < 0 ? 1 : styles.length - 1)) % styles.length; draw(ui); return; }
      if (vertical === -1 && page === "clock") openPage("effects");
      else if (vertical === 1 && page === "clock") openPage("menu");
      else if (vertical === 1 || direction === 1) back();
      else if (direction === -1 && page === "clock") openPage("bluetooth");
    },
    touch: function(_, point) {
      if (ui.mode === "off" || !point) return;
      if (!ui.alert) {
        renewIdle();
        var now = Date.now();
        if (now - lastTap < 300) return;
        lastTap = now;
        if (page !== "clock" && inside(point, 0, 0, 44, 32)) { back(); return; }
        if (page === "consent-ended" && inside(point, 8, 143, 168, 174)) {
          consentEnded = false; home(); return;
        }
        if (page === "clock" && inside(point, 0, 0, 58, 28)) { openPage("menu"); return; }
        if (page === "menu") {
          for(var m=0;m<2;m++)if(inside(point,8,35+m*58,168,85+m*58)){openPage(menuItems[menuIndex+m].page);return;}
          return;
        }
        if (page === "settings") {
          var targets=["effects","status","clock"];
          for(var i=0;i<targets.length;i++) if(inside(point,8,36+i*47,168,75+i*47)) {
            if(targets[i] === "clock")home();else openPage(targets[i]);return;
          }
          return;
        }
        if (page === "ble-confirm") {
          if(inside(point,8,135,168,174))back();
          else if(inside(point,8,88,168,124)){back();toggleConnections();}
          return;
        }
        if (page === "collection") {
          if (inside(point, 8, 134, 168, 174)) openPage("memory");
          return;
        }
        if (page === "memory") {
          if (inside(point, 8, 134, 168, 174)) back();
          return;
        }
        if (page === "effects") {
          if (inside(point, 8, 86, 76, 126)) candidate = (candidate + styles.length - 1) % styles.length;
          else if (inside(point, 100, 86, 168, 126)) candidate = (candidate + 1) % styles.length;
          else if (inside(point, 8, 134, 168, 174)) {
            try {
              storage.write("veranode.face.json", JSON.stringify({style: styles[candidate]}));
              if ((storage.readJSON("veranode.face.json", 1) || {}).style !== styles[candidate]) throw new Error("Readback");
              style = styles[candidate]; styleError = false; home(); return;
            } catch (e) { styleError = true; }
          }
          draw(ui);
        } else if (page === "bluetooth") {
          if (inside(point, 8, 118, 168, 156)) {if(state.bleEnabled !== false)openPage("ble-confirm");else toggleConnections();}
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
      disposed = true; unsubscribe(); ui.dispose();
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


