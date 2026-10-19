/* global bleServices, bleServiceOptions */
(function() {
  if (global.VeraNode) return;
  var started = Date.now(), lastPaint = 0, previousPhase, previousStep = -1;
  var startup = global.VeraBoot = {phase: "Sistema", done: 0, total: 0, elapsedMs: 0};
  function progress(phase, done, total) {
    // Display feedback is optional: it must never prevent data acquisition.
    try { paint(phase, done, total); }
    catch (e) { startup.displayError = true; }
  }
  function paint(phase, done, total) {
    startup.elapsedMs = Date.now() - started;
    startup.phase = phase; startup.done = done; startup.total = total;
    // Draw only when work advances, never invent a percentage or keep a timer
    // alive after startup. Avoid repainting each segment on the flash fast path.
    var step = total > 0 ? Math.floor(done * 24 / total) : 0;
    if (typeof g === "undefined" || (phase === previousPhase && done !== total &&
      step === previousStep && Date.now() - lastPaint < 1500)) return;
    previousPhase = phase; previousStep = step;
    Bangle.setLCDPower(true); Bangle.setLCDBrightness(1); Bangle.setBacklight(true);
    var w = g.getWidth(), x = w / 2, y = 112, failed = phase === "Errore avvio";
    g.reset().setBgColor("#000000").clear().setColor("#00ffff").setFont("Vector", 28).setFontAlign(0, -1);
    g.drawString("VERA", x, 14).setColor("#ffffff").setFont("Vector", 16);
    g.drawString(failed ? "Avvio interrotto" : phase === "Pronto" ? "Avviato" : "Avvio in corso", x, 51);
    g.setColor("#303030").fillCircle(x, y, 39).setColor("#000000").fillCircle(x, y, 34);
    if (total > 0 && done > 0) {
      // Outer + inner arcs stay below the hardware limit of 64 vertices.
      var points = [], i, angle, steps = Math.max(1, Math.ceil(done * 24 / total));
      for (i = 0; i <= steps; i++) {
        angle = -Math.PI / 2 + Math.PI * 2 * done / total * i / steps;
        points.push(x + Math.cos(angle) * 39, y + Math.sin(angle) * 39);
      }
      for (i = steps; i >= 0; i--) {
        angle = -Math.PI / 2 + Math.PI * 2 * done / total * i / steps;
        points.push(x + Math.cos(angle) * 34, y + Math.sin(angle) * 34);
      }
      g.setColor(failed ? "#ff0000" : "#00ffff").fillPoly(points);
    }
    g.setColor("#ffffff").setFont("Vector", 16).drawString(failed ? "Errore" : total > 1 ? done + " / " + total : "...", x, 99);
    g.setFont("Vector", 11).drawString(total > 1 ? "blocchi" : phase === "Pronto" ? "Pronto" : "Attendi", x, 122);
    g.setFont("Vector", 14).drawString(failed ? startup.failurePhase || "Sistema" : phase, x, 158);
    if (g.flip) g.flip();
    lastPaint = Date.now();
  }
  progress("Sistema", 0, 0);
  try {
  var storage = require("Storage");
  var core = require("veranode.core.js");
  var wire = require("veranode.wire.js"), server, txBytes = 20;
  var ids = {
    "2a37": "180d", "2a1f": "181a",
    "e95d0753-251d-470a-a062-fa1922dfa9a8": "e95d0753-251d-470a-a062-fa1922dfa9a8"
  };
  var services = {};
  Object.keys(ids).forEach(function(id) {
    if (!services[ids[id]]) services[ids[id]] = {};
    services[ids[id]][id] = {value: id === "2a37" ? [0, 0] : [], maxLen: id === "2a37" ? 3 : id === "2a1f" ? 2 : 6,
      notify: true, readable: true};
  });
  services[wire.service] = {};
  services[wire.service][wire.request] = {writable: true, maxLen: 20,
    security: {write: {encrypted: true}}, onWrite: function(event) { if (server) server.receive(new Uint8Array(event.data)); }};
  services[wire.service][wire.response] = {value: [], maxLen: 180, notify: true,
    security: {read: {encrypted: true}}};
  // Preserve maintenance access in this explicitly development-only package.
  // No remote rule write or ACK is exposed until authenticated provisioning exists.
  if (typeof bleServices !== "undefined") {
    Object.keys(services).forEach(function(service) { bleServices[service] = services[service]; });
    bleServiceOptions.uart = true;
  } else NRF.setServices(services, {uart: true});
  global.VeraNode = require("veranode.runtime.js").create({
    progress: progress,
    core: core, storage: storage, mac: NRF.getAddress().split(" ")[0].toUpperCase(),
    timeFactory: require("veranode.clock.js").create,
    segmentHash: function(name) {
      var raw = storage.open(name, "r").read(60000);
      if (typeof raw !== "string" || raw.length >= 60000) return null;
      return {hash: E.CRC32(raw), bytes: raw.length};
    },
    clock: {now: Date.now, setWall: function(ms, timezoneMinutes) { setTime(ms / 1000); E.setTimeZone(timezoneMinutes / 60); }, setTimeout: setTimeout, clearTimeout: clearTimeout,
      setInterval: setInterval, clearInterval: clearInterval},
    hrm: function(on) { return Bangle.setHRMPower(on, "veranode"); },
    accel: function() { return Bangle.getAccel(); },
    pressure: function() { return Bangle.getPressure(); },
    connected: function() { return !!NRF.getSecurityStatus().connected; },
    on: function(event, fn) { (event === "HRM" ? Bangle : NRF).on(event, fn); },
    off: function(event, fn) { (event === "HRM" ? Bangle : NRF).removeListener(event, fn); },
    buzz: function(ms) { Bangle.buzz(ms, 0.5); },
    publish: function(frames) {
      var changes = {};
      Object.keys(ids).forEach(function(id) {
        if (!changes[ids[id]]) changes[ids[id]] = {};
        // Clear stale readback values, without sending fabricated measurements.
        changes[ids[id]][id] = {value: frames[id] || [], notify: !!frames[id]};
      });
      if (Object.keys(changes).length) NRF.updateServices(changes);
    }
  });
  server = wire.create({chunkSize: function() { return txBytes; }, node: global.VeraNode, mac: global.VeraNode.state.mac,
    describe: function() {
      return {board: process.env.BOARD, firmware: process.env.VERSION,
        batteryPercent: E.getBattery(), charging: Bangle.isCharging(),
        storageFreeBytes: storage.getFree()};
    },
    clock: {setTimeout: setTimeout, clearTimeout: clearTimeout},
    encrypted: function() { return !!NRF.getSecurityStatus().encrypted; },
    consent: function(value) { global.VeraNode.state.consent = value; global.VeraNode.changed(); },
    send: function(text) {
      var response = {}; response[wire.service] = {}; response[wire.service][wire.response] = {value: text, notify: true};
      NRF.updateServices(response);
    }});
  // MTU changes are available on the installed Espruino 2v29. Keep the
  // default 20-byte payload for older centrals and each new connection.
  NRF.on("mtu", function(mtu) {
    if (typeof mtu === "number" && isFinite(mtu) && mtu >= 23)
      txBytes = Math.max(20, Math.min(180, Math.floor(mtu) - 3));
  });
  NRF.on("disconnect", function() { txBytes = 20; server.reset(); });
  // The system bootloader applies bleServices after all *.boot.js files.
  global.VeraNode.state.bleEnabled = (storage.readJSON("veranode.ble.json", 1) || {}).enabled !== false;
  setTimeout(function() {
    try {
      global.VeraNode.start();
      if (!global.VeraNode.state.bleEnabled) NRF.sleep();
    } catch (e) { startup.failed = true; startup.failurePhase = startup.phase; startup.error = String(e).slice(0, 120); progress("Errore avvio", 0, 0); throw e; }
  }, 0);
  } catch (e) { startup.failed = true; startup.failurePhase = startup.phase; startup.error = String(e).slice(0, 120); progress("Errore avvio", 0, 0); throw e; }
})();
