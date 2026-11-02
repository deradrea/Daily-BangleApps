/* Ordered SHA-256 block manifest; never flattens an entire flash file. */
exports.create=function(c,read,manifest){
  var algorithm='sha256-chunks-1024-v1',block=1024;
  if(!manifest||manifest.algorithm!==algorithm||manifest.blockBytes!==block||!manifest.hashes)throw Error('Manifesto integrita non valido');
  function bytes(s){if(typeof s!=='string'||s.length>4096)throw Error('Hash oltre il limite di memoria');return c.SHA256(s);}
  function hash(s){var a=new Uint8Array(bytes(s)),v='';for(var i=0;i<32;i++)v+=('0'+a[i].toString(16)).slice(-2);return v;}
  function matches(name,file){
    var expected=manifest.hashes[file.name],n=Math.ceil(file.size/block),stored=read(name);
    if(typeof expected!=='string'||expected.length!==n*64||/[^a-f0-9]/.test(expected))throw Error('Digest dei blocchi non valido');
    if(typeof stored!=='string'||stored.length!==file.size)return false;
    stored=undefined;
    for(var at=0;at<file.size;at+=block){var size=Math.min(block,file.size-at),part=read(name,at,size);if(typeof part!=='string'||part.length!==size||hash(part)!==expected.substr(at/block*64,64))return false;}
    return true;
  }
  function prefix(name,length){
    if(typeof length!=='number'||length<0||length>100000||Math.floor(length)!==length)throw Error('Prefisso non valido');
    var sequence='VZP1'+String.fromCharCode((length>>>24)&255,(length>>>16)&255,(length>>>8)&255,length&255);
    for(var at=0;at<length;at+=block){var size=Math.min(block,length-at),part=read(name,at,size);if(typeof part!=='string'||part.length!==size)throw Error('Prefisso non leggibile');sequence+=E.toString(bytes(part));}
    return {prefixDigestAlgorithm:algorithm,prefixDigest:hash(sequence)};
  }
  return {hash:hash,matches:matches,prefix:prefix};
};
