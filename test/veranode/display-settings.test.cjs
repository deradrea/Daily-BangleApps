const test=require('node:test'),assert=require('node:assert/strict');
const {DisplayPreferences,DisplayState}=require('../../apps/veranode/core.js');
const {MemoryStorage,Clock}=require('./helpers.cjs');
const values={brightnessPercent:70,standbySeconds:30,effect:'trace'};
function request(extra={}){return {operationId:'operation-1',expectedRevision:0,values,...extra};}
test('missing preferences migrate legacy effect without writes; defaults preserve battery policy',()=>{
 const s=new MemoryStorage();s.write('veranode.face.json',JSON.stringify({style:'pulse'}));
 const p=new DisplayPreferences(s);assert.deepEqual(p.read(),{schema:1,revision:0,brightnessPercent:100,standbySeconds:10,effect:'pulse',lastOperation:null});
 assert.equal(s.read('veranode.display.json'),undefined);
});
test('CAS prevents stale overwrite; repeated operation never writes twice',()=>{
 const s=new MemoryStorage(),p=new DisplayPreferences(s);let writes=0;const write=s.write.bind(s);s.write=(...a)=>{writes++;write(...a);};
 assert.equal(p.set(request()).revision,1);p.set(request());assert.equal(writes,1);
 assert.throws(()=>p.set(request({operationId:'other'})),/cambiate/);
 assert.throws(()=>p.set(request({values:{...values,effect:'pulse'}})),/riutilizzato/);
 assert.equal(new DisplayPreferences(s).read().effect,'trace');
});
test('invalid inputs and corrupt storage never overwrite preferences or journals',()=>{
 const s=new MemoryStorage(),p=new DisplayPreferences(s);
 for(const v of [{...values,brightnessPercent:0},{...values,brightnessPercent:NaN},{...values,standbySeconds:11},{...values,effect:'bad'},{...values,extra:true}])assert.throws(()=>p.set(request({values:v})));
 s.write('veranode.display.json','broken');assert.throws(()=>p.set(request()),/illeggibili/);assert.equal(s.read('veranode.display.json'),'broken');
});
test('flash failure and lost write response are reconciled without another write',()=>{
 const s=new MemoryStorage(),p=new DisplayPreferences(s);s.fail=true;assert.throws(()=>p.set(request()),/non confermato/);s.fail=false;
 const write=s.write.bind(s);s.write=(...a)=>{write(...a);throw Error('lost acknowledgement');};assert.equal(p.set(request()).revision,1);
});
test('timeout change keeps off, pinned and alert modes and renews only temporary display',()=>{
 const clock=new Clock(),p=new DisplayState(clock,()=>{},()=>{},{});p.setTimeoutSeconds(30);assert.equal(p.mode,'off');p.show('pinned');p.setTimeoutSeconds(5);clock.advance(10000);assert.equal(p.mode,'pinned');p.show('temporary');p.setTimeoutSeconds(15);clock.advance(14999);assert.equal(p.mode,'temporary');clock.advance(1);assert.equal(p.mode,'off');p.dispose();
});
