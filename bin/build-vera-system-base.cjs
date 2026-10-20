/* Offline candidate builder. No BLE, erase, upload or release publication. */
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const cp=require('node:child_process'), acorn=require('acorn');
const root=path.resolve(__dirname,'..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const repository='https://github.com/deradrea/Daily-BangleApps';
const builtin=['Storage','heatshrink','locale'];
function build(outputRoot=path.join(root,'dist/vera-system-base'),options={}) {
  const sourceCommit=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const inputs={},externalSources={},files=[],seen=new Set(),modules=new Set();
  function source(relative) {
    if(relative.includes('..')||path.isAbsolute(relative))throw Error('Invalid source path');
    let b;
    if(options.canonicalSources&&relative.startsWith('webtools/')){
      const commit=cp.execFileSync('git',['rev-parse',sourceCommit+':webtools'],{cwd:root,encoding:'utf8'}).trim(),file=relative.slice(9);
      b=cp.execFileSync('git',['show',commit+':'+file],{cwd:path.join(root,'webtools')});
      externalSources[relative]={repository:'https://github.com/espruino/EspruinoWebTools',commit,path:file,sha256:sha(b)};
    }else b=options.canonicalSources ? cp.execFileSync('git',['show',sourceCommit+':'+relative],{cwd:root}) : fs.readFileSync(path.join(root,relative));
    inputs[relative]=sha(b);return b;
  }
  function dependencies(code) {
    const names=new Set();
    function walk(node) {
      if(!node||typeof node!=='object')return;
      if(node.type==='CallExpression'&&node.callee?.type==='Identifier'&&node.callee.name==='require') {
        if(node.arguments.length!==1||typeof node.arguments[0]?.value!=='string')throw Error('Dynamic module dependency');
        names.add(node.arguments[0].value);
      }
      for(const v of Object.values(node))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);
    }
    walk(acorn.parse(code,{ecmaVersion:'latest',allowReturnOutsideFunction:true}));
    return [...names].sort();
  }
  function add(name,bytes,origin,kind,deps=[]) {
    if(!/^[.A-Za-z0-9_-]{1,28}$/.test(name)||seen.has(name)||!bytes.length||bytes.length>120000)throw Error('Invalid file '+name);
    seen.add(name);files.push({name,kind,source:origin,size:bytes.length,sha256:sha(bytes),dependencies:deps,base64:bytes.toString('base64')});
  }
  function module(name) {
    if(builtin.includes(name)||modules.has(name))return;
    if(!/^[a-z_]+$/.test(name))throw Error('Unsupported module '+name);
    modules.add(name);
    const origin='modules/'+name+'.js',bytes=source(origin),deps=dependencies(bytes.toString('utf8'));
    add(name,bytes,origin,'module',deps);deps.forEach(module);
  }
  for(const id of ['boot','setting','launch']) {
    const metadataPath=`apps/${id}/metadata.json`, metadata=JSON.parse(source(metadataPath));
    if(!metadata.supports.includes('BANGLEJS2'))throw Error('Unsupported board');
    const names=[];
    for(const entry of metadata.storage) {
      if(!entry.url||path.basename(entry.url)!==entry.url)throw Error('Nonlocal storage source');
      const origin=`apps/${id}/${entry.url}`,raw=source(origin);
      let bytes=raw,deps=[];
      if(entry.evaluate) {
        const literal=raw.toString('utf8').trim().match(/^require\("heatshrink"\)\.decompress\(atob\("([A-Za-z0-9+/=]+)"\)\)$/);
        if(!literal)throw Error('Evaluation is not an allowlisted icon literal');
        const decoder=source('webtools/heatshrink.js');
        if(options.canonicalSources&&sha(Buffer.from(fs.readFileSync(path.join(root,'webtools/heatshrink.js'),'utf8').replace(/\r\n/g,'\n')))!==sha(decoder))throw Error('Checkout decoder differs from pinned submodule');
        bytes=Buffer.from(require('../webtools/heatshrink.js').decompress(Uint8Array.from(Buffer.from(literal[1],'base64'))));
      } else if(entry.url.endsWith('.js')) {
        deps=dependencies(raw.toString('utf8'));deps.forEach(module);
      }
      add(entry.name,bytes,origin,entry.name.endsWith('.img')?'image':'system',deps);names.push(entry.name);
    }
    const info={id:metadata.id,name:metadata.name,version:metadata.version,
      ...(metadata.type?{type:metadata.type}:{}),sortorder:metadata.sortorder||0,
      ...(id==='setting'?{src:'setting.app.js',icon:'setting.img'}:{}),
      ...(id==='launch'?{src:'launch.app.js'}:{}),files:names.join(',')};
    add(`${id}.info`,Buffer.from(JSON.stringify(info)),metadataPath,'registry');
  }
  const settingsPath='apps/setting/settings.min.json',settings=JSON.parse(source(settingsPath));
  if(settings.ble!==true||settings.blerepl!==true||settings.clock!==null)throw Error('Unsafe initial settings');
  add('setting.json',Buffer.from(JSON.stringify(settings)),settingsPath,'configuration');
  const license=source('LICENSE');source('bin/build-vera-system-base.cjs');
  for(const f of files)for(const dep of f.dependencies)if(!builtin.includes(dep)&&!seen.has(dep))throw Error('Missing module '+dep);
  files.sort((a,b)=>a.name.localeCompare(b.name,'en'));
  const commit=sourceCommit,sourceState=options.canonicalSources?'git-tree':'working-tree-candidate';
  const manifest={schemaVersion:1,repository,sourceCommit:commit,sourceState,files:inputs,...(options.canonicalSources?{externalSources}:{})};
  const sourceBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),sourceHash=sha(sourceBytes);
  const revision='vera-system-base-dev-'+sourceHash.slice(0,16);
  const bundle={schemaVersion:1,id:'vera-system-base',revision,board:'BANGLEJS2',firmware:['2v29'],
    purpose:'minimal-system-restoration',developmentOnly:true,hardwareValidated:false,releaseReady:false,
    resetAuthorized:false,sourceRepository:repository,sourceCommit:commit,sourceState,sourceManifestSha256:sourceHash,
    builtinModules:builtin,applicationIds:['boot','setting','launch'],
    installation:{mode:'system-base-restoration-only',preservesFirmware:true,requiresIsolatedReset:true},
    license:{id:'MIT',sha256:sha(license),text:license.toString('utf8')},files};
  const bytes=Buffer.from(JSON.stringify(bundle,null,2)+'\n');
  const dest=path.join(outputRoot,revision);fs.mkdirSync(dest,{recursive:true});
  for(const [name,data] of [['package.json',bytes],['source-manifest.json',sourceBytes]]) {
    const file=path.join(dest,name);if(fs.existsSync(file)&&!fs.readFileSync(file).equals(data))throw Error('Immutable artifact conflict');
    if(!fs.existsSync(file))fs.writeFileSync(file,data,{flag:'wx'});
  }
  return {revision,sha256:sha(bytes),path:path.join(dest,'package.json'),files:files.length,bytes:bytes.length,bundle};
}
if(require.main===module){const r=build();console.log(JSON.stringify({...r,bundle:undefined}));}
module.exports={build};
