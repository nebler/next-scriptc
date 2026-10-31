import {NextRequest} from "./shim/next-server.ts";
const count=10000; const raw=["Host","localhost:3000","Connection","keep-alive","Accept-Language","de-DE","X-Forwarded-Host","demo.test","X-Forwarded-Proto","https"];
let sink=0;
function work(kind:string){
 if(kind==="headers"){const h=new Headers();for(let i=0;i<raw.length;i+=2)h.append(raw[i],raw[i+1]);h.set("host","demo.test");sink+=h.get("host")!.length;}
 else if(kind==="url"){const url=new URL("/api/hello?x=a%20b","https://demo.test");url.search=url.searchParams.toString();sink+=url.href.length;}
 else if(kind==="request"){const r=new Request("https://demo.test/api/hello",{headers:{"accept-language":"de-DE"}});sink+=r.headers.get("accept-language")!.length;}
 else if(kind==="wrapper"){const r=new NextRequest("https://demo.test/api/hello",{headers:{"accept-language":"de-DE"}});sink+=r.headers.get("accept-language")!.length;}
 else {const parts="/api/hello".split("/");parts.shift();for(const part of parts)sink+=decodeURIComponent(part).length;const params:Record<string,string|string[]>={};Promise.resolve(params);}
}
async function main(){for(const kind of ["headers","url","request","wrapper","match"]){for(let i=0;i<1000;i++)work(kind);for(let r=0;r<3;r++){const start=performance.now();for(let i=0;i<count;i++)work(kind);console.log(JSON.stringify({kind,count,ms:performance.now()-start,sink}));}}}
main();
