const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../apps/veranode/core.js');
const runtime = require('../../apps/veranode/runtime.js');
const {platform} = require('./helpers.cjs');

// Espruino 2v29 reuses the vacant timer slot, unlike Node's increasing IDs.
function reusingTimers(clock) {
  const allocate = (fn, ms, repeat) => {
    let id = 1;
    while (clock.timers.has(id)) id++;
    clock.timers.set(id, {at: clock.time + ms, fn, ...(repeat ? {ms} : {})});
    return id;
  };
  clock.setTimeout = (fn, ms) => allocate(fn, ms, false);
  clock.setInterval = (fn, ms) => allocate(fn, ms, true);
}

for (const outcome of ['resolved', 'rejected', 'throws', 'timeout']) {
  test(`display shutdown preserves a BLE timer after pressure ${outcome}`, async () => {
    const f = platform(core);
    reusingTimers(f.clock);
    f.env.pressure = () => {
      if (outcome === 'throws') throw Error('sensor unavailable');
      if (outcome === 'rejected') return Promise.reject(Error('sensor unavailable'));
      if (outcome === 'timeout') return new Promise(() => {});
      return Promise.resolve({temperature: 23.4});
    };
    const node = runtime.create(f.env);
    node.start();
    node.startDisplayRead();
    await Promise.resolve();
    if (outcome === 'timeout') f.clock.advance(5000);
    let delivered = false;
    f.clock.setTimeout(() => { delivered = true; }, 25);
    node.endDisplayRead();
    f.clock.advance(25);
    assert.equal(delivered, true, 'sensor cleanup must not cancel a reused BLE timer slot');
    assert.equal(node.samples.pending(), 0);
    node.dispose();
  });
}
