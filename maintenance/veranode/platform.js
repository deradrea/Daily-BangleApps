/* Platform layer runs only from the separate maintenance boot/app, never from a file being replaced. */
exports.create = function() {
  var s=require('Storage'),crypto=require('crypto');
  var internal=['veram.provider.js','veram.platform.js','veram.0.boot.js','veram.app.js','veram.stage','veram.old','veram.state0','veram.state1','veram.plan.json'];
  var generated=['.boot0','.widcache','.clkinfocache'];
  var rawRead=global.VeraMaintenanceStorageRead || s.read.bind(s), generation=0, cursor;
  function hash(raw) { var out='',a=new Uint8Array(crypto.SHA256(raw)); for(var i=0;i<a.length;i++)out+=('0'+a[i].toString(16)).slice(-2);return out; }
  function canonical(x) {
    if (Array.isArray(x)) return '['+x.map(canonical).join(',')+']';
    if (x && typeof x==='object')return '{'+Object.keys(x).sort().map(function(k){return JSON.stringify(k)+':'+canonical(x[k]);}).join(',')+'}';
    return JSON.stringify(x);
  }
  function load() {
    var values=[0,1].map(function(i){try{var x=JSON.parse(rawRead('veram.state'+i));if(hash(x.body)!==x.hash)return;return JSON.parse(x.body);}catch(e){return;}}).filter(function(x){return !!x;});
    values.sort(function(a,b){return b.generation-a.generation;});
    if(!values.length) throw Error('Stato manutenzione non disponibile');
    generation=values[0].generation;return values[0];
  }
  function save(state) {
    state.generation=++generation;var body=JSON.stringify(state),raw=JSON.stringify({body:body,hash:hash(body)}),name='veram.state'+generation%2;
    if(s.getStats().freeBytes<raw.length+4096)throw Error('Spazio registro insufficiente');
    s.write(name,raw);if(rawRead(name)!==raw)throw Error('Registro manutenzione non verificato');
  }
  function sf(name) {
    var f=s.open(name,'r'),raw='',part;
    // Journal segments are bounded; reject an unrelated huge StorageFile before exhausting RAM.
    while((part=f.read(512))!==undefined && part!=='') {raw+=part;if(raw.length>65536)throw Error('StorageFile oltre limite manutenzione');}
    return raw;
  }
  function inventory() {
    var rows=[];
    s.list(undefined,{sf:false}).forEach(function(name){
      if(internal.includes(name)||generated.includes(name))return;
      var raw=rawRead(name);rows.push({name:name,kind:'normal',size:raw.length,hash:hash(raw)});
    });
    // In 2v29 the sf filter already returns base names, without chunk suffixes.
    var seen={};s.list(undefined,{sf:true}).forEach(function(name){
      if(seen[name]===true)return;seen[name]=true;
      var data=sf(name);rows.push({name:name,kind:'storage-file',size:data.length,hash:hash(data)});
    });
    if(rows.length>512)throw Error('Troppi file per il backup');return rows;
  }
  function read(file,offset,length) {
    if(file.kind==='normal')return rawRead(file.name,offset,length);
    // Backups read sequential blocks. Retain only a reader and offset, never
    // the complete journal, and reopen safely for a retried/earlier block.
    if(!cursor||cursor.name!==file.name||cursor.next>offset)cursor={name:file.name,next:0,file:s.open(file.name,'r')};
    while(cursor.next<offset){var skip=cursor.file.read(Math.min(512,offset-cursor.next));if(!skip)throw Error('StorageFile incompleto');cursor.next+=skip.length;}
    var raw=cursor.file.read(length)||'';cursor.next+=raw.length;return raw;
  }
  var consent=false;
  return {load:load,save:save,hash:hash,canonical:canonical,inventory:inventory,
    isolated:function(){return global.VeraIsolatedMaintenance===true;},
    encrypted:function(){return !!NRF.getSecurityStatus().encrypted;},
    consent:function(){return consent;},setConsent:function(on){consent=on===true;},consumeConsent:function(){consent=false;},
    profileIdentity:function(){var p=s.readJSON('veranode.policy.json',1)||{};return {user:p.user,scope:p.scope,mac:p.mac};},
    now:function(){return Math.floor(getTime()*1000);},
    random:function(){return 'm-'+hash(E.toString(crypto.SHA256(NRF.getAddress()+getTime()+Math.random()))).slice(0,40);},
    readNormal:rawRead,writeNormal:function(name,data,offset,size){
      // Refuse automatic compaction while any program is executing in flash.
      if(s.getStats().freeBytes<data.length+(size||0)+4096)throw Error('Spazio libero insufficiente per aggiornare');
      if(s.write(name,data,offset,size)===false)throw Error('Scrittura flash non riuscita');
    },
    read:read,
    base64:btoa,unbase64:atob,
    progress:function(name){global.VeraMaintenanceProgress=name;},
    activate:function(){setTimeout(function(){global.load();},300);}
  };
};
