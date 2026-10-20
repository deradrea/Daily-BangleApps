/* Vera Node 0.1.0 - pure state machines, no phone or display dependency. */
function finite(v) { return typeof v === "number" && isFinite(v); }
// Same CRC16 and journal format; one lookup per character instead of 8 bit loops.
var crcTable = new Uint16Array([0,49345,49537,320,49921,960,640,49729,50689,1728,1920,51009,1280,50625,50305,1088,52225,3264,3456,52545,3840,53185,52865,3648,2560,51905,52097,2880,51457,2496,2176,51265,55297,6336,6528,55617,6912,56257,55937,6720,7680,57025,57217,8000,56577,7616,7296,56385,5120,54465,54657,5440,55041,6080,5760,54849,53761,4800,4992,54081,4352,53697,53377,4160,61441,12480,12672,61761,13056,62401,62081,12864,13824,63169,63361,14144,62721,13760,13440,62529,15360,64705,64897,15680,65281,16320,16000,65089,64001,15040,15232,64321,14592,63937,63617,14400,10240,59585,59777,10560,60161,11200,10880,59969,60929,11968,12160,61249,11520,60865,60545,11328,58369,9408,9600,58689,9984,59329,59009,9792,8704,58049,58241,9024,57601,8640,8320,57409,40961,24768,24960,41281,25344,41921,41601,25152,26112,42689,42881,26432,42241,26048,25728,42049,27648,44225,44417,27968,44801,28608,28288,44609,43521,27328,27520,43841,26880,43457,43137,26688,30720,47297,47489,31040,47873,31680,31360,47681,48641,32448,32640,48961,32000,48577,48257,31808,46081,29888,30080,46401,30464,47041,46721,30272,29184,45761,45953,29504,45313,29120,28800,45121,20480,37057,37249,20800,37633,21440,21120,37441,38401,22208,22400,38721,21760,38337,38017,21568,39937,23744,23936,40257,24320,40897,40577,24128,23040,39617,39809,23360,39169,22976,22656,38977,34817,18624,18816,35137,19200,35777,35457,19008,19968,36545,36737,20288,36097,19904,19584,35905,17408,33985,34177,17728,34561,18368,18048,34369,33281,17088,17280,33601,16640,33217,32897,16448]);
function checksum(text) {
  "ram";
  var crc = 0xFFFF;
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    crc = (crc >>> 8) ^ crcTable[(crc ^ code) & 255] ^ (code >>> 8);
  }
  return crc;
}
function pack(value) {
  "ram";
  var body = JSON.stringify(value);
  return JSON.stringify({body: body, crc: checksum(body)});
}
function unpack(text) {
  "ram";
  try {
    var row = JSON.parse(text);
    if (typeof row.body !== "string" || checksum(row.body) !== row.crc) return;
    return JSON.parse(row.body);
  } catch (e) { return; }
}

/* Append-only StorageFile segments. ACK checkpoints alternate and are read back.
 * No deletion until custody has been explicitly confirmed by a trusted gateway.
 * This prototype exposes readBatch/ack through JS, not an unauthenticated BLE write.
 */
