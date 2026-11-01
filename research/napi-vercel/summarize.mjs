import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const dir=import.meta.dirname+'/raw',read=n=>JSON.parse(readFileSync(dir+'/'+n+'.json'));
const stats=values=>{const s=values.toSorted((a,b)=>a-b);return {n:s.length,p50:s[Math.ceil(s.length*.5)-1],p95:s[Math.ceil(s.length*.95)-1],min:s[0],max:s.at(-1)};};
const summary={warm:[],cold:[],deployments:[],lifecycle:read('lifecycle')};
for(const size of [1000,5000,15000,200000]){
 if(!existsSync(dir+'/1-bench-'+size+'.json'))continue;
 const r=read('1-bench-'+size);for(const mode of ['node','sidecar','sync','async'])summary.warm.push({size,mode,instance:r.result.instance,sha256:r.result.expectedSha256,...stats(r.result.rows.filter(x=>x.mode===mode&&x.i>=0).map(x=>x.ms))});
}
for(const mode of ['node','sidecar','sync','async']){
 const samples=[1,2].filter(i=>existsSync(dir+'/'+i+'-cold-'+mode+'-5000.json')).map(i=>{const r=read(i+'-cold-'+mode+'-5000');return {pair:i,instance:r.result.instance,...r.result.cold};});
 if(samples.length)summary.cold.push({mode,samples:samples.map(({value,...rest})=>rest),load:stats(samples.map(x=>x.loadMs)),firstCall:stats(samples.map(x=>x.firstCallMs)),total:stats(samples.map(x=>x.totalMs))});
}
for(const i of [1,2])if(existsSync(dir+'/deployment-'+i+'.json')){const raw=read('deployment-'+i),d=raw.deployment??raw;summary.deployments.push({id:d.id,url:'https://'+d.url.replace(/^https:\/\//,'')});}
writeFileSync(dir+'/summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
