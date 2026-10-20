/* One immutable development artifact for Web and Mobile. Never flashes/publishes. */
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const acorn = require('acorn');
const root = path.resolve(__dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function validateMetadata(metadata) {
  if (metadata.id !== 'veranode' || metadata.type !== 'clock' ||
    !Array.isArray(metadata.supports) || !metadata.supports.includes('BANGLEJS2') ||
    !Array.isArray(metadata.storage) || !metadata.storage.length)
    throw Error('Invalid package metadata');
  const names = new Set();
  for (const entry of metadata.storage) {
    if (!entry || typeof entry.url !== 'string' || path.basename(entry.url) !== entry.url ||
      !/^[a-z0-9.-]+$/i.test(entry.url) || typeof entry.name !== 'string' ||
      !/^veranode\.[a-z0-9.]+$/i.test(entry.name) || entry.name.length > 28 ||
      entry.name === 'veranode.info' || names.has(entry.name)) throw Error('Invalid or duplicate install file');
    names.add(entry.name);
    if ('evaluate' in entry && entry.evaluate !== true) throw Error('Invalid evaluation flag');
    if (entry.evaluate && entry.name !== 'veranode.img') throw Error('Only the icon may be evaluated');
  }
  for (const name of ['veranode.app.js','veranode.boot.js','veranode.core.js','veranode.runtime.js','veranode.clock.js','veranode.wire.js','veranode.img'])
    if (!names.has(name)) throw Error('Missing required file '+name);
  if (!Array.isArray(metadata.data)) throw Error('Missing data inventory');
  const dataNames = new Set();
  for (const entry of metadata.data) {
    const name = entry.name || entry.wildcard;
    if (!name || (!!entry.name === !!entry.wildcard) ||
      !/^veranode\.[a-z0-9.?]+$/i.test(name) || name.length > 28 ||
      names.has(name) || dataNames.has(name) || ('storageFile' in entry && entry.storageFile !== true))
      throw Error('Invalid data inventory');
    dataNames.add(name);
  }
}
function validateDependencies(code, installedNames) {
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') {
      const dependency = node.arguments.length === 1 && node.arguments[0].value;
      if (typeof dependency !== 'string') throw Error('Dynamic dependency not allowed');
      if (dependency !== 'Storage' && !installedNames.has(dependency)) throw Error('Missing dependency '+dependency);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(acorn.parse(code, {ecmaVersion: 2015}));
}
function build(outputRoot = path.join(root, 'dist/veranode')) {
  const source = path.join(root, 'apps/veranode');
  const metadata = JSON.parse(fs.readFileSync(path.join(source, 'metadata.json')));
  validateMetadata(metadata);
  const license = fs.readFileSync(path.join(root, 'LICENSE'));
  const inputs = {};
  for (const name of ['metadata.json', ...metadata.storage.map(f => f.url)]) {
    if (path.basename(name) !== name) throw Error('Invalid source path');
    inputs[name] = hash(fs.readFileSync(path.join(source, name)));
  }
  const sourceManifest = {schemaVersion: 1, repository: 'Daily_BangleApps',
    directory: 'apps/veranode', version: '0.2.0',
    builderSha256: hash(fs.readFileSync(__filename)), licenseSha256: hash(license), files: inputs};
  const sourceBytes = Buffer.from(JSON.stringify(sourceManifest, null, 2) + '\n');
  const sourceHash = hash(sourceBytes);
  const revision = `veranode-0.2.0-dev-${sourceHash.slice(0, 16)}`;
  const installedNames = new Set(metadata.storage.map(entry => entry.name));
  const files = metadata.storage.map(entry => {
    let bytes = fs.readFileSync(path.join(source, entry.url));
    if (entry.url.endsWith('.js') && !entry.evaluate) validateDependencies(bytes.toString('utf8'), installedNames);
    if (entry.evaluate) {
      const literal = bytes.toString().trim().match(/^atob\("([A-Za-z0-9+/=]+)"\)$/);
      if (!literal) throw Error('Only a literal base64 icon can be evaluated');
      bytes = Buffer.from(literal[1], 'base64');
    }
    return {name: entry.name, size: bytes.length, sha256: hash(bytes), base64: bytes.toString('base64')};
  }).sort((a, b) => Number(a.name.endsWith('.boot.js')) - Number(b.name.endsWith('.boot.js')));
  const dataFiles = metadata.data.filter(entry => !entry.storageFile).map(entry => entry.name || entry.wildcard);
  const storageFiles = metadata.data.filter(entry => entry.storageFile).map(entry => entry.name || entry.wildcard);
  const info = Buffer.from(JSON.stringify({id: metadata.id, name: metadata.name,
    type: metadata.type, version: metadata.version, src: 'veranode.app.js',
    revision,
    icon: 'veranode.img', data: dataFiles.join(',') + (storageFiles.length ? ';'+storageFiles.join(',') : ''),
    files: [...files.map(f => f.name), 'veranode.info'].join(',')}));
  files.push({name: 'veranode.info', size: info.length, sha256: hash(info), base64: info.toString('base64')});
  const bundle = {schemaVersion: 1, id: 'vera-standard', revision, version: '0.2.0',
    developmentOnly: true, hardwareValidated: false, releaseReady: false,
    board: 'BANGLEJS2', firmware: ['2v29'],
    source: 'Daily_BangleApps/apps/veranode', sourceManifestSha256: sourceHash,
    sourceRepository: 'https://github.com/deradrea/Daily-BangleApps',
    license: {id: 'MIT', sha256: hash(license), text: license.toString('utf8')},
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
module.exports = {build, validateMetadata, validateDependencies};
