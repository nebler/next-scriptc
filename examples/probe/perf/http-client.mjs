import http from 'node:http';
import {performance} from 'node:perf_hooks';
const port=Number(process.env.PORT);
const count=Number(process.env.PERF_COUNT??5000);
const warm=Number(process.env.PERF_WARM??500);
const reps=Number(process.env.PERF_REPS??3);
const pathname=process.env.PERF_PATH??'/api/hello';
const agent=new http.Agent({keepAlive:true,maxSockets:1});
let sockets=new Set();let first;
function request(){return new Promise((resolve,reject)=>{
 const req=http.get({host:'127.0.0.1',port,path:pathname,agent,headers:{'accept-language':'de-DE','x-forwarded-host':'demo.test','x-forwarded-proto':'https'}},res=>{
  let body='';res.setEncoding('utf8');res.on('data',c=>body+=c);res.on('end',()=>{if(res.statusCode!==200)reject(new Error('status '+res.statusCode));else {first??={body,headers:res.headers};resolve(body.length);}});
 });req.on('socket',s=>sockets.add(s));req.on('error',reject);
});}
try{
 for(let i=0;i<warm;i++)await request();
 console.log('WARM');
 for(let r=0;r<reps;r++){
  const start=performance.now();let bytes=0;let times=[];
  for(let i=0;i<count;i++){const t=performance.now();bytes+=await request();times.push(performance.now()-t);}
  times.sort((a,b)=>a-b);
  console.log(JSON.stringify({rep:r,count,ms:performance.now()-start,p50:times[Math.floor(count/2)],p95:times[Math.floor(count*.95)],p99:times[Math.min(count-1,Math.ceil(count*.99)-1)],bytes,sockets:sockets.size,first}));
 }
}finally{agent.destroy();}
