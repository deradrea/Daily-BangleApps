const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const dir=process.env.VERA_ESPRUINO_EMULATOR_DIR;
if(!dir)throw Error('Set VERA_ESPRUINO_EMULATOR_DIR to the pinned 2v29 emulator');
(async()=>{let output='',ready;const initialized=new Promise(r=>ready=r);
const c=vm.createContext({console:{log(){},warn(){},error(){}},require,process,Buffer,__dirname:dir,setTimeout,clearTimeout,setInterval,clearInterval,Module:{noInitialRun:true,onRuntimeInitialized:()=>ready()}});
for(const n of ['emulator_banglejs2.js','emu_banglejs2.js','common.js'])vm.runInContext(fs.readFileSync(path.join(dir,n),'utf8'),c);
await initialized;c.jsRXCallback=ch=>output+=String.fromCharCode(ch);c.jsUpdateGfx=()=>{};c.jsInit();
const code='(function(){var s=require("Storage"),f=s.open("sample","w");for(var i=0;i<2000;i++)f.write("synthetic sample line\\n");var a={sf:s.list(undefined,{sf:true}),all:s.list(),normal:s.list(undefined,{sf:false})};s.erase("sample");a.afterNormalErase=s.list(undefined,{sf:true});s.erase("sample\\x01");a.afterFirstChunkErase={sf:s.list(undefined,{sf:true}),all:s.list()};s.open("sample","r").erase();a.afterStreamErase={sf:s.list(undefined,{sf:true}),all:s.list()};return a;})()';
c.jsTransmitString('\x10print("STORAGE_PROBE"+JSON.stringify('+code+'))\n');c.jsStopIdle();console.log(output.slice(output.indexOf('STORAGE_PROBE')));process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});

