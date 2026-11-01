import {mkdir,readFile,writeFile} from 'node:fs/promises';
const root=process.cwd(),s=root+'/.checks/wasm-workerd';await mkdir(s+'/stage',{recursive:true});
await writeFile(s+'/stage/package.json','{"type":"module"}');
await writeFile(s+'/stage/tsconfig.json',JSON.stringify({compilerOptions:{strict:true,skipLibCheck:true,noEmit:true,allowImportingTsExtensions:true,target:'es2022',module:'nodenext',moduleResolution:'nodenext'}}));
for(const name of ['revenue','revenue-fixtures']){let text=await readFile(root+'/examples/demo/lib/'+name+'.ts','utf8');text=text.replace('../app/api/analytics/revenue/events.ts','./events.ts').replace('export async function revenue','export function revenue');await writeFile(s+'/stage/'+name+'.ts',text);}
await writeFile(s+'/stage/events.ts',await readFile(root+'/examples/demo/app/api/analytics/revenue/events.ts'));await writeFile(s+'/stage/json.ts',await readFile(root+'/packages/next-scriptc/src/functions/json.ts'));
await writeFile(s+'/linker.sh','#!/bin/sh\nprintf \'%s\\n\' "$@" > "$SCRIPTC_LINK_LOG"\nexec zig cc "$@"\n',{mode:0o755});
