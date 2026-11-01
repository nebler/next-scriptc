import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {scratch,root,save} from './common.mjs';
const compiler=process.env.SCRIPTC||'/Users/noah/code/next-scriptc/packages/next-scriptc/node_modules/scriptc/bin/scriptc.exe';
const p=JSON.parse(await readFile(scratch+'/stage/profile.json'));
const cases=[['unchanged-async',{...p,entry:'revenue-js.ts',exports:[{export:'revenue',symbol:'rev_revenue',params:['string','string','f64','bool'],returns:'string'}]}],['object-result',{...p,entry:'revenue.ts',exports:[{export:'revenue',symbol:'rev_revenue',params:['string','string','f64','bool'],returns:'string'}]}]];
const results=[];
for(const [name,profile] of cases){
 const file=scratch+'/stage/probe-'+name+'.json';await writeFile(file,JSON.stringify(profile,null,2));
 const args=['build','--lib','--profile',file,'-o',scratch+'/probe-'+name+'.lib.a'];const r=spawnSync(compiler,args,{cwd:scratch,encoding:'utf8',env:{...process.env,SCRIPTC_CHECKER_SERVER:'0'}});
 await writeFile(root+'/research/napi/logs/probe-'+name+'.log',JSON.stringify({args,status:r.status,signal:r.signal})+'\n'+r.stdout+r.stderr);results.push({name,status:r.status,stdout:r.stdout,stderr:r.stderr});
 if(r.status===0)throw new Error(name+' unexpectedly succeeded');
}
await save('abi-probes',results);
