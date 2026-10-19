/* Clock provenance is a sidecar journal. Sensor records are never rewritten. */
exports.create = function(env) {
  var history = env.history, samples = env.samples, clock = env.clock;
  var boot = history.checkpoint.epoch + "." + history.next.toString(36);
  var revision = history.next - 1, tracked = false, quality = "unverified";
  var lastObserved = clock.now(), reference = null, started = false;
  var lastSync = env.core.unpack(env.storage.read("veranode.time.json")) || null;
  function available() {
    return history.stats().available;
  }
  function record(type, details) {
    var data = {v: 1, type: type, boot: boot, sampleEpoch: samples.checkpoint.epoch,
      fromSequence: samples.next};
    Object.keys(details || {}).forEach(function(k) { data[k] = details[k]; });
    var row = history.append("clock", clock.now(), data);
    if (!row) throw new Error("Storico orario pieno: recupera prima i dati");
    revision = row.seq; tracked = true;
    return row;
  }
  function status() {
    var now = clock.now(), current = quality;
    if (current === "phone_auto" && reference &&
        (now < reference.utcMs - reference.uncertaintyMs || now > reference.validUntil)) current = "stale";
    return {epoch: history.checkpoint.epoch, revision: revision, boot: boot,
      quality: tracked ? current : "untracked", tracked: tracked, nowMs: now,
      lastSyncUtc: lastSync ? lastSync.utcMs : null,
      lastSyncId: lastSync ? lastSync.syncId : null,
      uncertaintyMs: reference ? reference.uncertaintyMs : null,
      validUntil: reference ? reference.validUntil : null,
      fromSequence: reference ? reference.fromSequence : null};
  }
  function start() {
    if (started) return;
    started = true;
    try { record("boot", {beforeMs: clock.now(), source: "device_boot"}); }
    catch (e) { tracked = false; }
    lastObserved = clock.now();
  }
  function observe() {
    var now = clock.now(), delta = now - lastObserved;
    lastObserved = now;
    // A large forward gap may also mean delayed execution: never invent a cause.
    if (delta >= -2000 && delta <= 300000) return false;
    quality = "discontinuous"; reference = null;
    try { record("discontinuity", {beforeMs: now - delta, afterMs: now,
      deltaMs: delta, source: "jump_or_execution_gap"}); }
    catch (e) { tracked = false; }
    if (env.adjusted) env.adjusted(delta);
    return true;
  }
  function sync(req) {
    if (!req || typeof req.utcMs !== "number" || !isFinite(req.utcMs) ||
        req.utcMs < 1577836800000 || req.utcMs > 4102444800000 ||
        typeof req.syncId !== "string" || req.syncId.length !== 36 || !/^[a-z0-9-]+$/i.test(req.syncId) ||
        req.source !== "phone_auto" || typeof req.uncertaintyMs !== "number" || !isFinite(req.uncertaintyMs) ||
        req.uncertaintyMs < 1000 || req.uncertaintyMs > 5000 ||
        typeof req.timezoneMinutes !== "number" || !isFinite(req.timezoneMinutes) ||
        Math.floor(req.timezoneMinutes) !== req.timezoneMinutes || Math.abs(req.timezoneMinutes) > 840) {
      throw new Error("Riferimento orario non valido");
    }
    if (lastSync && req.syncId === lastSync.syncId) {
      if (req.utcMs !== lastSync.utcMs || req.timezoneMinutes !== lastSync.timezoneMinutes) throw new Error("Sincronizzazione in conflitto");
      return status();
    }
    if (req.epoch !== history.checkpoint.epoch || req.revision !== revision || req.boot !== boot) {
      throw new Error("Stato orario cambiato: ripeti il controllo");
    }
    if (typeof clock.setWall !== "function") throw new Error("Sincronizzazione non disponibile");
    if (available() < 2) throw new Error("Storico orario pieno: recupera prima i dati");
    var before = clock.now(), boundary = samples.next;
    // Intent must be durable before changing the clock. A torn operation stays uncertain.
    record("sync_intent", {beforeMs: before, utcMs: req.utcMs, syncId: req.syncId, source: req.source});
    quality = "unverified"; reference = null;
    try {
      clock.setWall(req.utcMs, req.timezoneMinutes);
      var after = clock.now();
      if (Math.abs(after - req.utcMs) > req.uncertaintyMs) throw new Error("Orologio non confermato");
      record("sync_applied", {beforeMs: before, afterMs: after, deltaMs: after - before,
        utcMs: req.utcMs, uncertaintyMs: req.uncertaintyMs, validUntil: req.utcMs + 86400000,
        timezoneMinutes: req.timezoneMinutes, source: req.source, syncId: req.syncId});
      reference = {utcMs: after, uncertaintyMs: req.uncertaintyMs, validUntil: after + 86400000,
        fromSequence: boundary};
      quality = "phone_auto";
      lastSync = {utcMs: req.utcMs, timezoneMinutes: req.timezoneMinutes, syncId: req.syncId};
      // Optional summary only; the CRC journal remains the audit source of truth.
      try { env.storage.write("veranode.time.json", env.core.pack(lastSync)); } catch (_) { /* Recoverable from history. */ }
    } finally {
      lastObserved = clock.now();
      if (env.adjusted) env.adjusted(clock.now() - before);
    }
    return status();
  }
  return {start: start, observe: observe, status: status, sync: sync};
};
