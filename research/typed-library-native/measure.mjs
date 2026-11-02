// Run only after every build has finished. No overlapping timing jobs.
import {spawnSync} from 'node:child_process';
for(const [library,variant] of [['json-2-csv','untyped'],['fastest-levenshtein','untyped'],['fastest-levenshtein','typed']]){
 const r=spawnSync(process.execPath,[new URL('./check.mjs',import.meta.url).pathname,process.argv[2],library,variant],{stdio:'inherit',timeout:360000});
 if(r.status)throw Error(`${library} ${variant} failed`);
 console.log('Finished',library,variant);
}
