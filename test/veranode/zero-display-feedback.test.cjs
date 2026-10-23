const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
  const strings=[],g={getWidth:()=>176};
  for(const name of ['reset','setBgColor','clear','setFontAlign','setColor','setFont','fillCircle','fillRect','flip'])g[name]=()=>g;
  g.drawString=(text)=>{strings.push(String(text));return g;};
  let interval;
  const context={exports:{},global:{},g,Bangle:{setLCDPower(){},setBacklight(){},setLCDBrightness(){},setLocked(){}},setInterval:fn=>{interval=fn;return 1;},clearInterval(){}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../initialization/zero/display.js'),'utf8'),context);
  return {ui:context.exports.create(),strings,advance:n=>{for(let i=0;i<n;i++)interval();}};
}
test('watch progress uses real counters; waiting animation never increases percent',()=>{
  const f=fixture();f.ui.set('upload',5120,10240);f.advance(18);
  assert.equal(f.ui.status().step,2);assert.equal(f.ui.status().lastUpdateSeconds,18);
  assert(f.strings.includes('50%'));assert(!f.strings.includes('51%'));
  assert(f.strings.includes('Attendo la app: 18 s'));
  f.ui.set('upload',7680,10240);assert.equal(f.ui.status().lastUpdateSeconds,0);
  assert(f.strings.includes('75%'));
});
test('failure and disconnect direct the user to the app without suggesting success',()=>{
  for(const phase of ['error','paused']){
    const f=fixture();f.ui.set(phase,0,0);f.advance(2);
    assert.equal(f.ui.status().step,null);assert(f.strings.includes('Vedi dettagli nella app'));
    assert(!f.strings.includes('100%'));assert.equal(f.ui.status().consentVisible,false);
  }
});
