import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
// Babel must see the application's decorator dialect even when extracting just
// one undecorated function from a class-bearing source file.
export function parserOptions(source, options) {
 if(!options&&source){
  try {
   const ts=require(require.resolve('typescript',{paths:[path.dirname(source),process.cwd(),path.dirname(import.meta.filename)]}));
   const config=ts.findConfigFile(path.dirname(source),ts.sys.fileExists);
   if(config){const read=ts.readConfigFile(config,ts.sys.readFile);options=ts.parseJsonConfigFileContent(read.config,ts.sys,path.dirname(config)).options;}
  }catch{/* No project configuration: use standard decorators. */}
 }
 return {sourceType:'module',plugins:['typescript','jsx',options?.experimentalDecorators?'decorators-legacy':'decorators']};
}
