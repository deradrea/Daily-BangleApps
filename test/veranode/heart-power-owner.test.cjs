const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
function fixture(original = true) {
  let env, powered = false, wear = original, fail = false;
  const calls = [];
  const c = {global:{},Date,setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},
    require:name=>name==='Storage'?{readJSON:()=>undefined}:name==='veranode.runtime.js'?{create:e=>{env=e;return {state:{}};}}:name==='veranode.wire.js'?{service:'s',request:'q',response:'r',create:()=>({})}:{},
    bleServices:{},bleServiceOptions:{},
    Bangle:{getOptions:()=>({hrmWearDetect:wear}),setOptions:o=>{calls.push(['wear',o.hrmWearDetect]);if(fail)throw Error('option unavailable');wear=o.hrmWearDetect;},setHRMPower:(on,owner)=>{calls.push(['power',on,owner]);powered=on;if(on)wear=true;return powered;}},
    NRF:{getAddress:()=> 'AA:BB:CC:DD:EE:02',on:()=>{}},E:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../apps/veranode/boot.js'),'utf8'),c);
  return {hrm:on=>env.hrm(on),calls,wear:()=>wear,powered:()=>powered,fail:()=>fail=true};
}
test('optical acquisition disables proximity suspension after firmware power-up',()=>{
  const f=fixture();assert.equal(f.hrm(true),true);
  assert.deepEqual(f.calls,[['power',true,'veranode'],['wear',false]]);
  assert.equal(f.wear(),false);f.hrm(false);assert.equal(f.wear(),true);assert.equal(f.powered(),false);
});
test('repeated acquisitions preserve the original option and restore only at stop',()=>{
  const f=fixture();f.hrm(true);f.hrm(true);f.hrm(false);assert.equal(f.wear(),true);
  f.hrm(true);f.hrm(false);assert.equal(f.wear(),true);
});
test('an originally disabled proximity detector stays disabled after stop',()=>{
  const f=fixture(false);f.hrm(true);f.hrm(false);assert.equal(f.wear(),false);
});
test('failed optical configuration releases Vera power and surfaces the failure',()=>{
  const f=fixture();f.fail();assert.throws(()=>f.hrm(true),/option unavailable/);assert.equal(f.powered(),false);
});


