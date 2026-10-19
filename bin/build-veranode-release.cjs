/* One immutable development artifact for Web and Mobile. Never flashes/publishes. */
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function build(outputRoot = path.join(root, 'dist/veranode')) {
  const source = path.join(root, 'apps/veranode');
  const metadata = JSON.parse(fs.readFileSync(path.join(source, 'metadata.json')));
  const inputs = {};
  for (const name of ['metadata.json', ...metadata.storage.map(f => f.url)]) {
    if (path.basename(name) !== name) throw Error('Invalid source path');
    inputs[name] = hash(fs.readFileSync(path.join(source, name)));
  }
  const sourceManifest = {schemaVersion: 1, repository: 'Daily_BangleApps',
    directory: 'apps/veranode', version: '0.2.0', files: inputs};
  const sourceBytes = Buffer.from(JSON.stringify(sourceManifest, null, 2) + '\n');
  const sourceHash = hash(sourceBytes);
  const revision = `veranode-0.2.0-dev-${sourceHash.slice(0, 16)}`;
  const files = metadata.storage.map(entry => {
    let bytes = fs.readFileSync(path.join(source, entry.url));
    if (entry.evaluate) {
      const literal = bytes.toString().trim().match(/^atob\("([A-Za-z0-9+/=]+)"\)$/);
      if (!literal) throw Error('Only a literal base64 icon can be evaluated');
      bytes = Buffer.from(literal[1], 'base64');
    }
    return {name: entry.name, size: bytes.length, sha256: hash(bytes), base64: bytes.toString('base64')};
  }).sort((a, b) => Number(a.name.endsWith('.boot.js')) - Number(b.name.endsWith('.boot.js')));
  const info = Buffer.from(JSON.stringify({id: metadata.id, name: metadata.name,
    type: metadata.type, version: metadata.version, src: 'veranode.app.js',
    icon: 'veranode.img', files: [...files.map(f => f.name), 'veranode.info'].join(',')}));
  files.push({name: 'veranode.info', size: info.length, sha256: hash(info), base64: info.toString('base64')});
  const bundle = {schemaVersion: 1, id: 'vera-standard', revision, version: '0.2.0',
    developmentOnly: true, hardwareValidated: false, board: 'BANGLEJS2', firmware: ['2v29'],
    source: 'Daily_BangleApps/apps/veranode', sourceManifestSha256: sourceHash,
    installation: {mode: 'first-install-only', preservesFirmware: true,
      activation: 'explicit-clock-selection', writes: files.map(f => f.name)}, files};
  const bytes = Buffer.from(JSON.stringify(bundle, null, 2) + '\n');
  const destination = path.join(outputRoot, revision);
  fs.mkdirSync(destination, {recursive: true});
  for (const [name, data] of [['package.json', bytes], ['source-manifest.json', sourceBytes]]) {
    const target = path.join(destination, name);
    if (fs.existsSync(target) && !fs.readFileSync(target).equals(data)) throw Error('Immutable release conflict');
    if (!fs.existsSync(target)) fs.writeFileSync(target, data, {flag: 'wx'});
  }
  return {revision, sha256: hash(bytes), path: path.join(destination, 'package.json'), bundle};
}
if (require.main === module) {
  const result = build();
  console.log(JSON.stringify({revision: result.revision, sha256: result.sha256, path: result.path}));
}
module.exports = {build};
