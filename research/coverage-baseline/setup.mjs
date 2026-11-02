// Creates only sparse external checkouts and small dependency slices. No app install.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const base=process.env.COVERAGE_APPS??'/Users/noah/code/coverage-apps';
const reuse=process.env.REUSE_NODE_MODULES??'/Users/noah/code/next-scriptc/examples/demo/node_modules';
const stateFile=path.join(base,'coverage-setup-owned.json');
if(process.argv.includes('--cleanup')){
 const state=JSON.parse(fs.readFileSync(stateFile));
 for(const p of state.reverse()){if(fs.lstatSync(p,{throwIfNoEntry:false})?.isSymbolicLink())fs.unlinkSync(p);else fs.rmSync(p,{recursive:true,force:true});}
 fs.unlinkSync(stateFile);process.exit(0);
}
fs.mkdirSync(base,{recursive:true});
const owned=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):[];
function track(p){owned.push(p);fs.writeFileSync(stateFile,JSON.stringify(owned,null,2));}
function dir(p){if(!fs.existsSync(p)){fs.mkdirSync(p,{recursive:true});track(p);}}
function link(target,p){if(!fs.existsSync(p)){fs.symlinkSync(target,p);track(p);}}
const apps={papermark:['mfts/papermark','ed19717ec02a1ac79aecf5569159aa9d2d869312',['lib','pages/api']],dub:['dubinc/dub','6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e',['apps/web/lib','apps/web/app/api','packages/utils','packages/tsconfig']],umami:['umami-software/umami','559e3c607c23d2c72d9bd4f6481bda428255323c',['src']]};
for(const [name,[remote,pin,sparse]] of Object.entries(apps).filter(([name])=>!process.env.RUN_APPS||process.env.RUN_APPS.split(',').includes(name))){
 const p=path.join(base,name);
 if(!fs.existsSync(p)){
  execFileSync('git',['clone','--no-checkout','--depth','1','--filter=blob:none',`https://github.com/${remote}.git`,p],{stdio:'inherit'});
  execFileSync('git',['-C',p,'fetch','--depth','1','origin',pin],{stdio:'inherit'});
  execFileSync('git',['-C',p,'sparse-checkout','set',...sparse],{stdio:'inherit'});
  execFileSync('git',['-C',p,'checkout','--detach','FETCH_HEAD'],{stdio:'inherit'});
 }
 if(execFileSync('git',['-C',p,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==pin)throw Error('Wrong pin '+name);
 dir(path.join(p,'node_modules'));link(path.join(reuse,'typescript'),path.join(p,'node_modules/typescript'));
 if(name==='dub')link('../packages/tsconfig',path.join(p,'node_modules/tsconfig'));
}
dir(path.join(repo,'node_modules'));link(path.join(reuse,'typescript'),path.join(repo,'node_modules/typescript'));
dir(path.join(repo,'packages/next-scriptc/node_modules'));link(path.join(reuse,'next'),path.join(repo,'packages/next-scriptc/node_modules/next'));
const deps=path.join(base,'deps');fs.mkdirSync(deps,{recursive:true});
if(fs.existsSync(path.join(deps,'node_modules')))throw Error('deps/node_modules already exists; use a fresh COVERAGE_APPS');
const lock=JSON.parse(fs.readFileSync(path.join(here,'deps-lock.json')));
fs.writeFileSync(path.join(deps,'package.json'),JSON.stringify({private:true,dependencies:lock.packages[''].dependencies}));
fs.copyFileSync(path.join(here,'deps-lock.json'),path.join(deps,'package-lock.json'));
track(path.join(deps,'node_modules'));execFileSync('npm',['ci','--prefix',deps,'--ignore-scripts','--no-audit','--no-fund'],{stdio:'inherit'});
