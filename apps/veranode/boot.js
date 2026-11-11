/* global bleServices, bleServiceOptions */
(function() {
  if (global.VeraNode || (global.VeraBoot && global.VeraBoot.resume)) return;
  var started = Date.now(), clockShown = false;
  var startup = global.VeraBoot = {phase: "Sistema", done: 0, total: 0, elapsedMs: 0};
  function progress(phase, done, total) {
    // Display feedback is optional: it must never prevent data acquisition.
    try { paint(phase, done, total); }
    catch (e) { startup.displayError = true; }
  }
  function paint(phase, done, total) {
    startup.elapsedMs = Date.now() - started;
    startup.phase = phase; startup.done = done; startup.total = total;
    if (typeof g === "undefined") return;
    var failed = phase === "Errore avvio";
    if (startup.faceShown && !failed) {
      if (phase !== "Pronto" && startup.drawProgress) startup.drawProgress(done, total);
      return;
    }
    if (clockShown && !failed && phase !== "Pronto") return;
    Bangle.setLCDPower(true); Bangle.setLCDBrightness(1); Bangle.setBacklight(true);
    var x = g.getWidth() / 2, ready = phase === "Pronto";
    var color = failed ? "#ffff00" : ready ? "#00ff00" : "#00ffff";
    g.reset().setBgColor("#000000").clear().setColor("#ffffff").setFont("Vector", 22).setFontAlign(0, -1);
    g.drawString("VERA", x, 15);
    g.setColor("#0000ff").fillCircle(x, 85, 35);
    g.setColor("#000000").fillCircle(x, 85, 31);
    g.setColor(color);
    if (failed) {
      g.drawPoly([x, 68, x + 17, 101, x - 17, 101, x, 68]);
      g.drawPoly([x, 79, x, 89]);
      g.fillCircle(x, 94, 1);
    } else if (ready) {
      g.drawPoly([x - 13, 85, x - 4, 95, x + 15, 76]);
    } else {
      g.drawPoly([x - 20, 85, x - 9, 85, x - 4, 74, x + 4, 98, x + 10, 85, x + 20, 85]);
    }
    g.setFont("Vector", 15).drawString(failed ? "Avvio interrotto" : ready ? "Avviato" : "Avvio raccolta", x, 137);
    if (g.flip) g.flip();
    if (!clockShown && !failed) {
      startup.firstClockMs = Date.now() - started;
      clockShown = true;
    }
  }
  progress("Sistema", 0, 0);
  try {
  var storage = require("Storage");
  // The bootloader needs the GATT definitions synchronously. Load the RPC
  // implementation after the foreground clock has had a chance to draw.
  var uuidSuffix = "-7b2c-4c61-9e3a-5f42616e676c";
  var managementService = "d4a10000" + uuidSuffix, request = "d4a10001" + uuidSuffix;
  var response = "d4a10002" + uuidSuffix, wire, server, txBytes = 20;
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
  services[managementService] = {};
  services[managementService][request] = {writable: true, maxLen: 20,
    security: {write: {encrypted: true}}, onWrite: function(event) { if (server) server.receive(new Uint8Array(event.data)); }};
  services[managementService][response] = {value: [], maxLen: 180, notify: true,
    security: {read: {encrypted: true}}};
  // Preserve maintenance access in this explicitly development-only package.
  // No remote rule write or ACK is exposed until authenticated provisioning exists.
  if (typeof bleServices !== "undefined") {
    Object.keys(services).forEach(function(service) { bleServices[service] = services[service]; });
    bleServiceOptions.uart = true;
  } else NRF.setServices(services, {uart: true});
  var runtime, env;
  function loadRuntime() {
    wire = require("veranode.wire.js");
    runtime = require("veranode.runtime.js");
    env = {
      progress: progress,
      core: require("veranode.core.js"), storage: storage, mac: NRF.getAddress().split(" ")[0].toUpperCase(),
      timeFactory: require("veranode.clock.js").create,
      indexHash: typeof E !== "undefined" && typeof E.CRC32 === "function" ? function(text) { return E.CRC32(text); } : undefined,
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
    };
  }
  function ready(archives) {
    global.VeraNode = runtime.create(env, archives);
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
    global.VeraNode.start();
    startup.collectionReadyMs = Date.now() - started;
    if (!global.VeraNode.state.bleEnabled) NRF.sleep();
  }
  var archives, journals, index = 0, timer;
  function schedule(delay) {
    if (timer !== undefined) {
      try { clearTimeout(timer); } catch (_) { /* The system may have removed it. */ }
    }
    timer = setTimeout(recover, delay);
  }
  function recover() {
    timer = undefined;
    try {
      if (!archives) {
        loadRuntime();
        archives = runtime.openArchives(env, true);
        journals = [archives.samples, archives.events, archives.timeHistory];
      }
      while (index < journals.length) {
        var journal = journals[index];
        if (journal && !journal.recover(32)) { schedule(1); return; }
        index++;
      }
      delete startup.resume;
      ready(archives);
      archives = journals = undefined;
    } catch (e) { fail(e); return; }
    var onReady = startup.onReady;
    delete startup.onReady;
    delete startup.drawProgress;
    if (onReady) {
      try { onReady(); } catch (_) { startup.displayError = true; }
    }
  }
  // The clock loader may clear timers while opening the foreground app.
  startup.resume = function() { schedule(0); };
  startup.resume();
  } catch (e) { fail(e); throw e; }
  function fail(e) {
    delete startup.resume;
    delete startup.onReady;
    delete startup.drawProgress;
    startup.failed = true; startup.failurePhase = startup.phase;
    startup.error = String(e).slice(0, 120);
    progress("Errore avvio", 0, 0);
  }
})();
