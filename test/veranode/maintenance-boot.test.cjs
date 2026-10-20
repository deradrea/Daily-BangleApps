const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const guard=fs.readFileSync(path.resolve(__dirname,'../../maintenance/veranode/guard.js'),'utf8');
function run(state,broken=false){
 const files={'veranode.app.js':'original face','veranode.policy.json':JSON.stringify({user:'u',scope:'s',mac:'DF:B7:68:30:4C:46'})};if(state||broken)files['veram.state0']='journal';
 const storage={read:n=>files[n],readJSON:n=>JSON.parse(files[n])};
 const g={};const context=vm.createContext({global:g,require:n=>{if(n==='Storage')return storage;if(n==='veram.platform.js')return {create:()=>({load:()=>{if(broken)throw Error('torn');if(!state)throw Error('absent');return state;}})};throw Error(n);}});
 vm.runInContext(guard,context);return {g,storage};
}
test('ordinary boot stays unmodified without an operation or after complete/rollback',()=>{
 for(const phase of [undefined,'complete','rolled-back','activation-pending']){const r=run(phase?{phase}:undefined);assert.equal(r.g.VeraIsolatedMaintenance,undefined);assert.equal(r.storage.read('veranode.app.js'),'original face');}
});
test('pending and corrupt operation block collector startup and route only the clock to recovery UI',()=>{
 for(const kind of ['prepared','writing','backup','broken']){const r=run({phase:kind},kind==='broken');assert.equal(r.g.VeraIsolatedMaintenance,true);assert.equal(r.g.VeraNode.state.running,false);assert.match(r.storage.read('veranode.app.js'),/veram.app.js/);assert.equal(r.storage.read('veranode.policy.json'),JSON.stringify({user:'u',scope:'s',mac:'DF:B7:68:30:4C:46'}));assert.equal(r.g.VeraMaintenanceStorageRead('veranode.app.js'),'original face');}
});