function Journal(storage, prefix, options) {
  "ram";
  options = options || {};
  this.storage = storage;
  this.prefix = prefix;
  this.maxSegments = options.maxSegments || 8;
  this.segmentRecords = options.segmentRecords || 32;
  this.maxLine = options.maxLine || 1800;
  this.segmentHash = options.segmentHash;
  this.segments = [];
  // One volatile reader only: no extra flash writes or retained record batches.
  this.reader = null;
  this.full = false;
  var a = unpack(storage.read(prefix + "ack0"));
  var b = unpack(storage.read(prefix + "ack1"));
  this.checkpoint = a && (!b || a.generation > b.generation) ? a : b;
  if (!this.checkpoint) {
    this.checkpoint = {generation: 0, ack: 0,
      epoch: Date.now().toString(36) + Math.floor(Math.random() * 65536).toString(36)};
    this.saveCheckpoint(this.checkpoint);
  }
  var discarded=this.checkpoint.discardedThrough===undefined ? 0 : this.checkpoint.discardedThrough;
  if(!finite(discarded) || discarded<0 || discarded>2147483647 || Math.floor(discarded)!==discarded)throw new Error("Tombstone non valido");
  var administrative=this.checkpoint.adminCounter===undefined ? 0 : this.checkpoint.adminCounter;
  if(!finite(administrative) || administrative<0 || administrative>2147483647 || Math.floor(administrative)!==administrative)
    throw new Error("Contatore amministrativo non valido");
  var eraseA=unpack(storage.read(prefix+"erase0")),eraseB=unpack(storage.read(prefix+"erase1"));
  var eraseLast=eraseA && (!eraseB || eraseA.generation>eraseB.generation) ? eraseA : eraseB;
  this.eraseLock=!!this.checkpoint.eraseOperation || !!(eraseLast && eraseLast.phase==="intent");
  this.next = Math.max(this.checkpoint.ack,discarded) + 1;
  var files = options.files || storage.list(undefined, {sf: true});
  // A slower cadence must not hide segments created with a larger quota.
  // Discover existing numeric StorageFiles before choosing the scan bound.
  var self = this, present = {};
  files.forEach(function(name) {
    if (name.slice(-1) === "\x01") name = name.slice(0, -1);
    if (name.slice(0, prefix.length) !== prefix) return;
    var suffix = name.slice(prefix.length);
    if (!/^[0-9]+$/.test(suffix)) return;
    var index = Number(suffix);
    if (index >= 512) throw new Error("Archivio oltre il limite supportato");
    self.maxSegments = Math.max(self.maxSegments, index + 1);
    if (String(index) === suffix) present[index] = true;
  });
  var existing = [], recovered = 0;
  for (var slot = 0; slot < this.maxSegments; slot++) {
    if (present[slot]) existing.push(slot);
  }
  function progress() { if (options.progress) options.progress(recovered, existing.length); }
  progress();
  for (var entry = 0; entry < existing.length; entry++) {
    var i = existing[entry];
    var name = prefix + i;
    var cached = unpack(storage.read(name + "idx")), fingerprint;
    if (this.segmentHash && cached && cached.epoch === this.checkpoint.epoch &&
      cached.count === this.segmentRecords && finite(cached.last) && cached.last >= cached.count) {
      try { fingerprint = this.segmentHash(name); } catch (e) { fingerprint = null; }
      if (fingerprint && fingerprint.hash === cached.hash && fingerprint.bytes === cached.bytes) {
        this.segments.push({name: name, count: cached.count, last: cached.last, sealed: true});
        this.next = Math.max(this.next, cached.last + 1);
        recovered++; progress();
        continue;
      }
    }
    var file = storage.open(name, "r"), line, segment = {name: name, count: 0, last: 0, sealed: false};
    while ((line = file.readLine()) !== undefined) {
      var row = unpack(line);
      if (!row || !finite(row.seq) || row.seq < 1) { segment.sealed = true; continue; }
      segment.count++;
      segment.last = Math.max(segment.last, row.seq);
      this.next = Math.max(this.next, row.seq + 1);
    }
    if (segment.count >= this.segmentRecords) segment.sealed = true;
    this.segments.push(segment);
    this.cacheSegment(segment);
    recovered++; progress();
  }
  this.segments.sort(function(x, y) { return x.last - y.last; });
}
Journal.prototype.cacheSegment = function(segment) {
  if (!this.segmentHash || segment.count !== this.segmentRecords) return;
  try {
    var fingerprint = this.segmentHash(segment.name);
    if (!fingerprint) return;
    this.storage.write(segment.name + "idx", pack({epoch: this.checkpoint.epoch,
      count: segment.count, last: segment.last, hash: fingerprint.hash, bytes: fingerprint.bytes}));
  } catch (e) { /* Cache is optional; raw records remain the source of truth. */ }
};
Journal.prototype.saveCheckpoint = function(value) {
  var name = this.prefix + (value.generation % 2 ? "ack1" : "ack0");
  this.storage.write(name, pack(value));
  var readback = unpack(this.storage.read(name));
  if (!readback || JSON.stringify(readback) !== JSON.stringify(value)) throw new Error("Checkpoint non confermato");
};
Journal.prototype.append = function(kind, at, payload) {
  if(this.eraseLock)throw new Error("Archivio in manutenzione amministrativa");
  var row = {v: 1, epoch: this.checkpoint.epoch, seq: this.next, kind: kind, at: at, data: payload};
  var encoded = pack(row);
  if (encoded.length > this.maxLine) throw new Error("Record troppo grande");
  var segment = this.segments[this.segments.length - 1];
  if (!segment || segment.sealed) {
    if (this.segments.length >= this.maxSegments) { this.full = true; return; }
    var names = this.segments.map(function(s) { return s.name; });
    var index = 0;
    while (names.includes(this.prefix + index)) index++;
    segment = {name: this.prefix + index, count: 0, last: 0, sealed: false};
    this.segments.push(segment);
  }
  // A torn final line seals the segment on reboot, preserving prior records.
  if (this.reader && this.reader.segment === segment) this.reader = null;
  try { this.storage.open(segment.name, "a").write(encoded + "\n"); }
  catch (e) { segment.sealed = true; throw e; }
  segment.count++;
  segment.last = this.next++;
  segment.sealed = segment.count >= this.segmentRecords;
  if (segment.sealed) this.cacheSegment(segment);
  this.full = false;
  return row;
};
Journal.prototype.readBatch = function(after, limit) {
  if(this.eraseLock)throw new Error("Archivio in manutenzione amministrativa");
  if (!finite(after) || after < 0 || Math.floor(after) !== after) throw new Error("Cursore non valido");
  limit = Math.min(16, Math.max(1, limit || 8));
  var rows = [], self = this, cursor = Math.max(after, this.checkpoint.ack, this.checkpoint.discardedThrough || 0);
  try {
    this.segments.forEach(function(segment) {
      if (rows.length >= limit || segment.last <= cursor) return;
      var reader = self.reader;
      if (!reader || reader.segment !== segment || cursor < reader.after ||
          reader.count !== segment.count || reader.last !== segment.last) {
        reader = self.reader = {segment: segment, file: self.storage.open(segment.name, "r"),
          after: -1, count: segment.count, last: segment.last};
      }
      var line;
      while (rows.length < limit && (line = reader.file.readLine()) !== undefined) {
        var row = unpack(line); // CRC remains mandatory for every returned row.
        if (row && finite(row.seq)) {
          reader.after = row.seq;
          if (row.seq > cursor) rows.push(row);
        }
      }
    });
  } catch (e) { this.reader = null; throw e; }
  return rows;
};
Journal.prototype.ack = function(epoch, sequence) {
  if(this.eraseLock)throw new Error("Archivio in manutenzione amministrativa");
  if (epoch !== this.checkpoint.epoch || !finite(sequence) || Math.floor(sequence) !== sequence ||
      sequence < this.checkpoint.ack || sequence >= this.next) throw new Error("ACK non valido");
  // Retransmitted custody ACKs are idempotent: do not wear flash again.
  // Still prune below: a previous erase may have failed after durable custody.
  if (sequence > this.checkpoint.ack) {
    var next = {generation: this.checkpoint.generation + 1, ack: sequence, epoch: epoch};
    if(this.checkpoint.discardedThrough!==undefined)next.discardedThrough=this.checkpoint.discardedThrough;
    if(this.checkpoint.adminCounter!==undefined)next.adminCounter=this.checkpoint.adminCounter;
    this.saveCheckpoint(next);
    this.checkpoint = next;
  }
  var storage = this.storage, self = this;
  this.segments = this.segments.filter(function(segment) {
    if (segment.sealed && segment.last > 0 && segment.last <= sequence) {
      if (self.reader && self.reader.segment === segment) self.reader = null;
      // StorageFile.erase, not Storage.erase: Espruino stores file chunks separately.
      storage.open(segment.name, "r").erase();
      return false;
    }
    return true;
  });
  this.full = this.segments.length >= this.maxSegments && this.segments[this.segments.length - 1].sealed;
};
Journal.prototype.pending = function() { return this.next - 1 - Math.max(this.checkpoint.ack,this.checkpoint.discardedThrough || 0); };
// Actual append capacity includes retained partial segments and sealed tails.
// This snapshot has no flash writes and does not scan stored record contents.
Journal.prototype.stats = function() {
  var last = this.segments[this.segments.length - 1], stored = 0;
  this.segments.forEach(function(segment) { stored += segment.count; });
  var available = (this.maxSegments - this.segments.length) * this.segmentRecords +
    (last && !last.sealed ? this.segmentRecords - last.count : 0);
  return {capacity: this.maxSegments * this.segmentRecords, stored: stored,
    pending: this.pending(), available: available, full: available === 0};
};

