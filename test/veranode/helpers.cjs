const { EventEmitter } = require('node:events');
class MemoryStorage {
  constructor() { this.normal = new Map(); this.files = new Map(); this.fail = false; }
  read(name) { return this.normal.get(name); }
  write(name, data) { if (this.fail) throw Error('flash failed'); this.normal.set(name, String(data)); }
  readJSON(name) { try { return JSON.parse(this.read(name)); } catch { return undefined; } }
  list(_regex, filter) {
    const files = [...this.files.keys()].map(n => n + '\x01');
    return filter?.sf ? files : [...this.normal.keys(), ...files];
  }
  getFree() { return 1000000; }
  open(name, mode) {
    if (mode === 'w') this.files.set(name, '');
    let offset = 0;
    return {
      write: text => { if (this.fail) throw Error('flash failed'); this.files.set(name, (this.files.get(name) || '') + text); },
      readLine: () => {
        const text = this.files.get(name) || '';
        if (offset >= text.length) return undefined;
        const end = text.indexOf('\n', offset);
        const line = text.slice(offset, end === -1 ? text.length : end);
        offset = end === -1 ? text.length : end + 1;
        return line;
      },
      erase: () => this.files.delete(name)
    };
  }
}
class Clock {
  constructor(now = 100000) { this.time = now; this.next = 1; this.timers = new Map(); }
  now = () => this.time;
  setTimeout = (fn, ms) => { const id = this.next++; this.timers.set(id, {at: this.time + ms, fn}); return id; };
  clearTimeout = id => this.timers.delete(id);
  setInterval = (fn, ms) => { const id = this.next++; this.timers.set(id, {at: this.time + ms, fn, ms}); return id; };
  clearInterval = this.clearTimeout;
  advance(ms) {
    const end = this.time + ms;
    for (let n = 0; n < 10000; n++) {
      const entry = [...this.timers].filter(([,t]) => t.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!entry) { this.time = end; return; }
      const [id, t] = entry;
      this.time = t.at;
      if (t.ms) t.at += t.ms; else this.timers.delete(id);
      t.fn();
    }
    throw Error('timer storm');
  }
}
function platform(core) {
  const clock = new Clock(), storage = new MemoryStorage(), bus = new EventEmitter();
  const sent = [], power = [], buzz = [];
  const env = {core, clock, storage, mac: 'AA:BB:CC:DD:EE:02',
    on: (event, fn) => bus.on(event, fn), off: (event, fn) => bus.off(event, fn),
    connected: () => false, hrm: on => power.push(on), accel: () => ({x: 0.1, y: -0.2, z: 1}),
    pressure: () => Promise.resolve({temperature: 23.4}),
    buzz: ms => buzz.push(ms), publish: frames => sent.push(frames)};
  return {env, clock, storage, bus, sent, power, buzz};
}
function policy(mac = 'AA:BB:CC:DD:EE:02') {
  return {v: 1, revision: 1, user: '11111111-1111-4111-8111-111111111111',
    scope: 'test-only', mac, expiresAt: 9000000, rules: [{id: 'test-high', metric: 'battito',
      direction: 'high', enter: 100, exit: 90, durationMs: 2000, maxAgeMs: 5000,
      maxGapMs: 2000, severity: 'warning', qualityMin: 50}]};
}
module.exports = {MemoryStorage, Clock, platform, policy};
