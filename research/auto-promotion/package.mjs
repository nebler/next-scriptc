import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),s=root+'/.checks/auto-promotion';
const dir=s+'/.vercel/output/functions/bench.func';await mkdir(dir,{recursive:true});
for(const file of ['core.mjs','events.mjs','json.mjs','promotion.mjs'])await copyFile(s+'/stage/'+file,dir+'/'+file);
for(const file of ['promotion.node','ids.json'])await copyFile(s+'/linux/'+file,dir+'/'+file);
await copyFile(import.meta.dirname+'/bench.mjs',dir+'/index.mjs');
await writeFile(dir+'/.vc-config.json',JSON.stringify({runtime:'nodejs24.x',handler:'index.mjs',launcherType:'Nodejs',shouldAddHelpers:false,regions:['iad1'],architecture:'x86_64',memory:2048,maxDuration:300}));
await writeFile(s+'/.vercel/output/config.json',JSON.stringify({version:3,regions:['iad1'],routes:[{src:'/bench',dest:'/bench'}]}));
await copyFile('/Users/noah/code/next-scriptc/.vercel/project.json',s+'/.vercel/project.json');
// The identical measurement code also executes against the host addon locally.
await copyFile(import.meta.dirname+'/bench.mjs',s+'/stage/bench.mjs');
for(const file of ['promotion.node','ids.json'])await copyFile(s+'/host/'+file,s+'/stage/'+file);
