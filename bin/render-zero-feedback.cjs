/* Render the actual display source in pinned Espruino. No hardware access. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||path.join(root,'output/zero-ui-review'));fs.mkdirSync(out,{recursive:true});
const current=fs.readFileSync(path.join(root,'initialization/zero/display.js'),'utf8');
const old=JSON.parse(fs.readFileSync(path.join(root,'dist/veranode-zero/veranode-zero-1-f543c527f7f09670/initialize.json'))).bootstrap.find(f=>f.name==='vz.display.js');
const cases=[['before','upload',53248,136070],['preparing','preparing',0,0],['transfer','upload',53248,136070],['transfer-complete','upload',136070,136070],['protected','quarantining',3,8],['wipe','wiping',12,28],['install','installing',7,13],['restart','activation-pending',0,0],['complete','complete',14,14],['paused','paused',0,0],['error','error',0,0]];
const expr=[];const frameIndices=[];
expr.push('(function(){global.drawBoxes=[];global.uiInterval=null;global.uiClock=0;global.setInterval=function(f){uiInterval=f;return 1;};global.clearInterval=function(){};var draw=g.drawString;g.drawString=function(s,x,y){var h=g.getFontHeight(),w=g.stringWidth(s);drawBoxes.push({text:String(s),x:x,y:y,width:w,height:h});return draw.call(g,s,x,y);};return process.env.VERSION;})()');
for(const [name,phase,done,total] of cases){const source=name==='before'?Buffer.from(old.base64,'base64').toString():current;expr.push('(function(){var exports={};'+source+';if(global.reviewDisplay)reviewDisplay.dispose();global.reviewDisplay=exports.create();drawBoxes=[];reviewDisplay.set('+JSON.stringify(phase)+','+done+','+total+');uiInterval();return true;})()');frameIndices.push(expr.length);expr.push('(function(){var pixels=new Uint8Array(176*176);for(var y=0;y<176;y++)for(var x=0;x<176;x++){var v=g.getPixel(x,y);pixels[y*176+x]=(v&63488?4:0)|(v&2016?2:0)|(v&31?1:0);}return {name:'+JSON.stringify(name)+',pixelsBase64:btoa(pixels.buffer),boxes:drawBoxes};})()');}
const fixture=path.resolve(root,'../vera-mobile/flutter-app/test/fixtures/espruino_hash_device.cjs');
const r=cp.spawnSync(process.execPath,[fixture],{input:expr.map(JSON.stringify).join('\n')+'\n',encoding:'utf8',timeout:120000,maxBuffer:12000000});assert.equal(r.status,0,r.stderr);
const rows=r.stdout.trim().split(/\r?\n/).map(JSON.parse);for(const row of rows)assert.equal(row.ok,true,JSON.stringify(row));assert.equal(rows[0].value,'2v29');
const frames=frameIndices.map(i=>rows[i].value);
for(const frame of frames){if(frame.name==='before')continue;for(const box of frame.boxes){
 assert.ok(box.width<=156,frame.name+': text wider than safe area: '+box.text);
 const centered=box.y===96,top=box.y-(centered?box.height/2:0),bottom=top+box.height;
 assert.ok(top>=0&&bottom<=175,frame.name+': vertical clipping: '+box.text);
 if(centered){assert.ok(box.width<=40&&box.height<=24,'ring text must stay inside ring');}
 else assert.ok(bottom<=68||top>=128,frame.name+': text overlaps progress ring: '+box.text);
 }}
assert.ok(frames.find(f=>f.name==='transfer-complete').boxes.some(b=>b.text==='133 / 133 kB'));
assert.ok(frames.find(f=>f.name==='error').boxes.some(b=>b.text==='Procedura conservata'));
fs.writeFileSync(path.join(out,'native-frames.json'),JSON.stringify({interpreter:'2v29',width:176,height:176,hardware:false,frames}));console.log(JSON.stringify({output:out,frames:frames.map(f=>f.name),hardware:false}));
