import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),s=root+'/.checks/napi-vercel',output=s+'/.vercel/output';
const config={runtime:'nodejs24.x',handler:'index.mjs',launcherType:'Nodejs',shouldAddHelpers:false,regions:['iad1'],architecture:'x86_64',memory:2048,maxDuration:300};
for(const name of ['bench','cold-node','cold-sidecar','cold-sync','cold-async']){
 const dir=output+'/functions/'+name+'.func';await mkdir(dir,{recursive:true});
 for(const file of ['revenue-js.mjs','revenue-fixtures.mjs','events.mjs','json.mjs','client.mjs','sidecar.mjs'])await copyFile(s+'/stage/'+file,dir+'/'+file);
 for(const file of ['revenue.node','functions'])await copyFile(s+'/'+file,dir+'/'+file);
 await writeFile(dir+'/index.mjs',(await readFile(import.meta.dirname+'/index.mjs','utf8'))+'\nexport const measurementFunction='+JSON.stringify(name)+';\n');
 await writeFile(dir+'/.vc-config.json',JSON.stringify(config));
}
await writeFile(output+'/config.json',JSON.stringify({version:3,regions:['iad1'],routes:['bench','cold-node','cold-sidecar','cold-sync','cold-async'].map(n=>({src:'/'+n,dest:'/'+n}))}));
await writeFile(import.meta.dirname+'/raw/function-config.json',JSON.stringify(config,null,2));
console.log('Build Output API: five Node 24 x86-64 iad1 Functions, all artifacts explicit');
