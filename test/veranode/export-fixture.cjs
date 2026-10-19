const fs = require('node:fs');
const path = require('node:path');
const core = require('../../apps/veranode/core.js');
const now = 1000;
const frames = core.frames({battito: {value: 72, at: now}, temperatura: {value: 23.4, at: now},
  accelerometro: {value: {x: 0.1, y: -0.2, z: 1}, at: now}}, now);
const destination = path.resolve(__dirname, '../../../vera-mobile/flutter-app/test/fixtures/veranode-live.json');
fs.mkdirSync(path.dirname(destination), {recursive: true});
fs.writeFileSync(destination, JSON.stringify({version: '0.1.0', synthetic: true, frames}, null, 2) + '\n');
