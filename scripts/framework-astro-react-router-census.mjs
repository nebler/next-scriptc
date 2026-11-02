// Source-only census of pinned external checkouts. Install each app's dependencies first.
import {execFileSync} from 'node:child_process';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {discoverPromotions} from '../packages/scriptc-promote/src/functions/promotion-discovery.mjs';
const pins={astro:{repository:'satnaing/astro-paper',commit:'25d25437cf85b5df77c26b094ccc7035c6adddad',source:'src'},'react-router':{repository:'cjfff/realworld-remix',commit:'59cf71947386f4ffac13f95b5f0ef47237e36c4a',source:'app'}};
const [framework,directory]=process.argv.slice(2),pin=pins[framework];if(!pin||!directory)throw Error('Usage: node scripts/framework-astro-react-router-census.mjs astro|react-router /external/checkout');
const root=path.resolve(directory),commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();if(commit!==pin.commit)throw Error('Unexpected commit '+commit);
const diagnostics=[];
const modules=await discoverPromotions(root,path.join(root,'dist'),{promotionSourceDir:pin.source,typescript:{tsconfigPath:'tsconfig.json'}},m=>diagnostics.push(m.replaceAll(root,'<app>')));
const files=(await readdir(path.join(root,pin.source),{recursive:true})).filter(f=>/\.[cm]?[jt]sx?$/.test(f));
const manifest=JSON.parse(await readFile(path.join(root,'package.json')));
const result={framework,repository:pin.repository,commit,sourceDirectory:pin.source,sourceFiles:files.length,eligible:modules.length,frameworkRange:manifest.dependencies?.[framework==='astro'?'astro':'react-router'],functions:modules.flatMap(m=>m.functions.map(f=>({file:path.relative(root,m.source),name:f.name}))),diagnostics};
await writeFile(new URL(`../research/framework-${framework}-census.json`,import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,diagnostics:diagnostics.length}));
