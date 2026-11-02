// Install and validate one framework at a time, then remove all temporary output.
import {mkdtemp,cp,readFile,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const framework=process.argv[2];
if(!['nuxt','tanstack'].includes(framework))throw Error('Usage: node scripts/check-framework-node.mjs nuxt|tanstack');
const repo=path.resolve(import.meta.dirname,'..');
const root=await mkdtemp(path.join(tmpdir(),`scriptc-${framework}-`));
function run(args,options={}){
 const result=spawnSync(args[0],args.slice(1),{stdio:'inherit',...options});
 if(result.status!==0)throw Error(`${args[0]} exited ${result.status}`);
}
try{
 await cp(path.join(repo,`examples/${framework}-demo`),root,{recursive:true});
 const pkg=JSON.parse(await readFile(path.join(root,'package.json')));
 delete pkg.dependencies['scriptc-promote'];
 await writeFile(path.join(root,'package.json'),JSON.stringify(pkg));
 run(['npm','install','--no-package-lock'],{cwd:root});
 await symlink(path.join(repo,'packages/scriptc-promote'),path.join(root,'node_modules/scriptc-promote'));
 run([process.execPath,'--test','--test-concurrency=1','packages/scriptc-promote/test/frameworks-node.mjs'],{cwd:repo,env:{...process.env,[`SCRIPTC_${framework.toUpperCase()}_APP`]:root}});
}finally{await rm(root,{recursive:true,force:true});}
