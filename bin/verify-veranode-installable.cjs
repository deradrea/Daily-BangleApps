/* Read-only audit of the selected immutable initialization package. No BLE. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function audit() {
  const selection = JSON.parse(fs.readFileSync(path.join(root, 'releases/veranode-initialization.json')));
  const packagePath = path.resolve(root, selection.path);
  assert.ok(packagePath.startsWith(path.join(root, 'dist') + path.sep));
  const bytes = fs.readFileSync(packagePath);
  assert.equal(sha(bytes), selection.sha256, 'selected package hash');
  const bundle = JSON.parse(bytes);
  const descriptor = JSON.parse(fs.readFileSync(path.join(path.dirname(packagePath), 'descriptor.json')));
  const manifestBytes = fs.readFileSync(path.join(path.dirname(packagePath), 'source-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(descriptor.sha256, selection.sha256);
  assert.equal(descriptor.revision, selection.revision);
  assert.equal(descriptor.size, bytes.length);
  assert.equal(sha(manifestBytes), bundle.sourceManifestSha256);
  assert.equal(bundle.sourceCommit, selection.sourceCommit);
  assert.equal(manifest.sourceCommit, selection.sourceCommit);
  assert.equal(bundle.runtimeRevision, selection.runtimeRevision);
  assert.equal(bundle.runtimePackageSha256, selection.runtimePackageSha256);
  assert.equal(bundle.targetProfile, 'veranode-only');
  assert.equal(bundle.board, 'BANGLEJS2');
  assert.deepEqual(bundle.firmware, ['2v29']);
  assert.equal(bundle.preservesFirmware, true);
  assert.equal(bundle.authorization.physicalConsent, false);
  assert.equal(bundle.authorization.confirmationSource, 'app');
  assert.equal(bundle.recovery.eraseAll, false);
  assert.equal(bundle.bootstrap.length, 8);
  assert.equal(bundle.target.files.length, 14);
  const names = new Set();
  const inventory = [...bundle.bootstrap, ...bundle.target.files].map(file => {
    assert.ok(!names.has(file.name), 'duplicate payload: ' + file.name);
    names.add(file.name);
    const content = Buffer.from(file.base64, 'base64');
    assert.equal(content.length, file.size, file.name + ' size');
    assert.equal(sha(content), file.sha256, file.name + ' hash');
    if (file.name !== 'vz.target.js') {
      let chunks = '';
      for (let at = 0; at < content.length; at += 1024) chunks += sha(content.subarray(at, at + 1024));
      assert.equal(chunks, bundle.integrity.hashes[file.name], file.name + ' ordered blocks');
    }
    return {name: file.name, bytes: content.length, sha256: file.sha256};
  });
  assert.equal(bundle.integrity.algorithm, 'sha256-chunks-1024-v1');
  assert.equal(bundle.integrity.blockBytes, 1024);
  for (const [name, hash] of Object.entries(manifest.files)) {
    const source = cp.execFileSync('git', ['show', manifest.sourceCommit + ':' + name], {cwd: root});
    assert.equal(sha(source), hash, 'committed source: ' + name);
  }
  const rebuilt = require('./build-veranode-zero.cjs').build(
    fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'vera-installable-')),
    {sourceCommit: selection.sourceCommit, targetProfile: 'veranode-only'});
  assert.ok(bytes.equals(fs.readFileSync(rebuilt.path)), 'reproducible build');
  const releaseUrl = selection.revision && 'https://github.com/deradrea/Daily-BangleApps/releases/tag/' + selection.revision;
  let remote = null;
  if (process.argv.includes('--remote')) {
    const url = 'https://github.com/deradrea/Daily-BangleApps/releases/download/' + selection.revision + '/initialize.json';
    const response = await fetch(url, {signal: AbortSignal.timeout(45000)});
    assert.equal(response.status, 200, 'official release download');
    const downloaded = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.equals(downloaded), 'official release exact bytes');
    remote = {url, bytes: downloaded.length, sha256: sha(downloaded)};
  }
  return {schema: 'vera-installable-audit/1', checkedAt: new Date().toISOString(),
    revision: selection.revision, sha256: selection.sha256, packageBytes: bytes.length,
    runtimeRevision: bundle.runtimeRevision, sourceCommit: selection.sourceCommit,
    releaseUrl, inventory, reproducibleBuild: true, sourceProvenanceVerified: true,
    orderedBlocksVerified: true, officialDownload: remote,
    hardwareTestPerformed: false, deviceCommandsSent: false,
    note: 'Package audit only; native interpreter and Mobile test results are separate evidence.'};
}

if (require.main === module) audit().then(result => {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}, error => { console.error(error.stack || String(error)); process.exitCode = 1; });
module.exports = {audit};
