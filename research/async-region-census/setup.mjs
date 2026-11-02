// Run coverage-baseline/setup.mjs with RUN_APPS=umami,dub first.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync as exec} from 'node:child_process';
const base=process.env.ASYNC_APPS??'/Users/noah/code/async-region-apps',app=path.join(base,'formbricks'),deps=path.join(base,'deps');
const repo=path.resolve(import.meta.dirname,'../..');
const pin='76b05fb98dd870000d820ad8a27527e483dcfbb0';
const stateFile=path.join(base,'a0-owned.json');
if(process.argv.includes('--cleanup')){for(const p of JSON.parse(fs.readFileSync(stateFile)).reverse())fs.rmSync(p,{recursive:true,force:true});fs.unlinkSync(stateFile);process.exit(0);}
fs.mkdirSync(base,{recursive:true});const owned=[];
function track(p){owned.push(p);fs.writeFileSync(stateFile,JSON.stringify(owned,null,2));}
function link(target,p){if(fs.existsSync(p))return;fs.mkdirSync(path.dirname(p),{recursive:true});fs.symlinkSync(target,p);track(p);}
function run(command,args,cwd=base){exec(command,args,{cwd,stdio:'inherit',env:{...process.env,PATH:path.join(deps,'node_modules/.bin')+path.delimiter+process.env.PATH}});}
if(!fs.existsSync(app)){run('git',['clone','--no-checkout','--depth','1','--filter=blob:none','https://github.com/formbricks/formbricks.git',app]);run('git',['-C',app,'fetch','--depth','1','origin',pin]);run('git',['-C',app,'sparse-checkout','set','--skip-checks','apps/web/lib/response','apps/web/lib/survey','packages/types','packages/database','packages/config-typescript','apps/web/app/(app)/workspaces/[workspaceId]/surveys/[surveyId]/(analysis)/summary/lib']);run('git',['-C',app,'checkout','--detach','FETCH_HEAD']);}
if(exec('git',['-C',app,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==pin)throw Error('wrong Formbricks pin');
fs.mkdirSync(deps,{recursive:true});const lock=JSON.parse(fs.readFileSync(new URL('deps-lock.json',import.meta.url)));fs.writeFileSync(path.join(deps,'package.json'),JSON.stringify({private:true,dependencies:lock.packages[''].dependencies}));fs.copyFileSync(new URL('deps-lock.json',import.meta.url),path.join(deps,'package-lock.json'));
if(fs.existsSync(path.join(deps,'node_modules')))throw Error('use a fresh ASYNC_APPS or clean task-owned dependencies first');track(path.join(deps,'node_modules'));run('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],deps);
const reuse=process.env.REUSE_NODE_MODULES??'/Users/noah/code/next-scriptc/examples/demo/node_modules';
link(path.join(reuse,'typescript'),path.join(app,'node_modules/typescript'));
for(const name of ['zod','prisma-json-types-generator','@prisma/client'])link(path.join(deps,'node_modules',name),path.join(app,'node_modules',name));
link(path.join(deps,'node_modules/.bin/prisma-json-types-generator'),path.join(app,'node_modules/.bin/prisma-json-types-generator'));
link(path.join(app,'packages/config-typescript'),path.join(app,'node_modules/@formbricks/config-typescript'));
for(const name of ['parser','traverse','generator','types'])link(path.join(deps,'node_modules/@babel',name),path.join(repo,'node_modules/@babel',name));
const config=path.join(deps,'a0-prisma.config.ts');fs.writeFileSync(config,`import {defineConfig} from 'prisma/config';\nexport default defineConfig({schema:${JSON.stringify(path.join(app,'packages/database/schema'))}});\n`);track(config);
track(path.join(app,'packages/database/generated'));
// Prisma locates its JSON generator through the app's node_modules package link.
run(process.execPath,[path.join(deps,'node_modules/prisma/build/index.js'),'generate','--config',config],app);
