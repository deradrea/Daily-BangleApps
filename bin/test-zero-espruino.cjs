/* Real Espruino 2v29 interpreter regression. No BLE and no Node require mock. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifest=require('../test/veranode/fixtures/espruino-emulator-2v29.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 const at=process.argv.indexOf('--package');if(at<0||!process.argv[at+1])throw Error('Use --package path/to/initialize.json [--download]');
 const pkg=JSON.parse(fs.readFileSync(path.resolve(process.argv[at+1]))),old=JSON.parse(fs.readFileSync(path.join(root,'dist/veranode-zero/veranode-zero-1-d812397c6325d227/initialize.json')));
 const dir=process.env.VERA_ESPRUINO_EMULATOR_DIR||path.join(os.tmpdir(),'vera-espruino-2v29',manifest.commit);fs.mkdirSync(dir,{recursive:true});
 for(const [name,expected]of Object.entries(manifest.files)){
  const file=path.join(dir,name);
  if(!fs.existsSync(file)&&process.argv.includes('--download')){const response=await fetch('https://raw.githubusercontent.com/espruino/EspruinoWebIDE/'+manifest.commit+'/emu/'+name);if(!response.ok)throw Error('Emulator HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(sha(bytes),expected);fs.writeFileSync(file,bytes,{flag:'wx'});}
  if(!fs.existsSync(file))throw Error('Pinned emulator missing: use --download or VERA_ESPRUINO_EMULATOR_DIR');assert.equal(sha(fs.readFileSync(file)),expected,name);
 }
 let output='',resolveReady;const ready=new Promise(resolve=>resolveReady=resolve);
 const quiet={log(){},warn(){},error(){}};
 const ctx=vm.createContext({console:quiet,require,process,Buffer,__dirname:dir,setTimeout,clearTimeout,setInterval,clearInterval,Module:{noInitialRun:true,onRuntimeInitialized:()=>resolveReady()}});
 for(const name of Object.keys(manifest.files))vm.runInContext(fs.readFileSync(path.join(dir,name),'utf8'),ctx,{filename:name});
 let startupTimeout;try{await Promise.race([ready,new Promise((_,reject)=>{startupTimeout=setTimeout(()=>reject(Error('Emulator startup timeout')),20000);})]);}finally{clearTimeout(startupTimeout);}
 ctx.jsRXCallback=ch=>output+=String.fromCharCode(ch);ctx.jsUpdateGfx=()=>{};ctx.jsInit();
 let counter=0;
 function rpc(expression){
  const marker='V_TEST_'+(++counter)+'_';output='';
  ctx.jsTransmitString('\x10(function(){try{print('+JSON.stringify(marker)+'+JSON.stringify({value:'+expression+'}));}catch(e){print('+JSON.stringify(marker)+'+JSON.stringify({error:String(e)}));}})()\n');ctx.jsStopIdle();
  const line=output.split(/\r?\n/).find(line=>line.includes(marker+'{'));if(!line)throw Error('No interpreter reply: '+output.slice(-1000));return JSON.parse(line.slice(line.indexOf(marker)+marker.length));
 }
 function value(expression){const result=rpc(expression);if(result.error)throw Error(result.error);return result.value;}
 const native=value('({version:process.env.VERSION,board:process.env.BOARD})');assert.equal(native.version,'2v29');assert.equal(native.board,'EMSCRIPTEN2');
 // The official emulator names this board EMSCRIPTEN2; map only that guard.
 // Storage, Modules, require and all evaluated package modules remain native C.
 value('(function(){global.process={env:{VERSION:"2v29",BOARD:"BANGLEJS2"}};require("Storage").write("old.data","preserve");return true;})()');
 for(const file of pkg.bootstrap){const bytes=Buffer.from(file.base64,'base64');for(let offset=0;offset<bytes.length;offset+=384)value('require("Storage").write('+JSON.stringify(file.name)+',atob('+JSON.stringify(bytes.subarray(offset,offset+384).toString('base64'))+'),'+offset+(offset===0?','+bytes.length:'')+')');}
 const installed=value('(function(){var a=[];'+JSON.stringify(pkg.bootstrap.map(f=>({name:f.name,size:f.size})))+'.forEach(function(f){var b=require("Storage").read(f.name);a.push({name:f.name,size:b.length});});return a;})()');assert.deepEqual(installed,pkg.bootstrap.map(f=>({name:f.name,size:f.size})));
 const regression=rpc(old.uiBootstrapExpression);assert.match(regression.error,/Module "vz.provider.js" not found/);
 value('(function(){global.stockRemoved=false;Bangle.setUI({mode:"custom",remove:function(){global.stockRemoved=true;}});return true;})()');
 const feedback=value(pkg.feedbackBootstrapExpression);assert.equal(feedback.feedbackReady,true);assert.equal(feedback.visualVerified,false);assert.equal(value('global.stockRemoved'),true);
 const hold=value('Bangle.getOptions()');assert.equal(hold.lcdPowerTimeout,0);assert.equal(hold.backlightTimeout,0);assert.equal(hold.lockTimeout,0);
 const fresh=value(pkg.uiBootstrapExpression);assert.equal(fresh.phase,'unprepared');assert.equal(fresh.targetFiles,14);assert.equal(fresh.appUiReady,true);assert.equal(fresh.visualVerified,false);assert.equal(value('global.VeraZeroUiReady'),true);assert.equal(value('global.VeraZeroDisplay.canConsent()'),true);
 for(const [name,code]of [['vz.provider.js','exports.create=function(){throw Error("stale provider");}'],['vz.platform.js','exports.create=function(){throw Error("stale platform");}'],['vz.target.js','exports={fingerprint:"stale",files:[]};']])value('Modules.addCached('+JSON.stringify(name)+','+JSON.stringify(code)+')');
 const warm=value(pkg.uiBootstrapExpression);assert.equal(warm.targetFingerprint,pkg.target.fingerprint);assert.equal(warm.targetFiles,14);assert.equal(value('global.VeraZeroUiReady'),true);
 value('(function(){require("Storage").erase("vz.provider.js");return true;})()');const missing=rpc(pkg.uiBootstrapExpression);assert.match(missing.error,/Module "vz.provider.js" not found/);assert.equal(value('global.VeraZeroUiReady'),false);
 assert.equal(value('require("Storage").read("old.data")'),'preserve');ctx.jsStopIdle();
 console.log(JSON.stringify({ok:true,interpreter:native,emulatorCommit:manifest.commit,packageSource:pkg.sourceCommit,checks:['original-d812-cache-error-reproduced','empty-cache-bootstrap','warm-cache-stale-target-reloaded','old-ui-released-and-lcd-held','missing-module-error-propagated','existing-data-preserved'],hardware:false,nodeRequireMock:false},null,2));
}
main().then(()=>process.exit(0),error=>{console.error(error.stack||String(error));process.exit(1);});
