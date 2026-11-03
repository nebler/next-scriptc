import {readFile,writeFile} from 'node:fs/promises';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {inputShapes} from './promotion-inputs.mjs';
import {fuzzFunction} from './promotion-fuzz.mjs';
const [requestFile,resultFile]=process.argv.slice(2);
const {module,addonFile,index,options}=JSON.parse(await readFile(requestFile,'utf8'));
try{
 const shapes=inputShapes(module,module.functions[0]);
 const reference=resultFile+'.mjs';await writeFile(reference,stripTypeScriptTypes(module.referenceNative??module.native));
 const js=(await import(pathToFileURL(reference).href))[module.functions[0].name];
 const addon=createRequire(import.meta.url)(addonFile);
 const context=vm.createContext({js,args:null}),call=new vm.Script('js(...args)');
 const checkedJS=(...args)=>{context.args=args;return call.runInContext(context,{timeout:Math.min(50,options.budgetMs)});};
 const result=fuzzFunction({js:checkedJS,native:encoded=>addon.run(index,encoded),schema:module.functions[0].boundary,shapes},options);
 await writeFile(resultFile,JSON.stringify(result));
}catch(e){await writeFile(resultFile,JSON.stringify({status:'unavailable',reason:e.stack,seed:options.seed}));}
