import {mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

// Conservative instance lease: covers initialization and every owner-thread job,
// including async jobs after the caller returns. No filesystem work per call.
export function promotionCrashGuard(file, {directory=process.env.NEXT_SCRIPTC_CRASH_DIR??path.join(tmpdir(),'next-scriptc-crashes'), reset=process.env.NEXT_SCRIPTC_RESET_CRASH==='1'}={}) {
 const hash=createHash('sha256');
 for(const name of ['promotion.node','ids.json','encodings.json'])hash.update(readFileSync(path.join(path.dirname(file),name)));
 const dir=path.join(directory,hash.digest('hex'));
 mkdirSync(dir,{recursive:true,mode:0o700});
 // PID liveness alone is insufficient after PID reuse. Failure to obtain an
 // identity fails closed through loadPromotion's JS-only error handler.
 const birth=pid=>execFileSync('ps',['-o','lstart=','-p',String(pid)],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 let disabled=false;
 for(const name of readdirSync(dir)){
  if(!name.endsWith('.active'))continue;
  const pid=Number(name.split('-')[0]);let alive=true;
  try{process.kill(pid,0);}catch(e){alive=e.code!=='ESRCH';}
  if(alive){let identity;try{identity=birth(pid);}catch{identity='';}alive=!!identity&&readFileSync(path.join(dir,name),'utf8')===identity;}
  if(!alive){if(reset)unlinkSync(path.join(dir,name));else disabled=true;}
 }
 let lease,active=0;
 return {disabled,arm(){
  if(disabled)throw Error('Previous native process did not exit cleanly; promotion disabled');
  if(lease)return;
  lease=path.join(dir,`${process.pid}-${randomUUID()}.active`);
  writeFileSync(lease,birth(process.pid),{flag:'wx',mode:0o600});
  process.once('exit',()=>{if(active)return;try{unlinkSync(lease);lease=undefined;}catch{}});
 },enter(){this.arm();active++;},leave(){active--;}};
}
