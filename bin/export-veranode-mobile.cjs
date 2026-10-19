/* Explicit consumer export of the canonical artifact, no alternate build. */
const fs = require('node:fs'), path = require('node:path');
const {build} = require('./build-veranode-release.cjs');
const release = build();
const mobile = path.resolve(__dirname, '../../vera-mobile/flutter-app');
const asset = path.join(mobile, 'assets/bangle/vera-standard.json');
fs.mkdirSync(path.dirname(asset), {recursive:true});
fs.copyFileSync(release.path, asset);
fs.writeFileSync(path.join(mobile, 'lib/vera_core/bangle_install_release.dart'),
  `// Generated from Daily_BangleApps canonical package; never hand-edit.\nconst bangleInstallPackageHash = '${release.sha256}';\n`);
console.log(JSON.stringify({revision:release.revision, sha256:release.sha256, exported:asset}));
