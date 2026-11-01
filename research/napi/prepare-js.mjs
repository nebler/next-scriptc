// Run before cold.mjs when reusing artifacts from an earlier build.
import {readFile,writeFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {scratch,root} from './common.mjs';
for(const name of ['revenue-js','revenue-fixtures','events','json']){
 const ts=(await readFile(scratch+'/stage/'+name+'.ts','utf8')).replaceAll('.ts"','.mjs"').replaceAll(".ts'",".mjs'");
 await writeFile(scratch+'/stage/'+name+'.mjs',stripTypeScriptTypes(ts,{mode:'strip'}));
}
await writeFile(scratch+'/stage/client.mjs',(await readFile(root+'/packages/next-scriptc/src/functions/client.mjs','utf8')).replace('./json.ts','./json.mjs'));
await writeFile(scratch+'/stage/sidecar.mjs',await readFile(root+'/packages/next-scriptc/src/functions/sidecar.mjs'));
