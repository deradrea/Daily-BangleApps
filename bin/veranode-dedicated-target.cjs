/* Select the minimal Vera-only target. No BLE, storage erase, release or policy change. */
const crypto=require('node:crypto');
const names=['.boot0','.bootcde','boot.info','bootupdate.js','launch.app.js','setting.json','veranode.clock.js','veranode.app.js','veranode.core.js','veranode.runtime.js','veranode.wire.js','veranode.img','veranode.boot.js','veranode.info'];
const removed=['date_utils','launch_utils','widget_utils','launch.info','launch.settings.js','setting.app.js','setting.img','setting.info'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function create(files,launcherBytes){
 if(!Array.isArray(files)||new Set(files.map(f=>f.name)).size!==files.length||!Buffer.isBuffer(launcherBytes)||!launcherBytes.length)throw Error('Invalid dedicated target inputs');
 const expected=new Set([...names,...removed]);
 if(files.length!==expected.size||files.some(f=>!expected.has(f.name)))throw Error('Unrecognized parent inventory');
 for(const f of files){const b=Buffer.from(f.base64,'base64');if(b.length!==f.size||sha(b)!==f.sha256)throw Error('Parent file integrity: '+f.name);}
 const selected=names.map(n=>structuredClone(files.find(f=>f.name===n)));
 const i=selected.findIndex(f=>f.name==='launch.app.js');
 selected[i]={name:'launch.app.js',size:launcherBytes.length,sha256:sha(launcherBytes),base64:launcherBytes.toString('base64')};
 const settings=JSON.parse(Buffer.from(selected.find(f=>f.name==='setting.json').base64,'base64'));
 if(settings.clock!=='veranode.app.js'||settings.clockHasWidgets!==false||settings.ble!==true||settings.blerepl!==true)throw Error('Unexpected dedicated settings');
 return selected;
}
module.exports={create,names,removed};
