const test = require('node:test');
const assert = require('node:assert/strict');
const {crc32} = require('node:zlib');
const {Journal} = require('../../apps/veranode/core.js');
const {MemoryStorage} = require('./helpers.cjs');

const options = {maxSegments: 92, segmentRecords: 32, indexHash: crc32};
const journal = storage => new Journal(storage, 's', options);
const append = (target, value) => target.append('sample', 10, {value});

test('full indexed archive opens no sample files on normal boot and serves intact historical rows', () => {
  const storage = new MemoryStorage(), writer = journal(storage);
  for (let i = 0; i < 2881; i++) append(writer, i);
  const before = [...storage.files];
  const opened = [], open = storage.open.bind(storage);
  storage.open = (name, mode) => { opened.push(name); return open(name, mode); };
  const reader = journal(storage);
  assert.deepEqual(opened, []);
  assert.equal(reader.pending(), 2881);
  assert.equal(reader.next, 2882);
  assert.equal(reader.readBatch(0, 1)[0].data.value, 0);
  assert.deepEqual([...storage.files], before);
});

test('power loss around a sample write does not reuse an already committed sequence', () => {
  for (const count of [0, 32]) for (const cut of ['partial', 'no-newline', 'committed']) {
    const storage = new MemoryStorage(), writer = journal(storage);
    for (let i = 0; i < count; i++) append(writer, i);
    const open = storage.open.bind(storage);
    storage.open = (name, mode) => {
      const file = open(name, mode);
      if (mode === 'a') return {...file, write(text) {
        file.write(cut === 'partial' ? text.slice(0, 19) :
          cut === 'no-newline' ? text.slice(0, -1) : text);
        throw Error('power cut');
      }};
      return file;
    };
    assert.throws(() => append(writer, 100), /power cut/);
    assert.throws(() => append(writer, 101), /verificare/);
    storage.open = open;
    assert.deepEqual(writer.readBatch(count, 1), []);
    const restored = journal(storage);
    const committed = cut !== 'partial';
    assert.equal(append(restored, 101).seq, count + (committed ? 2 : 1));
    // Reboot again to verify framing even when only the final newline was lost.
    const rows = journal(storage).readBatch(count, 2);
    assert.deepEqual(rows.map(row => row.data.value), committed ? [100, 101] : [101]);
  }
});

test('interrupted index write falls back to the previous copy or recovers the journal', () => {
  const storage = new MemoryStorage(), writer = journal(storage);
  for (let i = 0; i < 31; i++) append(writer, i);
  const write = storage.write.bind(storage);
  storage.write = (name, body) => {
    if (name.startsWith('smap')) { write(name, body.slice(0, 20)); throw Error('power cut'); }
    write(name, body);
  };
  assert.equal(append(writer, 31).seq, 32);
  storage.write = write;
  assert.equal(journal(storage).next, 33);
  write('smap0', 'torn');
  write('smap1', 'torn');
  assert.equal(append(journal(storage), 32).seq, 33);
});

test('custody and slot reuse invalidate stale indexes without losing unacknowledged rows', () => {
  const storage = new MemoryStorage(), writer = journal(storage);
  for (let i = 0; i < 64; i++) append(writer, i);
  const stale = [storage.read('smap0'), storage.read('smap1')];
  writer.ack(writer.checkpoint.epoch, 32);
  append(writer, 64);
  storage.write('smap0', stale[0]);
  storage.write('smap1', stale[1]);
  const reader = journal(storage);
  assert.equal(reader.pending(), 33);
  assert.equal(reader.next, 66);
  assert.deepEqual(reader.readBatch(64, 2).map(row => row.seq), [65]);
});

test('legacy archive migration writes an index while preserving the raw journal', () => {
  const storage = new MemoryStorage(), old = new Journal(storage, 's', {maxSegments: 92});
  for (let i = 0; i < 33; i++) append(old, i);
  const before = [...storage.files];
  assert.equal(journal(storage).next, 34);
  assert.deepEqual([...storage.files], before);
  assert.ok(storage.read('smap0'));
});

test('loss of the commit receipt recovers the written row and restores metadata-only boot', () => {
  const storage = new MemoryStorage(), writer = journal(storage);
  assert.equal(append(writer, 1).seq, 1);
  const write = storage.write.bind(storage);
  storage.write = (name, bytes) => {
    if (name === 'stail1') { write(name, bytes.slice(0, 12)); throw Error('power cut'); }
    write(name, bytes);
  };
  assert.throws(() => append(writer, 2), /power cut/);
  storage.write = write;
  assert.equal(journal(storage).next, 3);
  const opened = [], open = storage.open.bind(storage);
  storage.open = (name, mode) => { opened.push(name); return open(name, mode); };
  assert.equal(journal(storage).next, 3);
  assert.deepEqual(opened, []);
});

test('advancing a partial ACK keeps the open tail ready without a sample read at boot', () => {
  const storage = new MemoryStorage(), writer = journal(storage);
  for (let i = 0; i < 5; i++) append(writer, i);
  writer.ack(writer.checkpoint.epoch, 3);
  const opened = [], open = storage.open.bind(storage);
  storage.open = (name, mode) => { opened.push(name); return open(name, mode); };
  const recovered = journal(storage);
  assert.equal(recovered.pending(), 2);
  assert.equal(recovered.next, 6);
  assert.deepEqual(opened, []);
});
