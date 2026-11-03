// Research-only replacement of the measurement child; production policy is unchanged.
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const original=cp.execFile;
cp.execFile=function(file,args,options,callback){
 if(args?.[0]?.endsWith('/report-measure.mjs'))args=[new URL('./worker.mjs',import.meta.url).pathname,...args.slice(1)];
 return original.call(this,file,args,options,callback);
};
syncBuiltinESMExports();
