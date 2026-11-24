const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../apps/veranode/core.js');
const runtime = require('../../apps/veranode/runtime.js');
const {platform} = require('./helpers.cjs');
function session() {
  const f = platform(core), node = runtime.create(f.env);
  node.start(); node.setAppSession(600, 'test-only');
  return {...f, node};
}
test('silent powered HRM gets one bounded recovery without extra sample writes', () => {
  const f = session();
  f.clock.advance(30000);
  assert.deepEqual(f.power, [true]);
  f.clock.advance(30000);
  assert.deepEqual(f.power, [true, false, true]);
  assert.equal(f.node.health().heartRestarts, 1);
  const next = f.node.samples.next;
  f.clock.advance(30000);
  assert.equal(f.node.samples.next, next + 1);
  f.clock.advance(120000);
  assert.deepEqual(f.power, [true, false, true]);
  f.node.setAppSession(0);
  f.clock.advance(120000);
  assert.equal(f.node.health().heartRestarts, 1);
  assert.equal(f.power.at(-1), false);
});
test('low-confidence events do not trigger recovery or fabricate heart values', () => {
  const f = session();
  for (let i = 0; i < 12; i++) {
    f.bus.emit('HRM', {bpm: 80, confidence: 0});
    f.clock.advance(10000);
  }
  assert.deepEqual(f.power, [true]);
  assert.equal(f.node.state.values.battito, undefined);
});
test('valid events resume updates and display-only recovery never records', () => {
  const f = platform(core), node = runtime.create(f.env);
  node.start(); node.startDisplayRead(); f.clock.advance(60000);
  assert.equal(node.samples.pending(), 0);
  f.bus.emit('HRM', {bpm: 80, confidence: 90});
  assert.equal(node.state.values.battito.value, 80);
  assert.equal(node.samples.pending(), 0);
  node.dispose();
});
test('failed recovery is bounded, diagnosed and does not prevent session stop', () => {
  const f = session();
  f.env.hrm = on => { f.power.push(on); return !on; };
  f.clock.advance(180000);
  assert.deepEqual(f.power, [true, false, true]);
  assert.match(f.node.health().startError, /Ripresa sensore battito/);
  f.node.setAppSession(0);
  const high = f.node.samples.next;
  f.clock.advance(60000);
  assert.equal(f.node.samples.next, high);
});
test('a clock discontinuity rebases the quiet-heart window without a false restart', () => {
  const f = platform(core);
  f.env.timeFactory = require('../../apps/veranode/clock.js').create;
  const node = runtime.create(f.env);
  node.start(); node.setAppSession(600, 'test-only');
  node.readClock();
  f.clock.time += 600000;
  // Timers remain monotonic on the device; advance their fake wall deadlines
  // too, rather than replaying old callbacks with a backwards fake clock.
  for (const timer of f.clock.timers.values()) timer.at += 600000;
  node.readClock();
  f.clock.advance(30000);
  assert.deepEqual(f.power, [true]);
  node.dispose();
});
