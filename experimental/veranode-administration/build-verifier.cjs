// Builds an evaluation artifact only. Never adds files to the release catalog.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function walk(node,fn){if(!node||typeof node!=='object')return;if(node.type)fn(node);Object.keys(node).forEach(k=>{if(k==='start'||k==='end')return;const v=node[k];if(Array.isArray(v))v.forEach(n=>walk(n,fn));else walk(v,fn);});}
function optimized(vendor) {
 const acorn=require('acorn'),tree=acorn.parse(vendor,{ecmaVersion:5});
 const body=tree.body[0].expression.callee.body.body,decls=new Map();
 for(const n of body){if(n.type==='FunctionDeclaration')decls.set(n.id.name,{code:vendor.slice(n.start,n.end),node:n});
   if(n.type==='VariableDeclaration')for(const d of n.declarations)decls.set(d.id.name,{code:'var '+vendor.slice(d.start,d.end)+';',node:d});}
 const nativeHash='function crypto_hash(out,m,n){var h=new Uint8Array(require("crypto").SHA512(m.subarray(0,n)));if(h.length!==64)throw new Error("SHA512 unavailable");for(var i=0;i<64;i++)out[i]=h[i];return 0;}';
 decls.set('crypto_hash',{code:nativeHash,node:acorn.parse(nativeHash,{ecmaVersion:5})});
 const add=decls.get('add'),addBody=add.node.body,variables=addBody.body[0];
 const scratch='var veraAddScratch=[gf(),gf(),gf(),gf(),gf(),gf(),gf(),gf(),gf()];';
 const names=variables.declarations.map(d=>d.id.name);
 if(names.join(',')!=='a,b,c,d,e,f,g,h,t')throw Error('Point-add scratch layout changed');
 add.code=vendor.slice(add.node.start,variables.start)+'var '+names.map((name,i)=>name+'=veraAddScratch['+i+']').join(',')+';'+vendor.slice(variables.end,add.node.end);
 let verify;
 walk(tree,n=>{if(n.type==='AssignmentExpression'&&vendor.slice(n.left.start,n.left.end)==='nacl.sign.detached.verify')verify=n.right;});
 if(!verify)throw Error('Verification root missing');
 const job=fs.readFileSync(path.join(root,'verification-job.js'),'utf8'),selected=new Set();
 function dependencies(node){walk(node,n=>{if(n.type==='Identifier'&&decls.has(n.name)&&!selected.has(n.name)){selected.add(n.name);dependencies(decls.get(n.name).node);}});}
 dependencies(acorn.parse(job,{ecmaVersion:5}));
 const declarations=[...decls].filter(([name])=>selected.has(name)).map(([,v])=>v.code).join('\n');
 // gf stores only reduced limbs / sums, never wide accumulators. reduce stores
 // bounded signed integer carries; Float64 typed-array reads are avoided.
 let code=(declarations+'\n'+scratch).replace(/new Float64Array\(16\)/g,'new Float32Array(16)')
   .replace(/new Float64Array\(64\)/g,'new Int32Array(64)').replace(/new Float64Array\(\[/g,'new Int32Array([');
 if(code.includes('Float64Array'))throw Error('Unreviewed field allocation');
 code='var veraNacl=(function(){\n'+code+'\nvar nacl={};\n'+job+'\nreturn {verificationJob:nacl.verificationJob};})();\n';
 return {source:code,functions:[...selected].sort(),nativeHash:'crypto.SHA512',jobSha256:hash(job)};
}
function build(options={}) {
 const optimize=options.optimized!==false;
 const vendor=fs.readFileSync(path.join(root,'vendor/tweetnacl-1.0.3/nacl-fast.js'),'utf8');
 const provenance=JSON.parse(fs.readFileSync(path.join(root,'vendor/tweetnacl-1.0.3/provenance.json'),'utf8'));
 const expected=provenance.sourceSha256;
 if(hash(vendor)!==expected)throw Error('Vendor provenance mismatch');
 const authorization=fs.readFileSync(path.join(root,'authorization.js'),'utf8');
 // The original library is unchanged. Only detached verification is exported.
 // No RNG is provided; the inert stub prevents Node crypto fallback in Espruino.
 let details=null;
 let source='/* Experimental verification only; NOT approved for installation. */\n'+
  'var veraNacl=(function(){var module={exports:{}};var self={crypto:{getRandomValues:function(){throw new Error("No random source");}}};\n'+
  vendor+'\nreturn module.exports;})();\nvar veraAuth={};(function(exports){\n'+authorization+
  '\n})(veraAuth);exports.verify=veraAuth.verifier(veraNacl);\n';
 if(optimize) {
   details=optimized(vendor);
   source=details.source+'var veraAuth={};(function(exports){\n'+authorization+'\n})(veraAuth);\n'+
    'exports.create=function(message,signature,key){var input=veraAuth.parts(message,signature,key);return input?veraNacl.verificationJob(input):{step:function(){return {done:true,valid:false,progress:100};}};};\n';
   const positions=[];walk(require('acorn').parse(source,{ecmaVersion:5}),n=>{if(n.type==='FunctionDeclaration'||n.type==='FunctionExpression')positions.push(n.body.start+1);});
   positions.sort((a,b)=>b-a).forEach(p=>{source=source.slice(0,p)+'"ram";'+source.slice(p);});
 }
 const evidenceFile=path.join(root,'evaluation/native-verifier-2v29.json');
 const evidence=fs.existsSync(evidenceFile)?JSON.parse(fs.readFileSync(evidenceFile,'utf8')):null;
 const nativeChecked=!!(optimize && evidence && evidence.passed===true && evidence.hardware===false && evidence.interpreter==='2v29' && evidence.sourceSha256===hash(source));
 return {source,manifest:{schema:1,algorithm:'Ed25519',installable:false,releaseReady:false,nativeInterpreterValidated:nativeChecked,
  hardwareValidated:false,executionEnabled:false,optimized:optimize,derivation:details?{functions:details.functions,nativeHash:details.nativeHash,jobSha256:details.jobSha256}:null,sourceBytes:Buffer.byteLength(source),sha256:hash(source),
  vendor:{name:'tweetnacl',version:'1.0.3',variant:'fast',sourceSha256:expected},
  unresolved:['trusted-key-provisioning','secure-nonce-source','monotonic-clock-adapter','memory-and-latency-on-device','console-access-control','server-signer-deployment']}};
}
module.exports={build};
if(require.main===module) {
 const result=build(),out=path.join(root,'evaluation');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'verifier.js'),result.source);
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result.manifest,null,2)+'\n');
 fs.copyFileSync(path.join(root,'vendor/tweetnacl-1.0.3/LICENSE'),path.join(out,'LICENSE.tweetnacl'));
 process.stdout.write(JSON.stringify(result.manifest,null,2)+'\n');
}
