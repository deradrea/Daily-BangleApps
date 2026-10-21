/* Separate immutable preserving-upgrade artifact. Existing first-install assets remain untouched. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),acorn=require('acorn'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const sources=[
 ['test/veranode/fixtures/c212/package.json','838057b1fa2260cfc816f6db83b75649622017681ca971b4fa3a5dba0fa8e562'],
 ['dist/veranode/veranode-0.2.0-dev-545d8915cd396d71/package.json','7b52d46b446d497ee914c668065df70f7d2f9871f5f79ffeb35b0015c16df42a']];
function build(output=path.join(root,'dist/veranode-upgrade'),options={}){
 const sourceCommit=cp.execFileSync('git',['rev-parse',(options.sourceCommit||'HEAD')+'^{commit}'],{cwd:root,encoding:'utf8'}).trim(),inputs={};
 function committed(relative){const bytes=cp.execFileSync('git',['show',sourceCommit+':'+relative],{cwd:root});inputs[relative]=hash(bytes);return bytes;}
 const packages=sources.map(([name,expected])=>{const raw=committed(name);if(hash(raw)!==expected)throw Error('Source package changed');const p=JSON.parse(raw);for(const f of p.files){const b=Buffer.from(f.base64,'base64');if(b.length!==f.size||hash(b)!==f.sha256)throw Error('File changed');}return {packageSha256:expected,revision:p.revision,files:p.files};});
 const sidecar=[['veram.provider.js','provider.js'],['veram.platform.js','platform.js'],['veram.0.boot.js','guard.js'],['veram.app.js','app.js']].map(([name,src])=>{
  const bytes=committed('maintenance/veranode/'+src);acorn.parse(bytes.toString('utf8'),{ecmaVersion:2015});return {name,size:bytes.length,sha256:hash(bytes),base64:bytes.toString('base64')};
 });
 const target=packages[1],rows=files=>files.map(({name,size,sha256})=>({name,size,sha256}));
 const bootupdate=committed('apps/boot/bootupdate.js'),bootloader=committed('apps/boot/bootloader.js');
 const crlf=bytes=>Buffer.from(bytes.toString('utf8').replace(/\r?\n/g,'\r\n'));
 const variants=bytes=>[...new Set([hash(bytes),hash(crlf(bytes))])];
 const plan={schema:'vera-bangle-preserving-upgrade/1',board:'BANGLEJS2',firmware:['2v29'],mode:'preserving-upgrade',
  preservesFirmware:true,preserveSamples:true,preserveProfile:true,eraseAllowed:false,protocolVersion:1,
  sourceRepository:'https://github.com/deradrea/Daily-BangleApps',
  target:{revision:target.revision,packageSha256:target.packageSha256,files:target.files},
  sources:packages.map(p=>({revision:p.revision,packageSha256:p.packageSha256,files:rows(p.files),journalCompatibility:'veranode-journal-crc16/1'})),
  maintenance:{protocol:1,files:sidecar,bootloader:{cache:'bangle-boot0-v1',
   bootupdateSha256:hash(crlf(bootupdate)),bootloaderSha256:hash(crlf(bootloader))},
   acceptedBootloaderSha256:variants(bootloader),acceptedBootupdateSha256:variants(bootupdate),
   backupExclusions:['veram.provider.js','veram.platform.js','veram.0.boot.js','veram.app.js','veram.stage','veram.old','veram.state0','veram.state1','veram.plan.json','.boot0','.widcache','.clkinfocache'],
   recovery:'per-file-old-copy-sha256',activation:'explicit-after-verification'},
  provenance:{sourceCommit,bootloaderPrimaryNormalization:'crlf',builderSha256:hash(committed('bin/build-veranode-upgrade.cjs')),inputs},hardwareValidated:false};
 const payload=Buffer.from(JSON.stringify(plan,null,2)+'\n'),sha256=hash(payload),revision='veranode-upgrade-1-'+sha256.slice(0,16),directory=path.join(output,revision);
 fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'upgrade.json');if(fs.existsSync(file)){if(!fs.readFileSync(file).equals(payload))throw Error('Immutable artifact conflict');}else fs.writeFileSync(file,payload,{flag:'wx'});
 const descriptor={schema:'vera-bangle-upgrade-descriptor/1',revision,sha256,size:payload.length,targetRevision:target.revision,
  targetPackageSha256:target.packageSha256,executionEnabled:false,hardwareValidated:false};
 const dfile=path.join(directory,'descriptor.json'),dbytes=JSON.stringify(descriptor,null,2)+'\n';
 if(fs.existsSync(dfile)){if(fs.readFileSync(dfile,'utf8')!==dbytes)throw Error('Immutable descriptor conflict');}else fs.writeFileSync(dfile,dbytes,{flag:'wx'});
 return {revision,sha256,size:payload.length,path:file,descriptor,plan};
}
if(require.main===module){const r=build();console.log(JSON.stringify({revision:r.revision,sha256:r.sha256,size:r.size,path:r.path}));}
module.exports={build};
