/* RAM-only repair for a partially installed, immutable 8d26 execution.
 * The caller must obtain Vera's recover grant before evaluating this function.
 */
(function(binding){
  var e=require('vz.platform.js').create(),st=e.load();
  var hash='8d26ef82f2868e473749317645545bb73b0bbac5ed6966c43a0d823765e4a3f9';
  var fingerprint='2a58e379f2432999e55a52508d4be2673cdf97247407973c583550450c36db1c';
  if(!st||!binding||process.env.BOARD!=='BANGLEJS2'||process.env.VERSION!=='2v29'||
    !e.encrypted()||!e.isolated()||e.canonical(st.binding)!==e.canonical(binding)||
    binding.mac!==e.mac()||binding.packageSha256!==hash||
    st.targetFingerprint!==fingerprint||e.target.fingerprint!==fingerprint||
    st.phase!=='installing'||st.wipeConsumed!==true||
    !st.pending||st.pending.kind!=='install'||st.staged.length!==e.target.files.length||
    !e.supportIntact())throw Error('Riparazione non compatibile con questa pratica');
  var files=e.target.files;
  var order=files.filter(function(f){return f.name!=='.boot0'&&f.name!=='.bootcde';})
    .concat(files.filter(function(f){return f.name==='.bootcde';}));
  if(!order[st.installed]||order[st.installed].name!==st.pending.name)
    throw Error('File pendente non verificabile');
  if(!files.every(function(f,i){return e.matches('vz.f'+i,f);}))
    throw Error('Staging non integro');
  var write=e.write;
  e.write=function(name,data,offset,total){
    var i=files.findIndex(function(f){return f.name===name;});
    if(i<0||offset!==undefined||total!==undefined)return write(name,data,offset,total);
    var file=files[i],source='vz.f'+i;
    if(typeof data!=='string'||data.length!==file.size||!e.matches(source,file))
      throw Error('File di installazione non verificato');
    for(var at=0;at<file.size;at+=384){
      var size=Math.min(384,file.size-at),part=e.read(source,at,size);
      if(typeof part!=='string'||part.length!==size)throw Error('Blocco staging non leggibile');
      write(name,atob(btoa(part)),at,at===0?file.size:undefined);
    }
  };
  global.VeraZero=require('vz.provider.js').create(e);
  return {repairReady:true,ramOnly:true,phase:st.phase,binding:st.binding,
    removed:st.removed,installed:st.installed,stagedFiles:st.staged.length};
})
