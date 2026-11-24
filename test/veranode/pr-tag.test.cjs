const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');

function fixture(status = 200) {
  const calls = [];
  const https = {request(options, callback) {
    const request = new EventEmitter();
    const call = {options, chunks: []}; calls.push(call);
    request.write = chunk => call.chunks.push(chunk);
    request.end = () => queueMicrotask(() => {
      const response = new EventEmitter(); response.statusCode = status;
      callback(response); response.emit('data', '{}'); response.emit('end');
    });
    return request;
  }};
  const module = {exports: {}};
  const sandbox = {module, Buffer, console, process: {argv: ['node', 'pr-tag', '--local'],
    exit() {throw Error('unexpected exit');}},
    require(name) {if (name === 'https') return https;
      if (name === 'child_process') return {execSync: () => ''};
      return require(name);}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../bin/pr-tag.js'), 'utf8'), sandbox);
  return {...module.exports, calls};
}

test('author comment sends JSON bytes with UTF-8 length and accepts GitHub 201', async () => {
  const f = fixture(201), data = {body: 'release pronta · verifica'};
  await f.fetchGH({path: '/repos/fixture/project/issues/1/comments', token: 'fixture-only', data});
  const call = f.calls[0];
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.headers['Content-Type'], 'application/json');
  assert.equal(call.options.headers['Content-Length'], Buffer.byteLength(JSON.stringify(data)));
  assert.equal(call.chunks.join(''), JSON.stringify(data));
});

test('GET has no body and an HTTP error remains an error', async () => {
  const f = fixture(); await f.fetchGH({path: '/repos/fixture/project/pulls/1', token: 'fixture-only'});
  assert.equal(f.calls[0].options.method, 'GET'); assert.equal(f.calls[0].chunks.length, 0);
  const failed = fixture(422);
  await assert.rejects(failed.fetchGH({path: '/fixture', token: 'fixture-only', data: {body: 'text'}}), /GitHub API error: 422/);
});

test('company names are not mentions and previous valid mentions are reconciled', () => {
  const f = fixture();
  for (const author of ['Daily Practice 22 SRL', 'name@example.test', '', '-name', 'name-', 'a--b', null])
    assert.equal(f.isGithubLogin(author), false);
  assert.equal(f.isGithubLogin('valid-author22'), true);
  const parsed = f.parseLine(f.makeLine({author: 'valid-author22', apps: new Set(['apps/veranode'])}));
  assert.equal(parsed.author, 'valid-author22'); assert.equal(parsed.apps[0], 'apps/veranode');
});

test('tools-only changes complete without attempting any notification', async () => {
  const f = fixture(); await f.main(); assert.equal(f.calls.length, 0);
});
