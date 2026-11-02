/* Pinned Espruino 2v29 interpreter, no BLE/hardware. Minimal journal adapter
 * isolates clock execution; durable Storage semantics are covered separately. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
async function main(){
 const root=path.resolve(__dirname,'..'),manifest=require('../test/veranode/fixtures/espruino-emulator-2v29.json');
 const dir=process.env.VERA_ESPRUINO_EMULATOR_DIR||path.join(os.tmpdir(),'vera-espruino-2v29',manifest.commit);
 let output='',resolve;const ready=new Promise(r=>resolve=r);
 const ctx=vm.createContext({console:{log(){},warn(){},error(){}},require,process,Buffer,__dirname:dir,
   setTimeout,clearTimeout,setInterval,clearInterval,Module:{noInitialRun:true,onRuntimeInitialized:()=>resolve()}});
 for(const [name,expected]of Object.entries(manifest.files)){
   const bytes=fs.readFileSync(path.join(dir,name));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),expected);
   vm.runInContext(bytes.toString(),ctx,{filename:name});
 }
 let timer;try{await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Interpreter startup timeout')),20000);})]);}finally{clearTimeout(timer);}
 ctx.jsRXCallback=ch=>output+=String.fromCharCode(ch);ctx.jsUpdateGfx=()=>{};ctx.jsInit();
 let seq=0;
 function value(expression){const mark='V_LOCAL_'+(++seq)+'_';output='';
   ctx.jsTransmitString('\x10(function(){try{print('+JSON.stringify(mark)+'+JSON.stringify({value:'+expression+'}));}catch(e){print('+JSON.stringify(mark)+'+JSON.stringify({error:String(e)}));}})()\n');ctx.jsStopIdle();
   const line=output.split(/\r?\n/).find(s=>s.includes(mark+'{'));if(!line)throw Error('No native reply');
   const result=JSON.parse(line.slice(line.indexOf(mark)+mark.length));if(result.error)throw Error(result.error);return result.value;}
 assert.equal(value('process.env.VERSION'),'2v29');
 const code=fs.readFileSync(path.join(root,'apps/veranode/core.js'));
 for(let offset=0;offset<code.length;offset+=384)value('require("Storage").write("displaycore.js",atob('+JSON.stringify(code.subarray(offset,offset+384).toString('base64'))+'),'+offset+(offset===0?','+code.length:'')+')');
 const result=value('(function(){var core=require("displaycore.js"),storage=require("Storage"),p=new core.DisplayPreferences(storage),before=p.read();var req={operationId:"native-display-1",expectedRevision:0,values:{brightnessPercent:65,standbySeconds:30,effect:"trace"}};var saved=p.set(req),replay=p.set(req),conflict=false;try{p.set({operationId:"stale",expectedRevision:0,values:req.values});}catch(e){conflict=true;}return {before:before,saved:saved,replay:replay,conflict:conflict,persisted:new core.DisplayPreferences(storage).read()};})()');
 assert.equal(result.before.brightnessPercent,100);assert.equal(result.saved.revision,1);assert.deepEqual(result.saved,result.replay);assert.equal(result.conflict,true);assert.deepEqual(result.saved,result.persisted);
 console.log(JSON.stringify({ok:true,interpreter:'2v29',hardware:false,result}));
}
main().then(()=>process.exit(0),e=>{console.error(e);process.exit(1);});
