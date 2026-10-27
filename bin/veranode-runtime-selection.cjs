/* One pinned runtime selection for initialization and preserving upgrade. */
const crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function select(read){
 const config=JSON.parse(read('releases/veranode-runtime.json'));
 if(!config||Object.keys(config).sort().join(',')!=='path,revision,sha256'||
   !/^veranode-0\.2\.0-dev-[a-f0-9]{16}$/.test(config.revision)||
   !/^[a-f0-9]{64}$/.test(config.sha256)||
   config.path!=='dist/veranode/'+config.revision+'/package.json')throw Error('Invalid canonical runtime selection');
 const bytes=read(config.path);
 if(bytes.length>300000||sha(bytes)!==config.sha256)throw Error('Selected runtime bytes changed');
 const bundle=JSON.parse(bytes),expected=['veranode.app.js','veranode.boot.js','veranode.clock.js','veranode.core.js','veranode.img','veranode.info','veranode.runtime.js','veranode.wire.js'];
 if(bundle.revision!==config.revision||bundle.board!=='BANGLEJS2'||JSON.stringify(bundle.firmware)!=='["2v29"]'||
   !Array.isArray(bundle.files)||bundle.files.map(f=>f.name).sort().join(',')!==expected.join(','))throw Error('Selected runtime is incompatible');
 for(const file of bundle.files){const b=Buffer.from(file.base64,'base64');if(b.length!==file.size||sha(b)!==file.sha256)throw Error('Selected runtime file changed');}
 return {packageSha256:config.sha256,revision:config.revision,files:bundle.files};
}
module.exports={select};
