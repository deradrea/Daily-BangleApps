/* Zero initialization package, canonical Git inputs. Never opens BLE. */
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),acorn=require('acorn');
const root=path.resolve(__dirname,'..'),repository='https://github.com/deradrea/Daily-BangleApps',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
function validateDedicatedRelease(config){
 const policy={scope:'server-authorized-initialization',allowedRoles:['super_admin','platform_admin'],requiresDeviceBinding:true};
 if(!config||canonical(Object.keys(config).sort())!==canonical(['targetProfile','board','firmware','executionEnabled','executionPolicy'].sort())||config.targetProfile!=='veranode-only'||config.board!=='BANGLEJS2'||canonical(config.firmware)!=='["2v29"]'||typeof config.executionEnabled!=='boolean'||canonical(config.executionPolicy)!==canonical(policy))throw Error('Invalid dedicated release configuration');
 return config;
}

function build(output=path.join(root,'dist/veranode-zero'),options={}){
 const sourceCommit=cp.execFileSync('git',['rev-parse',(options.sourceCommit||'HEAD')+'^{commit}'],{cwd:root,encoding:'utf8'}).trim();
 // Historical rebuilds must execute the recorded builder, not today's logic.
 const builderBytes=cp.execFileSync('git',['show',sourceCommit+':bin/build-veranode-zero.cjs'],{cwd:root});
 if(module.veraCanonicalSourceCommit!==sourceCommit&&!fs.readFileSync(__filename).equals(builderBytes)){
  const Module=require('node:module'),historical=new Module(__filename,module);historical.filename=__filename;historical.paths=module.paths;historical.veraCanonicalSourceCommit=sourceCommit;historical._compile(builderBytes.toString('utf8'),__filename);
  return historical.exports.build(output,{...options,sourceCommit});
 }
 const inputs={};
 const committed=n=>{const b=cp.execFileSync('git',['show',sourceCommit+':'+n],{cwd:root});inputs[n]=sha(b);return b;};
 const parentRaw=committed('dist/veranode-initialize/veranode-initialize-1-866f85f37a599201/initialize.json'),parentSha='866f85f37a599201e0fa275ccbd8cad88604f0a3eb373f91f780571b8a0f6ac4';
 if(sha(parentRaw)!==parentSha)throw Error('Official base changed');
 const parent=JSON.parse(parentRaw),file=(name,b)=>({name,size:b.length,sha256:sha(b),base64:b.toString('base64')});
 const pairs=[['vz.provider.js','provider.js'],['vz.platform.js','platform.js'],['vz.recovery.js','recovery.js'],['vz.app.js','app.js'],['vz.display.js','display.js'],['0vz.boot.js','guard.js']];
 const bootstrap=pairs.map(([name,n])=>{const b=committed('initialization/zero/'+n);acorn.parse(b.toString(),{ecmaVersion:2015});if(/Number\s*\.\s*(?:isInteger|isFinite|isSafeInteger)\s*\(/.test(b.toString()))throw Error('Unsupported firmware number helper');return file(name,b);});
 const dedicated=options.targetProfile==='veranode-only';
 if(options.targetProfile!==undefined&&!dedicated)throw Error('Unsupported target profile');
 let releaseConfig,target=structuredClone(parent.target.files);
 if(dedicated){
  releaseConfig=JSON.parse(committed('initialization/zero/dedicated-release.json'));
  validateDedicatedRelease(releaseConfig);
  const helper=committed('bin/veranode-dedicated-target.cjs');
  if(!fs.readFileSync(path.join(root,'bin/veranode-dedicated-target.cjs')).equals(helper))throw Error('Dedicated selector differs from canonical source');
  target=require('./veranode-dedicated-target.cjs').create(target,committed('initialization/zero/launcher.js'));
 }
 const bootIndex=target.findIndex(f=>f.name==='.boot0');
 const bootPrefix="(function(){var b=require('Storage').read('0vz.boot.js');if(typeof b!=='string')throw Error('Vera zero guard assente');eval(b);})();\n";
 target[bootIndex]=file('.boot0',Buffer.concat([Buffer.from(bootPrefix),Buffer.from(target[bootIndex].base64,'base64')]));
 const rows=target.map(({name,size,sha256})=>({name,size,sha256})),fingerprint=sha(Buffer.from(canonical(rows))),stagingBytes=target.reduce((n,f)=>n+f.size,0);
 const supportFiles=bootstrap.map(({name,size,sha256})=>({name,size,sha256}));
 bootstrap.push(file('vz.target.js',Buffer.from('exports='+JSON.stringify({files:rows,fingerprint,stagingBytes,supportFiles,runtimePackageSha256:parent.runtimePackageSha256,authorizationMode:'app-confirmed'})+';\n')));
 const display=Buffer.from(bootstrap.find(f=>f.name==='vz.display.js').base64,'base64').toString();
 const feedbackBootstrapExpression="(function(){if(process.env.BOARD!=='BANGLEJS2'||process.env.VERSION!=='2v29')throw Error('Firmware non supportato');Bangle.setUI({mode:'custom',btn:function(){if(global.VeraZeroDisplay)global.VeraZeroDisplay.draw();}});Bangle.setLCDTimeout(0);Bangle.setOptions({wakeOnBTN1:true,wakeOnFaceUp:false,wakeOnTouch:false,lockTimeout:0,lcdPowerTimeout:0,backlightTimeout:0,btnLoadTimeout:0});var exports={};"+display+";if(global.VeraZeroDisplay)global.VeraZeroDisplay.dispose();global.VeraZeroDisplay=exports.create();return {feedbackReady:true,visualVerified:false};})()";
 const uiBootstrapExpression="(function(){if(process.env.BOARD!=='BANGLEJS2'||process.env.VERSION!=='2v29')throw Error('Firmware non supportato');var cached=Modules.getCached();['vz.provider.js','vz.platform.js','vz.display.js','vz.target.js'].forEach(function(n){if(cached.indexOf(n)>=0)Modules.removeCached(n);});delete global.VeraZero;delete global.VeraZeroError;global.VeraZeroUiReady=false;var s=require('Storage'),r=global.VeraZeroRawRead||global.VeraInitializeRead||global.VeraMaintenanceStorageRead||s.read.bind(s),b=r('vz.app.js');if(typeof b!=='string')throw Error('Interfaccia consenso assente');eval(b);if(global.VeraZeroError)throw Error(global.VeraZeroError);if(!global.VeraZero||!global.VeraZeroUiReady)throw Error('Interfaccia consenso non pronta');var status=global.VeraZero.status();if(status.authorizationMode!=='app-confirmed'||status.physicalConsentRequired!==false)throw Error('Autorizzazione dalla app non disponibile');status.appUiReady=true;status.visualVerified=false;return status;})()";
 acorn.parse(feedbackBootstrapExpression,{ecmaVersion:2015});acorn.parse(uiBootstrapExpression,{ecmaVersion:2015});
 const builderSha256=sha(committed('bin/build-veranode-zero.cjs'));
 const manifest={schema:'vera-bangle-zero-source-manifest/1',sourceRepository:repository,sourceCommit,files:inputs,parentInitializeSha256:parentSha,runtimePackageSha256:parent.runtimePackageSha256};
 const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
 const executionPolicy=dedicated?releaseConfig.executionPolicy:{scope:'platform-admin-commissioning',allowedRoles:['super_admin','platform_admin'],allowedMacs:['D1:4D:6D:D2:E0:75']};
 const releaseFlags=dedicated?{targetProfile:'veranode-only'}:{};
 const executionEnabled=dedicated?releaseConfig.executionEnabled:true;
 const bundle={...releaseFlags,executionEnabled,executionPolicy,schema:'vera-bangle-zero-initialize/1',mode:'zero-initialization',protocol:1,board:'BANGLEJS2',firmware:['2v29'],preservesFirmware:true,preserveUserData:false,replaceSettings:true,requiresExistingVera:false,hardwareValidated:false,
  authorization:{enforcement:'consumer',deviceVerified:false,physicalConsent:false,confirmationSource:'app',encryptedBle:true},sourceRepository:repository,sourceCommit,sourceManifestSha256:sha(manifestBytes),parentInitializeSha256:parentSha,runtimeRevision:parent.runtimeRevision,runtimePackageSha256:parent.runtimePackageSha256,home:'veranode.app.js',
  binding:{fields:['executionId','generation','deviceId','mac','board','firmware','packageSha256','intent'],intent:'initialize-from-zero',generation:'uuid'},
  rpc:{factory:"(global.VeraZero||(global.VeraZero=require('vz.provider.js').create(require('vz.platform.js').create())))",methods:['inspect','requestSecurity','securityStatus','status','prepare','recover','stage','beginWipe','step','verify','syncTime','activate','confirm','inventoryPage']},
  limits:{chunkBytes:384,inventoryPage:24,minimumBatteryPercent:50,minimumFreeBytes:stagingBytes*2+65536},bootstrap,target:{files:target,fingerprint,stagingBytes,installOrder:target.filter(f=>f.name!=='.boot0'&&f.name!=='.bootcde').concat(target.filter(f=>f.name==='.bootcde')).map(f=>f.name)},
  feedbackBootstrapExpression,feedbackBootstrapSha256:sha(Buffer.from(feedbackBootstrapExpression)),uiBootstrapExpression,uiBootstrapSha256:sha(Buffer.from(uiBootstrapExpression)),
  recovery:{journal:['vz.state0','vz.state1'],strategy:'same-execution-selective-wipe-once',eraseAll:false,bootEntries:['.varimg','.bootcde','.bootrst','.boot3','.boot2','.boot1','.bootPowerOn','.boot0'],cleanupBootEntries:['.bootPowerOn','.boot1','.boot2','.boot3','.bootrst'],bootGuard:'0vz.boot.js',bootCommitLast:'.boot0',newIntentCanReplaceOldCheckpoint:true},
  provenance:{builderSha256,inputs},license:parent.license};
 const bytes=Buffer.from(JSON.stringify(bundle,null,2)+'\n'),hash=sha(bytes),revision='veranode-zero-1-'+hash.slice(0,16),dir=path.join(output,revision);
 const descriptor={schema:'vera-bangle-zero-descriptor/1',revision,sha256:hash,size:bytes.length,board:bundle.board,firmware:bundle.firmware,mode:bundle.mode,protocol:1,authorization:bundle.authorization,sourceRepository:repository,sourceCommit,sourceManifestSha256:bundle.sourceManifestSha256,targetFingerprint:fingerprint,...releaseFlags,executionEnabled,executionPolicy,hardwareValidated:false};
 fs.mkdirSync(dir,{recursive:true});for(const [name,b]of [['initialize.json',bytes],['descriptor.json',Buffer.from(JSON.stringify(descriptor,null,2)+'\n')],['source-manifest.json',manifestBytes]]){const dest=path.join(dir,name);if(fs.existsSync(dest)){if(!fs.readFileSync(dest).equals(b))throw Error('Immutable zero conflict');}else fs.writeFileSync(dest,b,{flag:'wx'});}
 return {revision,sha256:hash,size:bytes.length,path:path.join(dir,'initialize.json'),bundle,descriptor};
}
if(require.main===module){const r=build(undefined,process.argv.includes('--dedicated')?{targetProfile:'veranode-only'}:{});console.log(JSON.stringify({revision:r.revision,sha256:r.sha256,size:r.size,path:r.path}));}
module.exports={build,canonical,validateDedicatedRelease};
