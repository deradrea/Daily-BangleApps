/* RAM-only repair for the immutable 2c74 provider. No file or ledger writes.
 * Evaluates to a function; invoke only after a server-authorized recover grant.
 */
(function(binding){
  var s=require('Storage'),e=require('vz.platform.js').create(),st=e.load();
  var packageHash='2c74ed8520dc74293b09521bea9b644aaa44b28ae2140ebf9c0a1fe19f5a06de';
  var fingerprint='83b51c1628cc4c05f5670e29568d87ce8628f601ffda8b058c18839253b28733';
  if(process.env.BOARD!=='BANGLEJS2'||process.env.VERSION!=='2v29'||!e.encrypted()||
    !st||e.canonical(st.binding)!==e.canonical(binding)||binding.mac!==e.mac()||
    binding.packageSha256!==packageHash||e.target.fingerprint!==fingerprint||
    st.targetFingerprint!==fingerprint||st.phase!=='wiping'||st.wipeConsumed!==true||
    !st.pending||st.pending.kind!=='storage-chunk'||st.staged.length!==e.target.files.length||
    !e.supportIntact())throw Error('Riparazione non compatibile con questa pratica');
  e.target.files.forEach(function(f,i){var b=e.read('vz.f'+i);if(typeof b!=='string'||b.length!==f.size||e.hash(b)!==f.sha256)throw Error('Staging non integro');});
  function chunks(base){var normal=s.list(undefined,{sf:false});return s.list().filter(function(n){return !normal.includes(n)&&n.length===base.length+1&&n.slice(0,-1)===base;});}
  function names(){var normal=s.list(undefined,{sf:false}),seen={},out=[];s.list().forEach(function(n){if(normal.includes(n))return;var b=n.slice(0,-1);if(!seen[b]){seen[b]=true;out.push(b);}});return out;}
  var exists=e.exists,erase=e.erase,next=e.nextRemovable;
  function protectedName(n){return ['vz.provider.js','vz.platform.js','vz.recovery.js','vz.app.js','vz.display.js','0vz.boot.js','vz.target.js','vz.state0','vz.state1'].includes(n)||e.bootEntries.includes(n)||e.target.files.some(function(_f,i){return n==='vz.f'+i;});}
  if(protectedName(st.pending.name)||!chunks(st.pending.name).length)throw Error('Archivio pending non verificabile');
  e.exists=function(row){return row.kind==='storage-chunk'?chunks(row.name).length>0:exists(row);};
  e.erase=function(row){
    if(row.kind!=='storage-chunk')return erase(row);
    if(protectedName(row.name))throw Error('Supporto protetto');
    if(!chunks(row.name).length)return;
    s.open(row.name,'r').erase();
    chunks(row.name).forEach(function(n){s.erase(n);});
    if(chunks(row.name).length)throw Error('Archivio non rimosso');
  };
  e.nextRemovable=function(){var row=next();if(row&&row.kind==='normal')return row;var list=names();return list.length?{kind:'storage-chunk',name:list[0]}:undefined;};
  // Creating the provider reads the original ledger; only subsequent authorized
  // recover/step calls advance it. The installed support hashes stay unchanged.
  global.VeraZero=require('vz.provider.js').create(e);
  return {repairReady:true,ramOnly:true,phase:st.phase,removed:st.removed,
    wipeTotal:st.wipeTotal,stagedFiles:st.staged.length,binding:st.binding};
})
