import { GET as handler } from "../../demo/app/api/verify/route.ts";
import { SignJWT } from "jose";
import { jwtKey, issuer, audience, now } from "../../demo/app/api/verify/tokens.ts";

async function main() {
 const token = await new SignJWT({role:"editor"}).setProtectedHeader({alg:"HS256",typ:"JWT"}).setSubject("user-42").setIssuer(issuer).setAudience(audience).setIssuedAt(now()).setExpirationTime(now()+3600).sign(jwtKey);
 const warm = Number(process.env.PERF_WARM ?? "150");
 const count = Number(process.env.PERF_COUNT ?? "1000");
 const reps = Number(process.env.PERF_REPS ?? "3");
 const first = await handler(new Request("http://demo.test/api/verify", {headers:{authorization:"Bearer " + token}}));
 const body = await first.text();
 const headers: string[] = []; first.headers.forEach((v,k)=>headers.push(k+": "+v)); headers.sort();
 console.log(JSON.stringify({kind:"parity",status:first.status,headers,body:body}));
 for(let i=0;i<warm;i++) await (await handler(new Request("http://demo.test/api/verify", {headers:{authorization:"Bearer " + token}}))).text();
 console.log("WARM");
 for(let r=0;r<reps;r++) {
  const start = performance.now(); let bytes=0;
  for(let i=0;i<count;i++) {const response=await handler(new Request("http://demo.test/api/verify", {headers:{authorization:"Bearer " + token}}));if(response.status!==200) throw new Error("unexpected status"); bytes+=(await response.text()).length;}
  console.log(JSON.stringify({kind:"time",rep:r,count,ms:performance.now()-start,bytes,rss:process.memoryUsage().rss}));
 }
 process.exit(0);
}
main();
