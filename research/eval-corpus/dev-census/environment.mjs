// Static resolver evidence only: never imports or executes application code.
import {createRequire} from 'node:module';
import path from 'node:path';
import {readdirSync} from 'node:fs';
const require=createRequire(import.meta.url);
export function environmentEvidence(root,scopes){
 const ts=require(require.resolve('typescript',{paths:[root]}));
 const cfg=path.join(root,'tsconfig.json'),loaded=ts.readConfigFile(cfg,ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(loaded.config??{compilerOptions:{strict:true}},ts.sys,root);
 const files=[];function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith('.')||['node_modules','test','tests'].includes(e.name))continue;const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.[cm]?[jt]sx?$/.test(f))files.push(f);}}if(process.env.DEV_CENSUS_SOURCE_FILES)files.push(...JSON.parse(process.env.DEV_CENSUS_SOURCE_FILES));else for(const s of scopes)walk(path.join(root,s));
 const options={...parsed.options,allowJs:true,moduleResolution:parsed.options.moduleResolution??ts.ModuleResolutionKind.Bundler};
 const program=ts.createProgram(files,options),result=[];
 for(const sf of program.getSourceFiles()){
  if(sf.fileName.includes('/typescript/lib/lib.'))continue;
  const imports=[];function visit(n){if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){const specifier=n.moduleSpecifier.text,r=ts.resolveModuleName(specifier,sf.fileName,options,ts.sys).resolvedModule;imports.push({specifier,resolved:r?path.relative(root,r.resolvedFileName):null,declaration:!!r?.resolvedFileName.endsWith('.d.ts')});}ts.forEachChild(n,visit);}visit(sf);
  if(imports.length)result.push({file:path.relative(root,sf.fileName),imports});
 }
 return {includesDeclarationImports:true,typescript:ts.version,configErrors:parsed.errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')),files:result};
}