// Keep validation compatible with Espruino's subset of regular expressions.
function validUserUuid(value) {
  if (typeof value !== "string" || value.length !== 36 || !/^[0-9a-f-]+$/i.test(value)) return false;
  var parts = value.split("-");
  return parts.length === 5 && parts[0].length === 8 && parts[1].length === 4 &&
    parts[2].length === 4 && parts[2][0] === "4" && parts[3].length === 4 &&
    /^[89ab]/i.test(parts[3]) && parts[4].length === 12;
}
function validatePolicy(policy, mac) {
  if (!policy || policy.v !== 1 || !finite(policy.revision) || Math.floor(policy.revision) !== policy.revision || policy.revision < 1 ||
      !validUserUuid(policy.user) ||
      typeof policy.scope !== "string" || !policy.scope || policy.scope.length > 120 ||
      policy.mac !== mac || !finite(policy.expiresAt) || !Array.isArray(policy.rules) || policy.rules.length > 8) {
    throw new Error("Profilo non valido");
  }
  var ids = [];
  policy.rules.forEach(function(rule) {
    if (!rule || typeof rule.id !== "string" || rule.id.length < 1 || rule.id.length > 32 || !/^[a-z0-9_-]+$/i.test(rule.id) ||
        Object.prototype.hasOwnProperty.call(Object.prototype, rule.id) || ids.includes(rule.id) ||
        !["battito", "temperatura"].includes(rule.metric) || !["high", "low"].includes(rule.direction) ||
        !finite(rule.enter) || !finite(rule.exit) || !finite(rule.durationMs) || rule.durationMs < 0 || rule.durationMs > 3600000 ||
        !finite(rule.maxAgeMs) || rule.maxAgeMs < 1000 || rule.maxAgeMs > 300000 ||
        !finite(rule.maxGapMs) || rule.maxGapMs < 1000 || rule.maxGapMs > rule.maxAgeMs ||
        (rule.direction === "high" ? rule.exit > rule.enter : rule.exit < rule.enter) ||
        !["warning", "critical"].includes(rule.severity) ||
        (rule.metric === "temperatura" && rule.source !== "barometer")) throw new Error("Regola non supportata");
    if (rule.edit) {
      if (!finite(rule.edit.min) || !finite(rule.edit.max) || rule.edit.min > rule.edit.max ||
          !finite(rule.edit.until) || rule.enter < rule.edit.min || rule.enter > rule.edit.max) throw new Error("Delega non valida");
    }
    rule.presentation = validatePresentation(rule.presentation);
    ids.push(rule.id);
  });
  return JSON.parse(JSON.stringify(policy));
}

