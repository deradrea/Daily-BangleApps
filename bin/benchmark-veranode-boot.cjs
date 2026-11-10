
/* Timing regression on pinned Espruino with synthetic native Storage files. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const manifest = require('../test/veranode/fixtures/espruino-emulator-2v29.json');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const dir = process.env.VERA_ESPRUINO_EMULATOR_DIR ||
  path.join(os.tmpdir(), 'vera-espruino-2v29', manifest.commit);

async function measure(files, records, cached) {
  let output = '', resolve;
  const ready = new Promise(done => resolve = done);
  const ctx = vm.createContext({console:{log(){},warn(){},error(){}}, require, process,
    Buffer, __dirname:dir, setTimeout,clearTimeout,setInterval,clearInterval,
    Module:{noInitialRun:true,onRuntimeInitialized:resolve}});
  for (const [name, hash] of Object.entries(manifest.files)) {
    const bytes = fs.readFileSync(path.join(dir, name));
    assert.equal(sha(bytes), hash);
    vm.runInContext(bytes.toString(), ctx, {filename:name});
  }
  await ready;
  ctx.jsRXCallback = ch => output += String.fromCharCode(ch);
  ctx.jsUpdateGfx = () => {};
  ctx.jsInit();
  let counter = 0;
  function value(expression) {
    const marker = 'BOOT_TEST_' + (++counter) + '_';
    output = '';
    ctx.jsTransmitString('\x10(function(){try{print('+JSON.stringify(marker)+
      '+JSON.stringify({value:'+expression+'}));}catch(e){print('+JSON.stringify(marker)+
      '+JSON.stringify({error:String(e)}));}})()\n');
    ctx.jsStopIdle();
    const line = output.split(/\r?\n/).find(x => x.includes(marker+'{'));
    if (!line) throw Error('No interpreter reply: '+output.slice(-500));
    const reply = JSON.parse(line.slice(line.indexOf(marker)+marker.length));
    if (reply.error) throw Error(reply.error);
    return reply.value;
  }
  assert.equal(value('process.env.VERSION'), '2v29');
  for (const file of files) {
    if (!file.name.startsWith('veranode.')) continue;
    let bytes = Buffer.from(file.base64,'base64');
    if (file.name === 'veranode.app.js') {
      const code = bytes.toString();
      assert.ok(code.includes('if (!ui.alert) ui.show("temporary");'));
      bytes = Buffer.from(code.replace('if (!ui.alert) ui.show("temporary");',
        'if (!ui.alert) ui.show("temporary"); global.testFaceAt = Date.now();'));
    }
    if (file.name === 'veranode.runtime.js') {
      const code = bytes.toString();
      assert.ok(code.includes('if (env.progress) env.progress("Pronto"'));
      bytes = Buffer.from(code.replace('if (env.progress) env.progress("Pronto"',
        'global.testCollectionAt = Date.now(); if (env.progress) env.progress("Pronto"'));
    }
    for (let offset = 0; offset < bytes.length; offset += 384) {
      value('require("Storage").write('+JSON.stringify(file.name)+',atob('+
        JSON.stringify(bytes.subarray(offset,offset+384).toString('base64'))+'),'+
        offset+(offset===0?','+bytes.length:'')+')');
    }
  }
  value('require("Storage").write("veranode.sack0",require("veranode.core.js").pack({generation:0,ack:0,epoch:"startup-fixture"}))');
  for (let i = 0; i < records/32; i++) {
    value('(function(){var s=require("Storage"),core=require("veranode.core.js"),name="veranode.s'+i+
      '",f=s.open(name,"a");for(var k=1;k<=32;k++){var seq='+i*32+
      '+k;f.write(core.pack({seq:seq,kind:"sample",ts:1760000000000+seq*30000,data:{scope:"fixture",values:{battito:{value:72,quality:98},temperatura:{value:24.5},movimento:{value:1.02}}}})+"\\n");}'+
      (cached?'var raw=s.open(name,"r").read(60000);s.write(name+"idx",core.pack({epoch:"startup-fixture",count:32,last:'+((i+1)*32)+',hash:E.CRC32(raw),bytes:raw.length}));':'')+
      'return true;})()');
  }
  value('(function(){var s=require("Storage");global.bleServices={};global.bleServiceOptions={};global.__FILE__="veranode.app.js";'+
    'Bangle.setHRMPower=function(on){return on;};global.testBootAt=Date.now();eval(s.read("veranode.boot.js"));eval(s.read("veranode.app.js"));return true;})()');
  ctx.jsIdle();
  const deadline = Date.now()+90000;
  let result;
  while (Date.now()<deadline) {
    await new Promise(done=>setTimeout(done,30));
    result=value('({error:VeraBoot.error,clockMs:VeraBoot.firstClockMs,'+
      'faceMs:global.testFaceAt===undefined?null:global.testFaceAt-testBootAt,'+
      'collectionMs:global.testCollectionAt===undefined?null:global.testCollectionAt-testBootAt,'+
      'running:!!global.VeraNode&&VeraNode.health().scheduled,'+
      'pending:global.VeraNode?VeraNode.samples.pending():null,'+
      'next:global.VeraNode?VeraNode.samples.next:null})');
    if (result.error) throw Error(result.error);
    if (result.faceMs!==null && result.collectionMs!==null) break;
    ctx.jsIdle();
  }
  ctx.jsStopIdle();
  assert.ok(result.running && result.faceMs!==null && result.collectionMs!==null,JSON.stringify(result));
  // The immediate acquisition can append one record. All fixture records must remain pending.
  assert.ok(result.pending===records || result.pending===records+1,JSON.stringify(result));
  assert.equal(result.next,result.pending+1);
  if (result.clockMs===undefined) result.clockMs=result.faceMs;
  return result;
}

async function main() {
  const [stablePath,betaPath,release,scenario] = process.argv.slice(2);
  const stableBytes = fs.readFileSync(stablePath);
  assert.equal(sha(stableBytes),'8480a61d50ed748ca18a5e35b436210fb20d9e438b579b6126d08bcd090914fc');
  const stable = JSON.parse(stableBytes).target.files;
  const beta = JSON.parse(fs.readFileSync(betaPath)).files;
  const records = scenario==='empty' ? 0 : 2880;
  assert.ok(['stable','beta'].includes(release) && ['empty','full','indexed'].includes(scenario));
  const result = await measure(release==='stable'?stable:beta,records,scenario==='indexed');
  console.log(JSON.stringify({release,scenario,records,interpreter:'2v29',hardware:false,...result}));
}
main().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
