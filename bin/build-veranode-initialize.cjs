/* Canonical dedicated installer. Never connects to hardware. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),acorn=require('acorn'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
function build(output=path.join(root,'dist/veranode-initialize')){
  const raw=fs.readFileSync(path.join(root,'dist/veranode/veranode-0.2.0-dev-545d8915cd396d71/package.json'));
  if(sha(raw)!=='7b52d46b446d497ee914c668065df70f7d2f9871f5f79ffeb35b0015c16df42a')throw Error('Official Vera Node changed');
  const runtime=JSON.parse(raw),baseResult=require('./build-vera-system-base.cjs').build(path.join(output,'base'),{canonicalSources:true}),base=baseResult.bundle;
  const file=(name,bytes)=>({name,size:bytes.length,sha256:sha(bytes),base64:bytes.toString('base64')});
  const target=base.files.map(f=>file(f.name,Buffer.from(f.base64,'base64'))).concat(runtime.files);
  const settings=JSON.parse(Buffer.from(target.find(f=>f.name==='setting.json').base64,'base64'));
  settings.clock='veranode.app.js';settings.clockHasWidgets=false;
  target.splice(target.findIndex(f=>f.name==='setting.json'),1,file('setting.json',Buffer.from(JSON.stringify(settings))));
  const rows=target.map(({name,size,sha256})=>({name,size,sha256})),fingerprint=sha(canonical(rows));
  const targetModule={files:rows,fingerprint,stagingBytes:target.reduce((n,f)=>n+f.size,0),
    bootloaderSha256:target.find(f=>f.name==='.bootcde').sha256,bootupdateSha256:target.find(f=>f.name==='bootupdate.js').sha256};
  for(const [field,name] of [['bootloaderHashes','.bootcde'],['bootupdateHashes','bootupdate.js']]){
    const raw=Buffer.from(target.find(f=>f.name===name).base64,'base64').toString('utf8');
    targetModule[field]=[...new Set([sha(Buffer.from(raw)),sha(Buffer.from(raw.replace(/\r?\n/g,'\r\n')))])];
  }
  const inputs={};
  const committed=relative=>cp.execFileSync('git',['show',base.sourceCommit+':'+relative],{cwd:root});
  const bootstrap=[['verai.provider.js','provider.js'],['verai.platform.js','platform.js'],['verai.recovery.js','recovery.js'],['verai.0.boot.js','guard.js'],['verai.app.js','app.js']].map(([name,source])=>{
    const bytes=committed('initialization/veranode/'+source);acorn.parse(bytes.toString(),{ecmaVersion:2015});inputs['initialization/veranode/'+source]=sha(bytes);return file(name,bytes);});
  bootstrap.push(file('verai.target.js',Buffer.from('exports='+JSON.stringify(targetModule)+';\n')));
  inputs['bin/build-veranode-initialize.cjs']=sha(committed('bin/build-veranode-initialize.cjs'));
  const manifest={schemaVersion:1,sourceRepository:'https://github.com/deradrea/Daily-BangleApps',sourceCommit:base.sourceCommit,files:inputs,runtimePackageSha256:sha(raw),baseSourceManifestSha256:base.sourceManifestSha256,
    baseSources:JSON.parse(fs.readFileSync(path.join(path.dirname(baseResult.path),'source-manifest.json')))};
  const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
  const bundle={schema:'vera-bangle-dedicated-initialize/1',board:'BANGLEJS2',firmware:['2v29'],mode:'dedicated-initialization',
    preservesFirmware:true,erasesUserData:true,removesNonessentialApps:true,home:'veranode.app.js',hardwareValidated:false,
    authorization:{enforcement:'consumer',deviceVerified:false,physicalConsent:true,encryptedBle:true},
    sourceRepository:manifest.sourceRepository,sourceManifestSha256:sha(manifestBytes),runtimeRevision:runtime.revision,runtimePackageSha256:sha(raw),
    targetFingerprint:fingerprint,canonicalization:'sorted-object-keys-json/1',limits:{chunkBytes:384,maxInventory:128,maxStorageFileBytes:65536,maxPlanBytes:32768},
    recovery:{protocol:1,journal:['verai.state0','verai.state1'],strategy:'complete-same-plan-from-verified-staging',rollbackDeletedData:false,
      internalFiles:bootstrap.map(f=>f.name).concat(['verai.state0','verai.state1','verai.plan','verai.oldboot','verai.oldhash']),stagingFiles:target.map((_f,i)=>'verai.f'+i),
      generatedExclusions:['.widcache','.clkinfocache'],unsupportedBoot:['.bootPowerOn','.boot1','.boot2','.boot3','.bootrst','.varimg']},
    bootstrap,target:{files:target,stagingBytes:targetModule.stagingBytes,bootloaderSha256:targetModule.bootloaderSha256,bootupdateSha256:targetModule.bootupdateSha256,
      acceptedBootloaderSha256:targetModule.bootloaderHashes,acceptedBootupdateSha256:targetModule.bootupdateHashes},
    license:runtime.license};
  const bytes=Buffer.from(JSON.stringify(bundle,null,2)+'\n'),hash=sha(bytes),revision='veranode-initialize-1-'+hash.slice(0,16),dest=path.join(output,revision);
  fs.mkdirSync(dest,{recursive:true});
  const descriptor={schema:'vera-bangle-initialize-descriptor/1',revision,sha256:hash,size:bytes.length,board:bundle.board,firmware:bundle.firmware,
    hardwareValidated:false,sourceRepository:bundle.sourceRepository,mode:bundle.mode,home:bundle.home,targetFingerprint:fingerprint};
  for(const [name,data] of [['initialize.json',bytes],['descriptor.json',Buffer.from(JSON.stringify(descriptor,null,2)+'\n')],['source-manifest.json',manifestBytes]]){
    const f=path.join(dest,name);if(fs.existsSync(f)){if(!fs.readFileSync(f).equals(data))throw Error('Immutable conflict');}else fs.writeFileSync(f,data,{flag:'wx'});
  }
  return {revision,sha256:hash,size:bytes.length,path:path.join(dest,'initialize.json'),descriptor,bundle};
}
if(require.main===module){const r=build();console.log(JSON.stringify({revision:r.revision,sha256:r.sha256,size:r.size,path:r.path}));}
module.exports={build,canonical};
