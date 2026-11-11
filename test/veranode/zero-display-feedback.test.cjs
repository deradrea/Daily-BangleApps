const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
  const strings=[],polys=[],dots=[],g={getWidth:()=>176,stringWidth:s=>s.length*6};
  for(const name of ['reset','setBgColor','setFontAlign','setColor','setFont','fillRect','drawRect','drawCircle','drawPoly','flip'])g[name]=()=>g;
  g.clear=()=>{polys.length=0;dots.length=0;return g;};
  g.fillPoly=points=>{polys.push(Array.from(points));return g;};
  g.fillCircle=(...args)=>{dots.push(args);return g;};
  g.drawString=text=>{strings.push(String(text));return g;};
  let interval;
  const context={exports:{},global:{},g,Bangle:{setLCDPower(){},setBacklight(){},setLCDBrightness(){},setLocked(){}},setInterval:fn=>{interval=fn;return 1;},clearInterval(){}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../initialization/zero/display.js'),'utf8'),context);
  return {ui:context.exports.create(),strings,polys,dots,advance:n=>{for(let i=0;i<n;i++)interval();}};
}
test('progress arc follows real counters while the separate dot animates',()=>{
  const f=fixture();f.ui.set('upload',5120,10240);f.advance(72);
  assert.equal(f.ui.status().step,2);assert.equal(f.ui.status().lastUpdateSeconds,18);
  assert.equal(f.polys.length,24);
  const dot=f.dots[2];f.advance(1);
  assert.notDeepEqual(f.dots[2],dot);assert.equal(f.polys.length,24);
  f.ui.set('upload',7680,10240);assert.equal(f.ui.status().lastUpdateSeconds,0);
  f.advance(1);assert.equal(f.polys.length,36);
  assert.deepEqual([...new Set(f.strings)],['Preparazione','Trasferimento']);
});
test('failure and disconnect direct the user to the app without suggesting success',()=>{
  for(const phase of ['error','paused']){
    const f=fixture();f.ui.set(phase,0,0);f.advance(8);
    assert.equal(f.ui.status().step,null);assert(f.strings.includes('Riprendi dalla app'));
    assert.equal(f.polys.length,0);assert.equal(f.ui.status().consentVisible,false);
  }
});