function validatePresentation(value) {
  value = value || {mode: "message", light: false, sound: false, vibration: true,
    dismiss: "either", repeats: 1, pulseMs: 150};
  if (!["signal", "message", "question"].includes(value.mode) ||
      !["touch", "button", "either"].includes(value.dismiss) ||
      ["light", "sound", "vibration"].some(function(key) { return typeof value[key] !== "boolean"; }) ||
      !finite(value.repeats) || Math.floor(value.repeats) !== value.repeats || value.repeats < 1 || value.repeats > 3 ||
      !finite(value.pulseMs) || value.pulseMs < 50 || value.pulseMs > 500 ||
      (value.mode === "question" && (typeof value.question !== "string" || !value.question.trim() || value.question.length > 80))) {
    throw new Error("Schema di interazione non valido");
  }
  return JSON.parse(JSON.stringify(value));
}

/* One-button questions require selection AND deliberate long-press confirmation.
 * Touch maps to explicit choices. Timeout/dismissal never fabricates an answer.
 */
function Interaction(presentation, respond) {
  this.presentation = validatePresentation(presentation);
  this.respond = respond; this.selected = null; this.complete = false;
}
Interaction.prototype.button = function(duration) {
  if (this.complete || this.presentation.dismiss === "touch") return false;
  if (this.presentation.mode !== "question") return this.submit(this.presentation.mode === "signal" ? "dismissed" : "seen");
  if (duration >= 800) return this.selected === null ? false : this.submit(this.selected);
  this.selected = this.selected === "yes" ? "no" : "yes"; return false;
};
Interaction.prototype.touch = function(choice) {
  if (this.complete || this.presentation.dismiss === "button") return false;
  if (this.presentation.mode === "question") {
    if (!["yes", "no"].includes(choice)) return false;
    return this.submit(choice);
  }
  return this.submit(this.presentation.mode === "signal" ? "dismissed" : "seen");
};
Interaction.prototype.submit = function(choice) {
  if (this.respond(choice) !== true) return false;
  this.complete = true; return true;
};
function Cues(clock, hardware) { this.clock = clock; this.hardware = hardware; this.timers = []; }
Cues.prototype.stop = function() {
  var self = this;
  this.timers.forEach(function(id) { self.clock.clearTimeout(id); }); this.timers = [];
  this.hardware.light(false);
  if (this.hardware.stop) this.hardware.stop();
};
Cues.prototype.start = function(value) {
  this.stop(); var p = validatePresentation(value), self = this;
  function pulse() {
    if (p.light) {
      self.hardware.light(true);
      self.timers.push(self.clock.setTimeout(function() { self.hardware.light(false); }, p.pulseMs));
    }
    if (p.sound && self.hardware.sound) self.hardware.sound(p.pulseMs);
    if (p.vibration && self.hardware.vibrate) self.hardware.vibrate(p.pulseMs);
  }
  pulse();
  for (var i = 1; i < p.repeats; i++) this.timers.push(this.clock.setTimeout(pulse, i * (p.pulseMs + 500)));
};

