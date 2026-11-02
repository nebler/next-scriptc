import {performance} from 'node:perf_hooks';
for(let i=0;i<3;i++)for(const [name,url] of Object.entries({node:'http://127.0.0.1:18993/numeric?n=20000',worker:'http://127.0.0.1:18991/numeric?n=20000&lane=worker',wasm:'http://127.0.0.1:18991/numeric?n=20000&lane=worker&compute=wasm'})){const t=performance.now();const r=await fetch(url);console.log(name,performance.now()-t,await r.text());}
for(let i=0;i<1000;i++){await (await fetch('http://127.0.0.1:18992/numeric?n=1000')).text();}
console.log(await (await fetch('http://127.0.0.1:18992/state')).text());
