/* Bounded, paced JSON RPC over a dedicated encrypted BLE characteristic.
 * Physical consent is required once per connection; never stops live sensors.
 */
exports.service = "d4a10000-7b2c-4c61-9e3a-5f42616e676c";
exports.request = "d4a10001-7b2c-4c61-9e3a-5f42616e676c";
exports.response = "d4a10002-7b2c-4c61-9e3a-5f42616e676c";
exports.create = function(env) {
  var dropping = false, buffer = "", owner = null, pending = null, replies = [], timer, consentTimer, closed = false;
  var replyOptions = {};
  var diagnostics = env.node.state.management = {bytes: 0, frames: 0, parseErrors: 0, invalidIds: 0, requests: 0, authorizations: 0, decisions: 0, responses: 0, lastOp: null, lastError: null};
  function ascii(value) {
    return JSON.stringify(value).replace(/[^\x20-\x7e]/g, function(c) {
      return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
    }) + "\n";
  }
  function pump() {
    timer = undefined;
    if (closed || !replies.length) return;
    var size = env.chunkSize ? env.chunkSize() : 20;
    if (typeof size !== "number" || !isFinite(size) || size < 20) size = 20;
    size = Math.min(180, Math.floor(size));
    if (replies[0].safeTransport) size = 20;
    var item = replies[0], part = item.text.slice(item.at, item.at + size);
    try { env.send(part); } catch (e) { reset(); return; }
    item.at += part.length;
    if (item.at >= item.text.length) replies.shift();
    if (replies.length) timer = env.clock.setTimeout(pump, 25);
  }
  function answer(id, result, error) {
    diagnostics.responses++; diagnostics.lastError = error || null;
    var options = replyOptions["$" + id] || {}; delete replyOptions["$" + id];
    if (replies.length >= 4) return;
    var text = ascii(error ? {id: id, ok: false, error: error} : {id: id, ok: true, result: result});
    if (text.length > 8183) text = ascii({id: id, ok: false, error: "Risposta troppo grande"});
    if (options.integrity) {
      text = text.slice(0, -1);
      var hash = 0x811c9dc5;
      for (var i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        hash = hash >>> 0;
      }
      text += "#" + ("00000000" + hash.toString(16)).slice(-8) + "\n";
    }
    replies.push({text: text, at: 0, safeTransport: options.safeTransport === true});
    if (!timer) pump();
  }
  function clearConsent() {
    if (consentTimer) env.clock.clearTimeout(consentTimer);
    consentTimer = undefined; pending = null; env.consent(null);
  }
  function decide(approved) {
    if (!pending) return false;
    diagnostics.decisions++;
    var req = pending;
    if (approved && env.encrypted()) owner = {user: req.user, scope: req.scope};
    env.node.state.peerName = owner && typeof req.peerName === "string" ? req.peerName : null;
    if (env.node.changed) env.node.changed();
    clearConsent(); answer(req.id, {authorized: !!owner}, owner ? null : "Collegamento non autorizzato");
    return true;
  }
  function handle(req) {
    // Espruino does not implement bounded regex repetitions such as {1,40}.
    if (!req || typeof req.id !== "string" || req.id.length < 1 || req.id.length > 40 || !/^[a-z0-9_-]+$/i.test(req.id)) { diagnostics.invalidIds++; return; }
    replyOptions["$" + req.id] = {integrity: req.integrity === true, safeTransport: req.safeTransport === true};
    diagnostics.requests++; diagnostics.lastOp = req.op;
    if (req.op === "authorize") diagnostics.authorizations++;
    if (!env.encrypted()) { answer(req.id, null, "Collegamento cifrato richiesto"); return; }
    if (req.op === "authorize") {
      if (pending) { answer(req.id, null, "Conferma gia in corso"); return; }
      if (typeof req.user !== "string" || req.user.length !== 36 || !/^[0-9a-f-]+$/i.test(req.user) ||
          typeof req.scope !== "string" || !req.scope || req.scope.length > 120 || req.mac !== env.mac) {
        answer(req.id, null, "Contesto non valido"); return;
      }
      if (req.peerName !== undefined && (typeof req.peerName !== "string" ||
          !req.peerName.trim() || req.peerName.length > 32 || /[\x00-\x1f\x7f]/.test(req.peerName))) {
        answer(req.id, null, "Nome dispositivo non valido"); return;
      }
      var policy = env.node.state.policy;
      if (policy && (policy.user !== req.user || policy.scope !== req.scope)) {
        answer(req.id, null, "Device assegnato a un altro contesto"); return;
      }
      owner = null; env.node.state.peerName = null; pending = req;
      env.consent({id: req.id, user: req.user, scope: req.scope, decide: decide});
      consentTimer = env.clock.setTimeout(function() { decide(false); }, 60000);
      return;
    }
    if (req.op === "revoke") { owner = null; clearConsent(); answer(req.id, {revoked: true}); return; }
    if (!owner) { answer(req.id, null, "Conferma sul Bangle richiesta"); return; }
    try {
      var node = env.node, state = node.state;
      if (req.op === "status") {
        var snapshot = {version: "0.2.0", mac: env.mac, revision: state.policy ? state.policy.revision : null,
          sampleEpoch: node.samples.checkpoint.epoch, sampleHigh: node.samples.next - 1,
          sampleAck: node.samples.checkpoint.ack, eventEpoch: node.events.checkpoint.epoch,
          eventHigh: node.events.next - 1, eventAck: node.events.checkpoint.ack,
          live: state.running, capabilities: {light: true, sound: true, soundWeak: true, vibration: true, touch: true, clockTracking: !!node.timeHistory}};
        if (node.timeHistory) {
          // Observe first, then freeze journal counters for this snapshot.
          snapshot.clock = node.readClock();
          snapshot.timeEpoch = node.timeHistory.checkpoint.epoch;
          snapshot.timeHigh = node.timeHistory.next - 1; snapshot.timeAck = node.timeHistory.checkpoint.ack;
        }
        snapshot.buffers = {samples: node.samples.stats(), events: node.events.stats()};
        if (node.timeHistory) snapshot.buffers.clock = node.timeHistory.stats();
        snapshot.transfer = {chunkBytes: env.chunkSize ? env.chunkSize() : 20, batchRecords: 4, integrity: "fnv1a32"};
        snapshot.recordIntervalMs = state.recordIntervalMs;
        snapshot.recordingBlocked = state.paused === true || state.maintenancePaused === true;
        snapshot.preparationPaused = state.maintenancePaused === true;
        snapshot.storageError = state.storageError;
        if (node.health) snapshot.acquisitionHealth = node.health();
        snapshot.contextConfigured = !!state.policy;
        if (env.describe) {
          try { snapshot.hardware = env.describe(); }
          catch (_) { snapshot.hardwareError = true; }
        }
        answer(req.id, snapshot);
      } else if (req.op === "clock") {
        answer(req.id, node.readClock());
      } else if (req.op === "clock_sync") {
        answer(req.id, node.syncClock(req));
      } else if (req.op === "profile") {
        if (!req.profile || req.profile.user !== owner.user || req.profile.scope !== owner.scope) throw new Error("Profilo fuori contesto");
        var revision = node.installPolicy(req.profile, true);
        answer(req.id, {appliedRevision: revision});
      } else if (req.op === "batch" || req.op === "ack") {
        if (!["samples", "events", "clock"].includes(req.stream)) throw new Error("Archivio non valido");
        var journal = req.stream === "samples" ? node.samples : req.stream === "events" ? node.events : node.timeHistory;
        if (!journal) throw new Error("Archivio non disponibile");
        if (req.epoch !== journal.checkpoint.epoch) throw new Error("Archivio cambiato");
        if (req.op === "batch") answer(req.id, {rows: journal.readBatch(req.after, 4)});
        else {
          if (req.custody !== true) throw new Error("Custodia non confermata");
          journal.ack(req.epoch, req.sequence); answer(req.id, {acknowledged: journal.checkpoint.ack});
        }
      } else throw new Error("Operazione non supportata");
    } catch (e) { answer(req.id, null, e.message || "Operazione fallita"); }
  }
  function receive(bytes) {
    if (closed) return;
    diagnostics.bytes += bytes.length;
    for (var i = 0; i < bytes.length; i++) {
      if (dropping) { if (bytes[i] === 10) dropping = false; continue; }
      if (bytes[i] > 127 || bytes[i] < 0) { buffer = ""; dropping = true; continue; }
      if (bytes[i] === 10) {
        var line = buffer; buffer = ""; diagnostics.frames++;
        var req;
        try { req = JSON.parse(line); } catch (e) { diagnostics.parseErrors++; continue; }
        try { handle(req); } catch (e) {
          // Never leak request data or confuse runtime failures with malformed JSON.
          diagnostics.lastError = "Errore interno gestione";
          owner = null;
          try { clearConsent(); } catch (_) { /* UI failure must still revoke authorization. */ }
          if (req && typeof req.id === "string" && req.id.length <= 40 && /^[a-z0-9_-]+$/i.test(req.id)) {
            answer(req.id, null, "Errore interno gestione");
          }
        }
      } else {
        buffer += String.fromCharCode(bytes[i]);
        if (buffer.length > 8192) { buffer = ""; dropping = true; }
      }
    }
  }
  function reset() {
    replyOptions = {}; owner = null; env.node.state.peerName = null; buffer = ""; dropping = false; replies = [];
    if (timer) env.clock.clearTimeout(timer); timer = undefined;
    clearConsent();
  }
  return {receive: receive, reset: reset, decide: decide,
    dispose: function() { reset(); closed = true; }};
};