function RuleEngine(policy, emit) { this.policy = policy; this.emit = emit; this.states = {}; }
RuleEngine.prototype.evaluate = function(values, now) {
  var self = this;
  this.policy.rules.forEach(function(rule) {
    var state = self.states[rule.id] || (self.states[rule.id] = {since: null, last: null, active: false});
    var sample = values[rule.metric];
    var valid = sample && finite(sample.value) && finite(sample.at) && now >= sample.at &&
      now - sample.at <= rule.maxAgeMs && sample.quality >= (rule.qualityMin || 0);
    if (!valid) { state.since = null; state.last = null; return; }
    // Re-evaluating one cached sample is not evidence of a sustained condition.
    if (state.last !== null && sample.at <= state.last) return;
    if (state.last !== null && sample.at - state.last > rule.maxGapMs) state.since = null;
    state.last = sample.at;
    var outside = rule.direction === "high" ? sample.value >= rule.enter : sample.value <= rule.enter;
    var returned = rule.direction === "high" ? sample.value <= rule.exit : sample.value >= rule.exit;
    if (!state.active && outside) {
      if (state.since === null) state.since = sample.at;
      if (sample.at - state.since >= rule.durationMs) {
        state.active = true;
        self.emit({rule: rule.id, revision: self.policy.revision, type: "opened", severity: rule.severity,
          metric: rule.metric, value: sample.value, at: sample.at, policyStale: now > self.policy.expiresAt});
      }
    } else if (!state.active) state.since = null;
    else if (returned) {
      state.active = false; state.since = null;
      self.emit({rule: rule.id, revision: self.policy.revision, type: "returned", metric: rule.metric,
        value: sample.value, at: sample.at});
    }
  });
};

