// Shared by the real controller and local dry-run; stdout checkpoints survive VM loss.
import {Writable} from 'node:stream';
import {writeFileSync} from 'node:fs';
export function checkpointStream(output,forward=process.stdout){
 let buffer='',report;
 return new Writable({write(chunk,encoding,done){
  try{
   if(forward)forward.write(chunk);
   buffer+=chunk.toString();let end;
   while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
    if(line.startsWith('META '))report={...JSON.parse(line.slice(5)),status:'partial',runs:[],startup:[],fallback:[]};
    else if(report&&line.startsWith('ROW '))report.runs.push(JSON.parse(line.slice(4)));
    else if(report&&line.startsWith('START '))report.startup.push(JSON.parse(line.slice(6)));
    else if(report&&line.startsWith('FALLBACK '))report.fallback.push(JSON.parse(line.slice(9)));
    else if(report&&line==='DONE')report.status='complete';
    else continue;
    writeFileSync(output,JSON.stringify(report,null,2)+'\n');
   }
   done();
  }catch(error){done(error)}
 }});
}
