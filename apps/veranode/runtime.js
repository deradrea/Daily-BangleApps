/* Bangle.js2 platform adapter. Display absence and BLE disconnect never stop acquisition. */
exports.create = function(env) {
  var core = env.core, storage = env.storage, clock = env.clock;
  var config = storage.readJSON("veranode.config.json", true) || {};
  var intervalMs = typeof config.recordMs === "number" && isFinite(config.recordMs) ?
    Math.max(10000, Math.min(45000, config.recordMs)) : 30000;
  // 24 hours at the configured cadence, plus two segments for partial ACKs.
  // Reserve quota, not RAM: records continue to be appended directly to flash.
  var sampleSegments = Math.ceil(86400000 / intervalMs / 32) + 2;
  // A single inventory is enough: initialization only creates normal metadata
  // files; no StorageFile is appended until the collector starts.
  var files = storage.list(undefined, {sf: true});
  function journal(prefix, segments, records, label) {
    return new core.Journal(storage, prefix, {maxSegments: segments, segmentRecords: records,
      segmentHash: env.segmentHash, files: files,
      progress: function(done, total) { if (env.progress) env.progress(label, done, total); }});
  }
  var samples = journal("veranode.s", sampleSegments, 32, "Campioni");
  var events = journal("veranode.e", 4, 16, "Eventi");
  var timeHistory = env.timeFactory ? journal("veranode.t", 4, 16, "Orario") : null;
  var state = {v: "0.2.0", mac: env.mac, connected: false, recordIntervalMs: intervalMs, lastRecordAt: null, nextRecordAt: null, peerName: null, values: {}, running: false,
    policy: null, policyStale: false, queue: [], storageError: null, temperatureSource: "barometer", paused: false};
  var sensorHealth = {schemaVersion: 1, hrmRequested: false, tickCount: 0, heartEvents: 0, temperatureReads: 0, temperatureFailures: 0, startError: null};
  var listeners = [], timer, pendingPressure = false, pressureGeneration = 0, pressureTimer;
  var engine, disposed = false, lastNotify = 0, notifyTimer;
  function rebaseTime(delta) {
    state.values = {};
    if (state.lastRecordAt !== null) state.lastRecordAt += delta;
    if (state.nextRecordAt !== null) state.nextRecordAt += delta;
    if (engine) Object.keys(engine.states).forEach(function(id) {
      engine.states[id].last = null; engine.states[id].since = null;
    });
    pressureGeneration++; pendingPressure = false;
    if (pressureTimer) clock.clearTimeout(pressureTimer);
    lastNotify = 0;
    if (timeTracker) state.clockRevision = timeTracker.status().revision;
    changed();
  }
  var timeTracker = env.timeFactory ? env.timeFactory({core: core, storage: storage,
    clock: clock, samples: samples, history: timeHistory, adjusted: rebaseTime}) : null;
  function observeTime() {
    if (timeTracker) timeTracker.observe();
  }
  var savedA = core.unpack(storage.read("veranode.al0")), savedB = core.unpack(storage.read("veranode.al1"));
  var alertCheckpoint = savedA && (!savedB || savedA.generation > savedB.generation) ? savedA : savedB;
  var alertGeneration = alertCheckpoint ? alertCheckpoint.generation : 0;
  function changed() { listeners.slice().forEach(function(fn) { fn(state); }); }
  function saveAlerts() {
    var active = [];
    if (engine) Object.keys(engine.states).forEach(function(id) { if (engine.states[id].active) active.push(id); });
    var value = {generation: ++alertGeneration, cursor: events.next - 1, queue: state.queue,
      active: active, revision: state.policy ? state.policy.revision : null,
      scope: state.policy ? state.policy.scope : "unprovisioned"};
    var name = "veranode.al" + alertGeneration % 2;
    try {
      storage.write(name, core.pack(value));
      if (JSON.stringify(core.unpack(storage.read(name))) !== JSON.stringify(value)) throw new Error("Readback");
    } catch (e) { state.storageError = "Stato alert da verificare"; }
  }
  function storeEvent(kind, data) {
    try {
      var row = events.append(kind, clock.now(), {scope: state.policy ? state.policy.scope : "unprovisioned", payload: data});
      if (!row) { state.storageError = "Memoria eventi piena"; changed(); }
      return row;
    } catch (error) { state.storageError = "Errore memoria eventi"; changed(); }
  }
  function onRule(event) {
    var row = storeEvent("alert", event);
    if (event.type === "opened") {
      var alert = {id: row ? row.epoch + ":" + row.seq : "unsaved:" + event.rule + ":" + event.at,
        persisted: !!row, revision: event.revision, rule: event.rule, metric: event.metric,
        value: event.value, severity: event.severity, at: event.at, origin: "local", returned: false};
      alert.presentation = state.policy.rules.filter(function(r) { return r.id === event.rule; })[0].presentation;
      if (state.queue.length < 8) state.queue.push(alert);
      else state.storageError = "Avvisi da recuperare nello storico";
      // Display/sound/light interaction is owned by the active Vera UI.
    }
    if (event.type === "returned") state.queue.forEach(function(a) {
      if (a.rule === event.rule && a.revision === event.revision) a.returned = true;
    });
    saveAlerts();
    changed();
  }
  function notify() {
    if (!state.connected || disposed) return;
    if (lastNotify > clock.now()) lastNotify = clock.now() - 1000;
    var wait = 1000 - (clock.now() - lastNotify);
    if (wait > 0) {
      if (!notifyTimer) notifyTimer = clock.setTimeout(function() { notifyTimer = null; notify(); }, wait);
      return;
    }
    lastNotify = clock.now();
    try { env.publish(core.frames(state.values, clock.now())); }
    catch (e) { state.connected = false; }
  }
  function ingest(field, value, quality) {
    if (disposed || !state.running || state.maintenancePaused) return;
    observeTime();
    state.values[field] = {value: value, at: clock.now(), quality: quality};
    if (engine) engine.evaluate(state.values, clock.now());
    notify(); changed();
  }
  function pressure() {
    if (pendingPressure || disposed) return;
    pendingPressure = true;
    var generation = ++pressureGeneration;
    pressureTimer = clock.setTimeout(function() {
      if (generation !== pressureGeneration) return;
      pressureGeneration++; pendingPressure = false; sensorHealth.temperatureFailures++;
    }, 5000);
    var request;
    try {
      request = env.pressure();
      if (!request || typeof request.then !== "function") throw new Error("Sensore non disponibile");
    } catch (e) { clock.clearTimeout(pressureTimer); pendingPressure = false; sensorHealth.temperatureFailures++; return; }
    request.then(function(value) {
      if (disposed || generation !== pressureGeneration) return;
      clock.clearTimeout(pressureTimer); pendingPressure = false;
      if (value && typeof value.temperature === "number" && isFinite(value.temperature)) {
        sensorHealth.temperatureReads++; ingest("temperatura", value.temperature, 100);
      } else sensorHealth.temperatureFailures++;
    }, function() {
      if (generation === pressureGeneration) { clock.clearTimeout(pressureTimer); pendingPressure = false; sensorHealth.temperatureFailures++; }
    });
  }
  function tick() {
    if (disposed || !state.running || state.maintenancePaused) return;
    observeTime();
    sensorHealth.tickCount++;
    state.lastRecordAt = clock.now(); state.nextRecordAt = state.lastRecordAt + intervalMs;
    pressure();
    var acc;
    try { acc = env.accel(); } catch (e) { acc = null; }
    if (acc && [acc.x, acc.y, acc.z].every(function(v) { return typeof v === "number" && isFinite(v); })) {
      ingest("accelerometro", {x: acc.x, y: acc.y, z: acc.z}, 100);
    }
    state.policyStale = !!state.policy && clock.now() > state.policy.expiresAt;
    if (engine) engine.evaluate(state.values, clock.now());
    var values = {}, now = clock.now();
    Object.keys(state.values).forEach(function(field) {
      var sample = state.values[field];
      if (now >= sample.at && now - sample.at <= 45000) values[field] = sample;
    });
    try {
      if (storage.getFree && storage.getFree() < 8192) { state.paused = true; state.storageError = "Spazio insufficiente"; }
      else {
        var row = samples.append("sample", now, {scope: state.policy ? state.policy.scope : "unprovisioned",
          revision: state.policy ? state.policy.revision : null, values: values});
        state.paused = !row;
        if (!row) state.storageError = "Memoria campioni piena";
        else if (["Memoria campioni piena", "Spazio insufficiente", "Errore memoria campioni"].includes(state.storageError)) state.storageError = null;
      }
    } catch (e) { state.storageError = "Errore memoria campioni"; state.paused = true; }
    changed(); notify();
  }
  function installPolicy(profile, trusted) {
    if (trusted !== true) throw new Error("Profilo Vera non verificato");
    var canonical = core.validatePolicy(profile, state.mac);
    if (state.policy && (canonical.scope !== state.policy.scope || canonical.user !== state.policy.user)) {
      throw new Error("Cambio utente: necessaria procedura di riassegnazione");
    }
    if (state.policy && canonical.revision <= state.policy.revision) throw new Error("Revisione obsoleta");
    if (canonical.expiresAt <= clock.now()) throw new Error("Profilo scaduto");
    storage.write("veranode.policy.json", core.pack(canonical));
    var readback = core.unpack(storage.read("veranode.policy.json"));
    if (!readback || JSON.stringify(readback) !== JSON.stringify(canonical)) throw new Error("Profilo non applicato");
    state.policy = canonical; state.policyStale = false;
    engine = new core.RuleEngine(canonical, onRule);
    storeEvent("policy", {revision: canonical.revision}); saveAlerts(); changed();
    return canonical.revision;
  }
  if (env.progress) env.progress("Profilo", 0, 0);
  var saved = core.unpack(storage.read("veranode.policy.json"));
  if (saved) {
    try {
      state.policy = core.validatePolicy(saved, state.mac);
      state.policyStale = clock.now() > saved.expiresAt;
      engine = new core.RuleEngine(state.policy, onRule);
    } catch (e) { state.storageError = "Profilo da verificare"; }
  }
  // Restore pending interactions independently of phone connection and display.
  // Replay records newer than the state checkpoint to handle a torn state write.
  if (engine) {
    var cursor = 0;
    if (alertCheckpoint && alertCheckpoint.scope === state.policy.scope) {
      state.queue = (alertCheckpoint.queue || []).slice(0, 8);
      (alertCheckpoint.revision === state.policy.revision ? alertCheckpoint.active || [] : []).forEach(function(id) {
        if (state.policy.rules.some(function(r) { return r.id === id; })) engine.states[id] = {active: true, last: null, since: null};
      });
      cursor = alertCheckpoint.cursor;
    }
    var batch;
    while ((batch = events.readBatch(cursor, 16)).length) {
      batch.forEach(function(row) {
        cursor = row.seq;
        if (row.data.scope !== state.policy.scope) return;
        var event = row.data.payload;
        if (row.kind === "alert" && event.revision === state.policy.revision) {
          engine.states[event.rule] = {active: event.type === "opened", last: null, since: null};
          if (event.type === "opened" && state.queue.length < 8) state.queue.push({id: row.epoch + ":" + row.seq,
            rule: event.rule, revision: event.revision, metric: event.metric, value: event.value, severity: event.severity, at: event.at,
            origin: "local", returned: false});
          if (event.type === "opened" && state.queue.length) {
            var rule = state.policy.rules.filter(function(r) { return r.id === event.rule; })[0];
            state.queue[state.queue.length - 1].presentation = rule && rule.presentation;
          }
          if (event.type === "returned") state.queue.forEach(function(a) {
            if (a.rule === event.rule && a.revision === event.revision) a.returned = true;
          });
        }
        if (row.kind === "response") state.queue = state.queue.filter(function(a) { return a.id !== event.alert; });
      });
    }
  }
  function respond(id, action) {
    var alert = state.queue[0];
    if (!alert || alert.id !== id) return false;
    action = action || "dismissed";
    if (action !== "dismissed" && action !== "seen") return false;
    if (!storeEvent("response", {alert: id, action: action, at: clock.now()})) return false;
    state.queue.shift(); saveAlerts(); changed(); return true;
  }
  function onHeart(value) {
    if (state.running && !state.maintenancePaused) sensorHealth.heartEvents++;
    if (value && typeof value.confidence === "number" && value.confidence >= 50 &&
        typeof value.bpm === "number" && isFinite(value.bpm) && value.bpm > 0 && value.bpm <= 65535) ingest("battito", value.bpm, value.confidence);
  }
  function connected() { state.connected = true; lastNotify = 0; notify(); changed(); }
  function disconnected() { state.connected = false; state.peerName = null; changed(); }
  function start() {
    if (state.running || disposed) return;
    if (env.progress) env.progress("Sensori", 0, 0);
    if (timeTracker) { timeTracker.start(); state.clockRevision = timeTracker.status().revision; }
    // A failed hardware start must never leave a successful running flag.
    sensorHealth.startError = null;
    try {
      env.on("HRM", onHeart); env.on("connect", connected); env.on("disconnect", disconnected);
      state.connected = env.connected();
      if (env.hrm(true) === false) throw new Error("Sensore battito non avviato");
      sensorHealth.hrmRequested = true;
      state.running = true;
      timer = clock.setInterval(tick, intervalMs);
      tick(); changed();
      if (env.progress) env.progress("Pronto", 1, 1);
    } catch (e) {
      state.running = false; sensorHealth.hrmRequested = false;
      sensorHealth.startError = String(e).slice(0, 120);
      if (timer !== undefined) clock.clearInterval(timer);
      timer = undefined;
      if (pressureTimer !== undefined) clock.clearTimeout(pressureTimer);
      pressureGeneration++; pendingPressure = false;
      env.off("HRM", onHeart); env.off("connect", connected); env.off("disconnect", disconnected);
      try { env.hrm(false); } catch (_) { /* Keep the original startup error. */ }
      throw e;
    }
  }
  function health() {
    return {schemaVersion: 1, running: state.running, scheduled: timer !== undefined,
      hrmRequested: sensorHealth.hrmRequested, maintenancePaused: state.maintenancePaused === true,
      recordingBlocked: state.paused === true || state.maintenancePaused === true,
      tickCount: sensorHealth.tickCount, heartEvents: sensorHealth.heartEvents,
      temperatureReads: sensorHealth.temperatureReads, temperatureFailures: sensorHealth.temperatureFailures,
      lastRecordAt: state.lastRecordAt, nextRecordAt: state.nextRecordAt,
      startError: sensorHealth.startError};
  }

  // Explicit preparation hold: drain the archive before a fresh offline trial.
  // This neither erases data nor releases the management/UI listeners.
  function pauseRecording(paused) {
    if (disposed) throw new Error("Software non attivo");
    state.maintenancePaused = paused === true;
    var on = !state.maintenancePaused && state.running;
    sensorHealth.hrmRequested = env.hrm(on) !== false && on;
    if (!state.maintenancePaused && state.running) tick();
    changed();
  }
  function dispose() {
    disposed = true; state.running = false; sensorHealth.hrmRequested = false;
    if (timer !== undefined) clock.clearInterval(timer);
    timer = undefined;
    if (notifyTimer) clock.clearTimeout(notifyTimer);
    if (pressureTimer) clock.clearTimeout(pressureTimer);
    env.off("HRM", onHeart); env.off("connect", connected); env.off("disconnect", disconnected);
    env.hrm(false); listeners = [];
  }
  return {state: state, health: health, start: start, dispose: dispose, pauseRecording: pauseRecording, installPolicy: installPolicy, respond: respond,
    samples: samples, events: events, timeHistory: timeHistory, tick: tick,
    readClock: function() { if (!timeTracker) throw new Error("Controllo orario non disponibile"); observeTime(); return timeTracker.status(); },
    syncClock: function(req) { if (!timeTracker) throw new Error("Controllo orario non disponibile"); return timeTracker.sync(req); },
    onChange: function(fn) { listeners.push(fn); return function() { listeners = listeners.filter(function(v) { return v !== fn; }); }; },
    changed: changed};
};
