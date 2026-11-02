const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),source=Buffer.from(JSON.parse(fs.readFileSync(path.join(root,'dist/veranode-zero/veranode-zero-1-97c1c49395f1698e/initialize.json'))).bootstrap.find(f=>f.name==='vz.platform.js').base64,'base64').toString();
const sha=s=>crypto.createHash('sha256').update(s,'latin1').digest('hex');
function adapter(options={}){
 let calls=0,flattened=0;
 const native={SHA256(x){calls++;if(typeof x==='string'&&x.length>1024)throw Error(options.error||'Not enough stack memory for data');return crypto.createHash('sha256').update(typeof x==='string'?Buffer.from(x,'latin1'):x).digest();}};
 const sandbox={exports:{},global:{},atob,Uint8Array,require(n){if(n==='Storage')return {read(){}};if(n==='crypto')return native;if(n==='vz.target.js')return {files:[]};throw Error(n);},E:{toFlatString(x){flattened++;return options.noMemory?undefined:Buffer.from(x,'latin1');}}};
 vm.runInNewContext(source,sandbox);return {hash:sandbox.exports.create().hash,counts:()=>({calls,flattened})};
}
test('zero hash preserves every byte across stack fallback, empty input and corrupt content',()=>{
 for(const n of [0,64,1024,1025,7108,46993,100000]){const data=Buffer.from(Array.from({length:n},(_,i)=>i%256)).toString('latin1'),a=adapter();assert.equal(a.hash(data),sha(data));assert.equal(a.counts().flattened,n>1024?1:0);if(n){const changed=String.fromCharCode(data.charCodeAt(0)^1)+data.slice(1);assert.notEqual(a.hash(changed),sha(data));}}
});
test('zero hash propagates unrelated errors and fails explicitly if flat allocation fails',()=>{
 const a=adapter({error:'Other failure'});assert.throws(()=>a.hash('x'.repeat(5000)),/Other failure/);assert.equal(a.counts().flattened,0);
 const b=adapter({noMemory:true});assert.throws(()=>b.hash('x'.repeat(5000)),/Memoria temporanea insufficiente.*ripresa conservata/);assert.equal(b.counts().calls,1);
});
test('official 2v29 interpreter hashes flash files using real flat strings after constrained-stack rejection',{timeout:60000},()=>{
 const fixture=path.resolve(root,'../vera-mobile/flutter-app/test/fixtures/espruino_hash_device.cjs');
 const setup='(function(){Modules.addCached("vz.target.js","exports={files:[]};");Modules.addCached("vz.platform.js",'+JSON.stringify(source)+');global.envHash=require("vz.platform.js").create();var c=require("crypto"),native=c.SHA256,flat=E.toFlatString;global.flatReady=false;global.stackRejections=0;E.toFlatString=function(x){var r=flat(x);global.flatReady=typeof r==="string"&&E.getAddressOf(r,true)!==0;return r;};c.SHA256=function(x){if(x.length>4096&&!global.flatReady){global.stackRejections++;throw Error("Not enough stack memory for data");}global.flatReady=false;return native(x);};return process.env.VERSION;})()';
 const expressions=[setup];const expected=[];
 for(const n of [7108,46993]){const data=Buffer.from(Array.from({length:n},(_,i)=>i%256));expected.push(sha(data.toString('latin1')));for(let offset=0;offset<data.length;offset+=384)expressions.push('require("Storage").write("hash.fixture",atob('+JSON.stringify(data.subarray(offset,offset+384).toString('base64'))+'),'+offset+(offset===0?','+data.length:'')+')');expressions.push('envHash.hash(require("Storage").read("hash.fixture"))');}
 expressions.push('stackRejections');
 const result=cp.spawnSync(process.execPath,[fixture],{input:expressions.map(JSON.stringify).join('\n')+'\n',encoding:'utf8',timeout:55000,maxBuffer:1000000});assert.equal(result.status,0,result.stderr);
 const rows=result.stdout.trim().split(/\r?\n/).map(JSON.parse);for(const row of rows)assert.equal(row.ok,true,JSON.stringify(row));assert.equal(rows[0].value,'2v29');assert.deepEqual(rows.filter(r=>typeof r.value==='string'&&r.value.length===64).map(r=>r.value),expected);assert.equal(rows.at(-1).value,2);
});
