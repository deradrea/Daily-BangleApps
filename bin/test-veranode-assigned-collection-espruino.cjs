/* Pinned Espruino 2v29 interpreter, no BLE/hardware. Assigned App authorization and persistent binding on native Storage.
 * BLE transport/bond status are simulated; this is not hardware acceptance. */
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

 for(const name of ['core','runtime','wire']) {
  const code=fs.readFileSync(path.join(root,'apps/veranode/'+name+'.js'));
  for(let offset=0;offset<code.length;offset+=384)value('require("Storage").write("veranode.'+name+'.js",atob('+JSON.stringify(code.subarray(offset,offset+384).toString('base64'))+'),'+offset+(offset===0?','+code.length:'')+')');
 }
 const result=value('(function(){var core=require("veranode.core.js"),storage=require("Storage"),prompts=0,parts=[],jobs=[],clock={now:Date.now,setInterval:function(){return 1;},clearInterval:function(){},setTimeout:function(f,ms){if(ms<1000)jobs.push(f);return jobs.length+1;},clearTimeout:function(){}},mac="DF:B7:68:30:4C:46",user="11111111-1111-4111-8111-111111111111",scope="https://vera.test."+user+".2";var node=require("veranode.runtime.js").create({core:core,storage:storage,clock:clock,mac:mac,hrm:function(){return true;},on:function(){},off:function(){}});var server=require("veranode.wire.js").create({node:node,mac:mac,clock:clock,encrypted:function(){return true;},bonded:function(){return true;},chunkSize:function(){return 180;},consent:function(v){if(v)prompts++;},send:function(s){parts.push(s);}});function cmd(r){parts=[];var text=JSON.stringify(r)+String.fromCharCode(10);server.receive(text.split("").map(function(c){return c.charCodeAt(0);}));while(jobs.length)jobs.shift()();var body=parts.join("").trim();return body?JSON.parse(body):null;}var req={id:"auth",op:"authorize",user:user,scope:scope,mac:mac,relayKey:"12345678-1234-4123-8123-123456789abc"};var first=cmd(req);if(!first)throw new Error(JSON.stringify({management:node.state.management,parts:parts}));var saved=core.unpack(storage.read("veranode.owner"));server.reset();req.scope="other";var foreign=cmd(req);var collectionPrompts=prompts;delete req.relayKey;req.scope=scope;var management=cmd(req);return {authorized:first.result.authorized,method:first.result.authorization,persisted:saved.user===user&&saved.scope===scope,foreignDenied:foreign.ok===false,managementPending:management===null,collectionPrompts:collectionPrompts,prompts:prompts};})()');
 assert.equal(result.authorized,true);assert.equal(result.method,'assigned-bond-v1');assert.equal(result.persisted,true);assert.equal(result.foreignDenied,true);assert.equal(result.managementPending,true);assert.equal(result.collectionPrompts,0);assert.equal(result.prompts,1);
 const crcResult=value('(function(){var parts=[],jobs=[],wire=require("veranode.wire.js"),server=wire.create({node:{state:{}},encrypted:function(){return false;},crc32:E.CRC32,chunkSize:function(){return 180;},clock:{setTimeout:function(f){jobs.push(f);return jobs.length;},clearTimeout:function(){}},send:function(s){parts.push(s);}});server.receive(JSON.stringify({id:"crc",op:"link_security",integrity:true,checksum:"crc32"}).split("").map(function(c){return c.charCodeAt(0);}).concat([10]));while(jobs.length)jobs.shift()();var text=parts.join("").trim(),pos=text.lastIndexOf("#c"),body=text.slice(0,pos);return {vector:E.CRC32("123456789"),valid:pos>0&&parseInt(text.slice(pos+2),16)===E.CRC32(body),encrypted:JSON.parse(body).result.encrypted};})()');
 assert.equal(crcResult.vector,0xcbf43926);assert.equal(crcResult.valid,true);assert.equal(crcResult.encrypted,false);
 console.log(JSON.stringify({ok:true,interpreter:'2v29',hardware:false,result,crcResult}));
}
main().then(()=>process.exit(0),e=>{console.error(e);process.exit(1);});
