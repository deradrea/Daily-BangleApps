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
 const code=fs.readFileSync(path.join(root,'apps/veranode/clock.js'));
 for(let offset=0;offset<code.length;offset+=384)value('require("Storage").write("localclock.js",atob('+JSON.stringify(code.subarray(offset,offset+384).toString('base64'))+'),'+offset+(offset===0?','+code.length:'')+')');
 const result=value('(function(){var now=1792051200000,rows=[],history={checkpoint:{epoch:"time"},next:1,stats:function(){return {available:64};},append:function(type,at,data){rows.push(data);return {seq:this.next++};}},samples={checkpoint:{epoch:"samples"},next:7};var tracker=require("localclock.js").create({core:{unpack:function(){return null;}},storage:require("Storage"),clock:{now:function(){return now;},setWall:function(ms){now=ms;}},history:history,samples:samples});tracker.start();var s=tracker.status();var r=tracker.manual({epoch:s.epoch,revision:s.revision,boot:s.boot,utcMs:1792054800000,timezoneMinutes:120});var date=new Date(Date.parse("2026-10-27T12:30:00Z"));return {quality:r.quality,now:r.nowMs,types:rows.map(function(x){return x.type;}),boundary:rows[2].fromSequence,validUntil:r.validUntil,utcYear:date.getFullYear(),utcMinutes:date.getMinutes(),offsetType:typeof date.getTimezoneOffset()};})()');
 assert.equal(result.quality,'manual_device');assert.equal(result.now,1792054800000);
 assert.deepEqual(result.types,['boot','manual_intent','manual_applied']);assert.equal(result.boundary,7);
 assert.equal(result.validUntil,null);assert.equal(result.utcYear,2026);assert.equal(result.utcMinutes,30);assert.equal(result.offsetType,'number');
 console.log(JSON.stringify({ok:true,interpreter:'2v29',hardware:false,result}));
}
main().then(()=>process.exit(0),e=>{console.error(e);process.exit(1);});
