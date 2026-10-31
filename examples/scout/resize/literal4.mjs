// Restore the existing route's literal 4 bounds, identically for TS and Go.
// This is a diagnostic for 4x downscales, not a claimed compiler improvement.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const dir=import.meta.dirname, dst=path.join(dir,'.artifacts/literal4');
mkdirSync(dst,{recursive:true});
for(const f of ['bench.ts','go.mod','go.sum'])writeFileSync(path.join(dst,f),readFileSync(path.join(dir,f)));
writeFileSync(path.join(dst,'kernel.ts'),readFileSync(path.join(dir,'kernel.ts'),'utf8').replace('const scale = width / size;','const scale = 4;'));
writeFileSync(path.join(dst,'main.go'),readFileSync(path.join(dir,'main.go'),'utf8').replace('scale := width / size','scale := 4'));
execFileSync(process.execPath,[path.join(dir,'run.mjs'),'--sizes','1024:256,2048:512','--kinds','box','--output',path.join(dir,'mac-literal4-results.json')],{env:{...process.env,SCOUT_SOURCE_DIR:dst},stdio:'inherit'});
