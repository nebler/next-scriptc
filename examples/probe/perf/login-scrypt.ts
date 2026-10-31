import { POST as handler } from "../../demo/app/api/login-scrypt/route.ts";

async function main() {
 
 const warm = Number(process.env.PERF_WARM ?? "2");
 const count = Number(process.env.PERF_COUNT ?? "5");
 const reps = Number(process.env.PERF_REPS ?? "3");
 const first = await handler(new Request("http://demo.test/api/login-scrypt", {method:"POST",body:JSON.stringify({email:"ada@example.com",password:"correct horse battery staple"})}));
 const body = await first.text();
 const headers: string[] = []; first.headers.forEach((v,k)=>headers.push(k+": "+v)); headers.sort();
 console.log(JSON.stringify({kind:"parity",status:first.status,headers,body:body}));
 for(let i=0;i<warm;i++) await (await handler(new Request("http://demo.test/api/login-scrypt", {method:"POST",body:JSON.stringify({email:"ada@example.com",password:"correct horse battery staple"})}))).text();
 console.log("WARM");
 for(let r=0;r<reps;r++) {
  const start = performance.now(); let bytes=0;
  for(let i=0;i<count;i++) {const response=await handler(new Request("http://demo.test/api/login-scrypt", {method:"POST",body:JSON.stringify({email:"ada@example.com",password:"correct horse battery staple"})}));if(response.status!==200) throw new Error("unexpected status"); bytes+=(await response.text()).length;}
  console.log(JSON.stringify({kind:"time",rep:r,count,ms:performance.now()-start,bytes,rss:process.memoryUsage().rss}));
 }
 process.exit(0);
}
main();
