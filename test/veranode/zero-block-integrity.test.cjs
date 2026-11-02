const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'initialization/zero/integrity.js'),'utf8'),{createBlockIntegrity}=require('../../bin/build-veranode-zero.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function prefix(b){const n=Buffer.alloc(4);n.writeUInt32BE(b.length);let parts=[Buffer.from('VZP1'),n];for(let i=0;i<b.length;i+=1024)parts.push(crypto.createHash('sha256').update(b.subarray(i,i+1024)).digest());return sha(Buffer.concat(parts));}
function fixture(data){let content=Buffer.from(data),sizes=[];const manifest=createBlockIntegrity([{name:'app',base64:data.toString('base64')}]);const c={SHA256(s){assert.ok(s.length<=4096,'large native hash forbidden');sizes.push(s.length);return crypto.createHash('sha256').update(Buffer.from(s,'latin1')).digest();}};const ctx={exports:{},Uint8Array,E:{toString:b=>Buffer.from(b).toString('latin1')}};vm.runInNewContext(source,ctx);const adapter=ctx.exports.create(c,(_n,at,size)=>at===undefined?content.toString('latin1'):content.subarray(at,at+size).toString('latin1'),manifest);return {adapter,manifest,sizes,set:b=>{content=Buffer.from(b);}};}
test('ordered block manifest verifies every byte with bounded native inputs including repeated checks',()=>{
 for(const size of [1,384,1023,1024,1025,46993,100000]){const data=Buffer.from(Array.from({length:size},(_,i)=>(i*31+Math.floor(i/1024))%256)),f=fixture(data),file={name:'app',size,sha256:sha(data)};
  for(let i=0;i<3;i++)assert.equal(f.adapter.matches('flash',file),true);
  assert.ok(Math.max(...f.sizes)<=1024);
  for(const at of new Set([0,Math.floor(size/2),size-1])){const changed=Buffer.from(data);changed[at]^=1;f.set(changed);assert.equal(f.adapter.matches('flash',file),false);}
  f.set(data.subarray(0,size-1));assert.equal(f.adapter.matches('flash',file),false);
  f.set(data);for(const n of [0,Math.min(384,size),size]){const p=f.adapter.prefix('flash',n);assert.equal(p.prefixDigestAlgorithm,'sha256-chunks-1024-v1');assert.equal(p.prefixDigest,prefix(data.subarray(0,n)));}
 }
});
test('missing, reordered or malformed chunk manifests cannot claim integrity',()=>{
 const data=Buffer.from(Array.from({length:3072},(_,i)=>Math.floor(i/1024))),f=fixture(data),file={name:'app',size:data.length};
 const hashes=f.manifest.hashes.app;f.manifest.hashes.app=hashes.slice(64,128)+hashes.slice(0,64)+hashes.slice(128);assert.equal(f.adapter.matches('flash',file),false);
 f.manifest.hashes.app=hashes.slice(0,-1);assert.throws(()=>f.adapter.matches('flash',file),/Digest/);delete f.manifest.hashes.app;assert.throws(()=>f.adapter.matches('flash',file),/Digest/);
 assert.throws(()=>f.adapter.hash('x'.repeat(4097)),/limite/);
});
test('native 2v29 verifies large flash files and prefixes with full-file flat allocation forbidden',{timeout:90000},()=>{
 const data=Buffer.from(Array.from({length:46993},(_,i)=>(i*31+Math.floor(i/1024))%256)),manifest=createBlockIntegrity([{name:'app',base64:data.toString('base64')}]);
 const expressions=['(function(){var native=require("crypto").SHA256;global.maxNativeHash=0;require("crypto").SHA256=function(s){maxNativeHash=Math.max(maxNativeHash,s.length);if(s.length>4096)throw Error("Large native hash forbidden");return native(s);};E.toFlatString=function(){throw Error("Flat copy forbidden");};var exports={};'+source+';global.checker=exports.create(require("crypto"),require("Storage").read.bind(require("Storage")),'+JSON.stringify(manifest)+');return process.env.VERSION;})()'];
 for(let at=0;at<data.length;at+=384)expressions.push('require("Storage").write("app",atob('+JSON.stringify(data.subarray(at,at+384).toString('base64'))+'),'+at+(at===0?','+data.length:'')+')');
 const checks=[];for(let i=0;i<4;i++){checks.push(expressions.length);expressions.push('checker.matches("app",{name:"app",size:'+data.length+'})');}
 const prefixAt=expressions.length;expressions.push('checker.prefix("app",'+data.length+')');const corruptAt=expressions.length;expressions.push('(function(){var s=require("Storage");for(var at=0;at<46993;at+=384){var part=s.read("app",at,Math.min(384,46993-at));if(at<=27000&&at+part.length>27000){var index=27000-at;part=part.slice(0,index)+String.fromCharCode(part.charCodeAt(index)^1)+part.slice(index+1);}s.write("corrupt",part,at,at===0?46993:undefined);}return checker.matches("corrupt",{name:"app",size:'+data.length+'});})()');expressions.push('maxNativeHash');
 const r=cp.spawnSync(process.execPath,[path.resolve(root,'../vera-mobile/flutter-app/test/fixtures/espruino_hash_device.cjs')],{input:expressions.map(JSON.stringify).join('\n')+'\n',encoding:'utf8',timeout:85000,maxBuffer:2000000});assert.equal(r.status,0,r.stderr);const rows=r.stdout.trim().split(/\r?\n/).map(JSON.parse);for(const row of rows)assert.equal(row.ok,true,JSON.stringify(row));assert.equal(rows[0].value,'2v29');for(const at of checks)assert.equal(rows[at].value,true);assert.equal(rows[prefixAt].value.prefixDigest,prefix(data));assert.equal(rows[corruptAt].value,false);assert.ok(rows.at(-1).value<=4096);
});
