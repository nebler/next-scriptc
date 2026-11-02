// Measurement-only host override for apps whose compiler package has no JS sys API.
// Uses the app's installed root TypeScript, never changes application dependencies.
import Module,{createRequire} from 'node:module';
const root=process.env.DEV_CENSUS_TYPESCRIPT_HOST_ROOT;
if(root){
 const require=createRequire(import.meta.url),host=require.resolve('typescript',{paths:[root]}),ts=require(host);
 if(!ts.sys?.readFile||!ts.createProgram)throw Error('Requested root TypeScript has no compatible Node compiler API');
 const resolve=Module._resolveFilename;
 Module._resolveFilename=function(request,...args){return request==='typescript'?host:resolve.call(this,request,...args);};
}
