const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
test('display package pins byte-identical runtime, isolated data file and bounded management RPC',()=>{
 const selected=require('../../bin/veranode-runtime-selection.cjs').select(n=>fs.readFileSync(path.join(root,n)));
 const config=require('../../releases/veranode-runtime.json');assert.equal(selected.revision,config.revision);
 const bundle=JSON.parse(fs.readFileSync(path.join(root,config.path)));
 for(const f of bundle.files){const bytes=Buffer.from(f.base64,'base64');assert.equal(hash(bytes),f.sha256);}
 const info=JSON.parse(Buffer.from(bundle.files.find(f=>f.name==='veranode.info').base64,'base64'));
 assert.ok(info.data.includes('veranode.display.json'));
 const core=Buffer.from(bundle.files.find(f=>f.name==='veranode.core.js').base64,'base64').toString();assert.ok(core.includes('exports.DisplayPreferences'));
 const wire=Buffer.from(bundle.files.find(f=>f.name==='veranode.wire.js').base64,'base64').toString();assert.ok(wire.includes('authorize_display'));assert.ok(wire.includes('settings_get'));
});
test('preserving upgrade retains the previous canonical deployed runtime among accepted sources',()=>{
 const builder=fs.readFileSync(path.join(root,'bin/build-veranode-upgrade.cjs'),'utf8');
 const previous='dist/veranode/veranode-0.2.0-dev-f4f3226f8bca4f26/package.json';
 assert.ok(builder.includes(previous));assert.ok(builder.includes(hash(fs.readFileSync(path.join(root,previous)))));
});
