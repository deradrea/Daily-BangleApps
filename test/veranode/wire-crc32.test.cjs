const test = require('node:test');
const assert = require('node:assert/strict');
const wire = require('../../apps/veranode/wire.js');
const crc32 = text => {
  let crc = 0xffffffff;
  for (const byte of Buffer.from(text, 'ascii')) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
};
function reply(request, nativeCrc = crc32) {
  const parts = [], jobs = [];
  const node = {state: {}};
  const server = wire.create({node, crc32: nativeCrc,
    encrypted: () => false, send: text => parts.push(text), chunkSize: () => 180,
    clock: {setTimeout: fn => {jobs.push(fn); return jobs.length;}, clearTimeout() {}}});
  server.receive([...Buffer.from(JSON.stringify({id: 'test', op: 'link_security', ...request})+'\n')]);
  while (jobs.length) jobs.shift()();
  return parts.join('');
}
test('CRC32 standard vector and explicitly selected native integrity', () => {
  assert.equal(crc32('123456789'), 0xcbf43926);
  const text = reply({integrity: true, checksum: 'crc32'});
  const [body, trailer] = text.trim().split('#c');
  assert.equal(trailer, crc32(body).toString(16).padStart(8, '0'));
  assert.deepEqual(JSON.parse(body).result, {encrypted: false});
});
test('legacy clients, missing native support and unknown checksum retain FNV', () => {
  for (const text of [reply({integrity: true}), reply({integrity: true, checksum: 'crc32'}, null), reply({integrity: true, checksum: 'unknown'})]) {
    assert.match(text, /#[0-9a-f]{8}\n$/);
    assert.doesNotMatch(text, /#c[0-9a-f]{8}\n$/);
  }
  assert.doesNotMatch(reply({checksum: 'crc32'}), /#/);
});
