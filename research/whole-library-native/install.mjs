import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'whole-library-native-')));
const lock=JSON.parse(fs.readFileSync(new URL('./deps-lock.json',import.meta.url)));
fs.writeFileSync(path.join(work,'package.json'),JSON.stringify({name:lock.name,private:true,dependencies:lock.packages[''].dependencies}));
fs.writeFileSync(path.join(work,'package-lock.json'),JSON.stringify(lock));
const out=spawnSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:work,stdio:'inherit'});
if(out.status)throw Error(`Install failed; remove ${work}`);
for(const file of ['node_modules/esbuild/install.js','node_modules/scriptc/scripts/install-native.mjs']){const setup=spawnSync(process.execPath,[path.join(work,file)],{cwd:work,stdio:'inherit'});if(setup.status)throw Error(`Toolchain setup failed; remove ${work}`);}
console.log(work);
