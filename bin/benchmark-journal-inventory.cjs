const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const {MemoryStorage}=require('../test/veranode/helpers.cjs');
const current=require('../apps/veranode/core.js');
const originalSource=cp.execFileSync('git',['show','HEAD:apps/veranode/core.js'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
const ctx={exports:{}};vm.runInNewContext(originalSource,ctx);const previous=ctx.exports;
const results=[];
for(const count of [92,272]){
 const store=new MemoryStorage(),journal=new current.Journal(store,'s',{maxSegments:count,segmentRecords:1});
 for(let i=0;i<count;i++)journal.append('sample',i,{bpm:72});
 const raw=[...store.files.entries()];
 for(const [name,core] of [['baseline_HEAD',previous],['candidate',current]]){
  const files=store.list(undefined,{sf:true});let searches=0,comparisons=0;
  files.includes=function(target){searches++;for(const value of this){comparisons++;if(value===target)return true;}return false;};
  const n=new core.Journal(store,'s',{maxSegments:count,segmentRecords:1,files});
  if(n.pending()!==count||JSON.stringify([...store.files.entries()])!==JSON.stringify(raw))throw Error('Recovery changed');
  results.push({segments:count,implementation:name,inventorySearches:searches,linearSearchComparisons:comparisons,pending:n.pending()});
 }
}
const out=path.resolve(__dirname,'../../vera-mobile/build/bangle-review-inventory-2026-10-20.json');
fs.writeFileSync(out,JSON.stringify({kind:'software-operation-count-not-hardware-timing',results},null,2));console.log(JSON.stringify(results));
