/* Build an immutable RAM repair from committed canonical source. No BLE. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const sourceCommit=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const sourcePath='initialization/zero/repair-storagefile.js';
const source=cp.execFileSync('git',['show',sourceCommit+':'+sourcePath],{cwd:root});
const manifest={schema:'vera-zero-ram-repair/1',sourceCommit,mode:'ram-only',
  appliesTo:{packageSha256:'2c74ed8520dc74293b09521bea9b644aaa44b28ae2140ebf9c0a1fe19f5a06de',targetFingerprint:'83b51c1628cc4c05f5670e29568d87ce8628f601ffda8b058c18839253b28733',board:'BANGLEJS2',firmware:'2v29',phase:'wiping',pendingKind:'storage-chunk'},
  permission:'recover',requiresStagedFiles:14,
  changes:{targetFiles:false,packageHash:false,binding:false,ledger:false,persistentSupport:false},
  source:{path:sourcePath,sha256:hash(source),size:source.length,base64:source.toString('base64')}};
const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),sha=hash(bytes),revision='veranode-zero-repair-1-'+sha.slice(0,16);
const dir=path.join(root,'dist/veranode-zero-repair',revision);fs.mkdirSync(dir,{recursive:true});
for(const [name,content]of Object.entries({'repair.json':bytes,'descriptor.json':Buffer.from(JSON.stringify({schema:'vera-zero-ram-repair-release/1',revision,sha256:sha,size:bytes.length,sourceCommit,appliesTo:manifest.appliesTo,mode:manifest.mode,url:'https://github.com/deradrea/Daily-BangleApps/releases/download/'+revision+'/repair.json'},null,2)+'\n')})){
 const file=path.join(dir,name);if(fs.existsSync(file)&&!fs.readFileSync(file).equals(content))throw Error('Immutable repair collision');fs.writeFileSync(file,content);
}
console.log(JSON.stringify({revision,sha256:sha,size:bytes.length,sourceCommit,directory:dir}));
