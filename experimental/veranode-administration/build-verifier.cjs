// Builds an evaluation artifact only. Never adds files to the release catalog.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function build() {
 const vendor=fs.readFileSync(path.join(root,'vendor/tweetnacl-1.0.3/nacl-fast.js'),'utf8');
 const provenance=JSON.parse(fs.readFileSync(path.join(root,'vendor/tweetnacl-1.0.3/provenance.json'),'utf8'));
 if(hash(vendor)!==provenance.sourceSha256)throw Error('Vendor provenance mismatch');
 const authorization=fs.readFileSync(path.join(root,'authorization.js'),'utf8');
 // The original library is unchanged. Only detached verification is exported.
 // No RNG is provided; the inert stub prevents Node crypto fallback in Espruino.
 const source='/* Experimental verification only; NOT approved for installation. */\n'+
  'var veraNacl=(function(){var module={exports:{}};var self={crypto:{getRandomValues:function(){throw new Error("No random source");}}};\n'+
  vendor+'\nreturn module.exports;})();\nvar veraAuth={};(function(exports){\n'+authorization+
  '\n})(veraAuth);exports.verify=veraAuth.verifier(veraNacl);\n';
 return {source,manifest:{schema:1,algorithm:'Ed25519',installable:false,releaseReady:false,
  hardwareValidated:false,executionEnabled:false,sourceBytes:Buffer.byteLength(source),sha256:hash(source),
  vendor:{name:'tweetnacl',version:'1.0.3',sourceSha256:provenance.sourceSha256},
  unresolved:['trusted-key-provisioning','secure-nonce-source','monotonic-clock-adapter','memory-and-latency-on-device','console-access-control','server-signer-contract']}};
}
module.exports={build};
if(require.main===module) {
 const result=build(),out=path.join(root,'evaluation');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'verifier.js'),result.source);
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result.manifest,null,2)+'\n');
 fs.copyFileSync(path.join(root,'vendor/tweetnacl-1.0.3/LICENSE'),path.join(out,'LICENSE.tweetnacl'));
 process.stdout.write(JSON.stringify(result.manifest,null,2)+'\n');
}
