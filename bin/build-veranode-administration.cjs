/* Local integration component only. Never installs, provisions or publishes. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),acorn=require('acorn');
const root=path.resolve(__dirname,'..'),directory='experimental/veranode-administration';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const modules={
 'veranode.admin.auth.js':'authorization.js',
 'veranode.admin.erase.js':'erase.js',
 'veranode.admin.ctrl.js':'controller.js',
 'veranode.admin.driver.js':'verification-driver.js',
 'veranode.admin.adapter.js':'runtime-adapter.js'
};
function inspect(source,allowed) {
 const tree=acorn.parse(source,{ecmaVersion:5});
 function walk(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='require') {
   if(node.arguments.length!==1||node.arguments[0].type!=='Literal'||!allowed.includes(node.arguments[0].value))
    throw Error('Unresolved component dependency');
  }
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
 }
 walk(tree);
}
function build(outputRoot=path.join(root,'output/administration-components')) {
 const verifier=require('../experimental/veranode-administration/build-verifier.cjs').build();
 if(!verifier.manifest.nativeInterpreterValidated)throw Error('Matching native interpreter proof required');
 const inputs={};
 function read(relative){const bytes=fs.readFileSync(path.join(root,relative));inputs[relative]=hash(bytes);return bytes;}
 const files=Object.entries(modules).map(([name,file])=>({name,bytes:read(directory+'/'+file)}));
 files.push({name:'veranode.admin.verify.js',bytes:Buffer.from(verifier.source)});
 for(const file of files)inspect(file.bytes.toString('utf8'),['crypto']);
 // Pin the generation inputs as well as the derived bytes and native proof.
 for(const name of ['build-verifier.cjs','verification-job.js','vendor/tweetnacl-1.0.3/nacl-fast.js',
  'vendor/tweetnacl-1.0.3/provenance.json','evaluation/native-verifier-2v29.json'])read(directory+'/'+name);
 const licenses={project:read('LICENSE').toString('utf8'),tweetnacl:read(directory+'/vendor/tweetnacl-1.0.3/LICENSE').toString('utf8')};
 // This component must be integrated against these exact runtime interfaces.
 // It is not an upgrade package and contains no runtime replacement or data.
 const metadata=JSON.parse(read('apps/veranode/metadata.json'));
 const runtime={};
 for(const name of metadata.storage.map(f=>f.url))runtime['apps/veranode/'+name]=hash(read('apps/veranode/'+name));
 const sourceManifest={schemaVersion:1,repository:'https://github.com/deradrea/Daily-BangleApps',
  builderSha256:hash(fs.readFileSync(__filename)),inputs,runtime};
 const sourceBytes=Buffer.from(JSON.stringify(sourceManifest,null,2)+'\n');
 const revision='veranode-admin-1-'+hash(sourceBytes).slice(0,16);
 const component={schemaVersion:1,id:'vera-node-administration-component',revision,
  sourceManifestSha256:hash(sourceBytes),board:'BANGLEJS2',firmware:['2v29'],
  installable:false,releaseReady:false,executionEnabled:false,hardwareValidated:false,
  nativeInterpreterValidated:true,verifierSha256:verifier.manifest.sha256,
  activation:{mode:'explicit-trusted-bootstrap',automatic:false,includesBoot:false,
   requires:['trusted-key-provisioning','secure-nonce-source','monotonic-clock-adapter',
    'verified-time','memory-and-latency-on-device','console-access-control','server-signer-deployment'],
   entrypoint:'veranode.admin.adapter.js',method:'attach',
   injectedModules:{authorization:'veranode.admin.auth.js',erase:'veranode.admin.erase.js',
    controller:'veranode.admin.ctrl.js',driver:'veranode.admin.driver.js',verifier:'veranode.admin.verify.js'}},
  preserves:['sensor-json','sample-journal','custody-ack','profile','event-journal','time-journal'],
  nativeDependencies:['crypto.SHA512'],licenses,
  files:files.map(f=>({name:f.name,size:f.bytes.length,sha256:hash(f.bytes),base64:f.bytes.toString('base64')}))};
 const bytes=Buffer.from(JSON.stringify(component,null,2)+'\n'),destination=path.join(outputRoot,revision);
 const artifacts=[['component.json',bytes],['source-manifest.json',sourceBytes]];
 // Validate every destination before writing any new file. Never replace bytes.
 for(const [name,data]of artifacts){const target=path.join(destination,name);
  if(fs.existsSync(target)&&!fs.readFileSync(target).equals(data))throw Error('Immutable component conflict');}
 fs.mkdirSync(destination,{recursive:true});
 for(const [name,data]of artifacts){const target=path.join(destination,name);if(!fs.existsSync(target))fs.writeFileSync(target,data,{flag:'wx'});}
 return {revision,sha256:hash(bytes),path:path.join(destination,'component.json'),component,sourceManifest};
}
module.exports={build,inspect};
if(require.main===module){const r=build();console.log(JSON.stringify({revision:r.revision,sha256:r.sha256,path:r.path,installable:false}));}
