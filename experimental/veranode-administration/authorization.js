/* Experimental device verifier. No keys, provisioning or BLE activation here. */
var fields = ["v","issuer","keyId","operationId","mac","userUuid","companyId","assignmentId",
  "scope","epoch","high","stored","pending","planHash","nonce","counter","issuedAt","expiresAt","clockRevision"];
function integer(n, max) { return typeof n === "number" && isFinite(n) && Math.floor(n) === n && n >= 0 && n <= max; }
function token(s, max) { return typeof s === "string" && s.length > 0 && s.length <= max && /^[a-z0-9_.:-]+$/i.test(s); }
function hex(s, bytes) { return typeof s === "string" && s.length === bytes*2 && /^[0-9a-f]+$/.test(s); }
function uuid(s) {
  if(typeof s!=="string" || s.length!==36 || !/^[0-9a-f-]+$/.test(s))return false;
  var p=s.split("-");return p.length===5 && p[0].length===8 && p[1].length===4 && p[2].length===4 && p[3].length===4 && p[4].length===12;
}
function canonical(body) {
  if(!body || Object.keys(body).length!==fields.length || fields.some(function(k){return !Object.prototype.hasOwnProperty.call(body,k);}) ||
    body.v!==1 || typeof body.issuer!=="string" || body.issuer.length>120 || !/^https:\/\/[a-z0-9.:-]+$/i.test(body.issuer) ||
    !token(body.keyId,32) || !uuid(body.operationId) || !uuid(body.userUuid) ||
    typeof body.mac!=="string" || body.mac.length!==17 || !/^([0-9A-F][0-9A-F]:)+[0-9A-F][0-9A-F]$/.test(body.mac) ||
    typeof body.scope!=="string" || body.scope.length<1 || body.scope.length>120 || /[^\x20-\x7e]/.test(body.scope) ||
    !token(body.epoch,64) || !hex(body.planHash,32) || !hex(body.nonce,32) ||
    !integer(body.companyId,2147483647) || body.companyId<1 || !integer(body.assignmentId,2147483647) || body.assignmentId<1 ||
    !integer(body.high,2147483647) || !integer(body.stored,3072) || body.stored<1 || body.stored>body.high ||
    !integer(body.pending,body.stored) || !integer(body.counter,2147483647) || body.counter<1 ||
    !integer(body.clockRevision,2147483647) || !integer(body.issuedAt,4102444800000) || body.issuedAt<1577836800000 ||
    !integer(body.expiresAt,4102444800000) || body.expiresAt<=body.issuedAt || body.expiresAt-body.issuedAt>60000)
    throw new Error("Grant non valido");
  return JSON.stringify(["vera-bangle-erase/1","Ed25519","erase_samples"].concat(fields.map(function(k){return body[k];})));
}
function bytes(raw) {
  var out=new Uint8Array(raw.length/2);
  for(var i=0;i<out.length;i++)out[i]=parseInt(raw.slice(i*2,i*2+2),16);
  return out;
}
function ascii(raw) { var out=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out; }
function verifier(nacl) {
  // Reject non-canonical S as well as malformed signatures. Replay protection
  // uses the signed operation/counter, never the signature representation.
  var order=bytes("edd3f55c1a631258d69cf7a2def9de1400000000000000000000000000000010");
  return function(message, signature, publicKey) {
    if(!hex(signature,64) || !hex(publicKey,32))return false;
    var sig=bytes(signature),less=false;
    for(var i=31;i>=0;i--) { if(sig[32+i]<order[i]){less=true;break;}if(sig[32+i]>order[i])return false; }
    if(!less)return false;
    try { return nacl.sign.detached.verify(ascii(message),sig,bytes(publicKey))===true; }
    catch(e) { return false; }
  };
}
exports.canonical=canonical;
exports.verifier=verifier;
exports.fields=fields;
exports.hex=hex;
