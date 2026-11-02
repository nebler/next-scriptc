import {spawn,execFileSync} from 'node:child_process';
const [binary, prefix] = process.argv.slice(2);
for(const kind of ['events','strings','maps','copy','generic','json']){
 const p=spawn(binary,[kind,'50000','1000000'],{stdio:'ignore'});
 try{execFileSync('/usr/bin/sample',[String(p.pid),'3','1','-file',`${prefix}-${kind}.sample.txt`],{timeout:20000,stdio:'pipe'});console.log(kind,'profiled');}finally{p.kill('SIGKILL');}
}