function DisplayState(clock, render, power, options) {
  this.clock = clock; this.render = render; this.power = power;
  this.timeout = options && options.timeout || 10000;
  this.doubleMs = options && options.doubleMs || 400;
  this.doubleOnMs = options && options.doubleOnMs || this.doubleMs;
  this.mode = "off"; this.timer = null; this.click = null; this.lastPress = null;
  this.alert = null; this.returnMode = "off"; this.quietUntil = 0;
  power(false);
}
DisplayState.prototype.cancelTimeout = function() {
  if (this.timer !== null) this.clock.clearTimeout(this.timer);
  this.timer = null;
};
DisplayState.prototype.show = function(mode) {
  var wasOn = this.mode !== "off";
  this.cancelTimeout(); this.mode = mode;
  if (wasOn !== (mode !== "off")) this.power(mode !== "off");
  if (mode !== "off") this.render(this);
  var self = this;
  if (mode === "temporary" || mode === "alert") {
    this.timer = this.clock.setTimeout(function() {
      self.show(self.alert && self.returnMode === "pinned" ? "pinned" : "off");
    }, mode === "alert" ? Math.max(20000, this.timeout) : this.timeout);
  }
};
DisplayState.prototype.press = function() {
  var self = this, now = this.clock.now();
  var doubleWindow = this.mode === "off" ? this.doubleMs : this.doubleOnMs;
  // A recognised gesture consumes the entire burst, until a quiet interval.
  if (now < this.quietUntil) { this.quietUntil = now + doubleWindow; return; }
  if (this.mode === "pinned") {
    if (this.alert) this.returnMode = "off";
    this.lastPress = null; this.quietUntil = now + doubleWindow; this.show("off"); return;
  }
  if (this.lastPress !== null && now - this.lastPress <= doubleWindow) {
    this.clock.clearTimeout(this.click); this.click = null; this.lastPress = null;
    this.quietUntil = now + doubleWindow;
    if (this.mode === "off") return; // Double press while off is deliberately inert.
    if (this.alert) this.returnMode = "pinned";
    this.show("pinned"); return;
  }
  var wasOff = this.mode === "off";
  this.lastPress = now;
  if (!wasOff) this.show(this.alert ? "alert" : "temporary");
  this.click = this.clock.setTimeout(function() {
    self.lastPress = null; self.click = null;
    if (wasOff && self.mode === "off") self.show(self.alert ? "alert" : "temporary");
  }, doubleWindow);
};
DisplayState.prototype.presentAlert = function(alert) {
  if (this.alert) return false; // Keep current response target; queue owned by runtime.
  if (this.click !== null) this.clock.clearTimeout(this.click);
  this.click = null; this.lastPress = null;
  this.returnMode = this.mode === "pinned" ? "pinned" : "off";
  this.alert = alert; this.show("alert"); return true;
};
DisplayState.prototype.closeAlert = function() {
  this.alert = null; this.show(this.returnMode);
};
DisplayState.prototype.dispose = function() {
  this.cancelTimeout();
  if (this.click !== null) this.clock.clearTimeout(this.click);
  this.power(false);
};

function signed16(value) {
  if (!finite(value) || value < -32768 || value > 32767) throw new Error("Valore fuori formato BLE");
  value = Math.round(value);
  return [value & 255, (value >> 8) & 255];
}
function vector(value, scale) {
  return signed16(value.x * scale).concat(signed16(value.y * scale), signed16(value.z * scale));
}
function frames(values, now) {
  function current(field) {
    var value = values[field];
    return value && now >= value.at && now - value.at <= 45000 ? value.value : null;
  }
  var bpm = current("battito"), temp = current("temperatura"), accel = current("accelerometro"), mag = current("magnetometro");
  var result = {"2a37": bpm !== null && bpm > 255 ? [1].concat(signed16(bpm)) : [0, bpm === null ? 0 : Math.round(bpm)]};
  if (temp !== null) result["2a1f"] = signed16(temp * 10);
  if (accel !== null) result["e95d0753-251d-470a-a062-fa1922dfa9a8"] = vector(accel, 1000);
  if (mag !== null) result["2aa1"] = vector(mag, 1);
  return result;
}
exports.Journal = Journal;
exports.RuleEngine = RuleEngine;
exports.DisplayState = DisplayState;
exports.validatePolicy = validatePolicy;
exports.frames = frames;
exports.pack = pack;
exports.unpack = unpack;
exports.validatePresentation = validatePresentation;
exports.Interaction = Interaction;
exports.Cues = Cues;
