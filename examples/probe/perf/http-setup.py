from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
p=ROOT/'examples/probe/perf'
s=(p/'shim/serve.ts').read_text()
# Each ablation runs under identical HTTP keep-alive load. These are diagnostics,
# not proposed replacements for arbitrary streaming/cookie routes.
(p/'http-full.ts').write_text('import {serve} from "./shim/serve.ts";\nimport {GET} from "../../demo/app/api/hello/route.ts";\nserve({GET,HEAD:undefined,POST:undefined,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},{pattern:"/api/hello"});\n')
(p/'http-bare.ts').write_text('''import {createServer} from "node:http";
const server=createServer((req,res)=>{
 const language=req.headers["accept-language"]??"en";
 const message=language.startsWith("de")?"Hallo von next-scriptc!":"Hello from next-scriptc!";
 res.setHeader("content-type","application/json");res.setHeader("vary","accept-language");res.setHeader("x-next-scriptc","native");res.end(JSON.stringify({message}));
});
server.keepAliveTimeout=60000;server.listen(Number(process.env.PORT),"127.0.0.1",()=>console.log("READY"));
''')
(p/'http-web.ts').write_text('''import {createServer} from "node:http";
import {GET} from "../../demo/app/api/hello/route.ts";
const server=createServer(async(req,res)=>{
 const headers=new Headers();for(let i=0;i<req.rawHeaders.length;i+=2)headers.append(req.rawHeaders[i],req.rawHeaders[i+1]);
 const response=GET(new Request("http://localhost"+req.url,{headers}));
 response.headers.forEach((v,k)=>res.setHeader(k,v));res.setHeader("x-next-scriptc","native");
 res.end(new Uint8Array(await response.arrayBuffer()));
});
server.keepAliveTimeout=60000;server.listen(Number(process.env.PORT),"127.0.0.1",()=>console.log("READY"));
''')
# Same shim with only static-body response experiment, preserving input path.
body_start=s.index('  const body = response.body;')
body_end=s.index('\n}\n\nexport function serve',body_start)
fast=s[:body_start]+'''  if(head) { if(response.body) await response.body.cancel(); outgoing.end();return; }
  outgoing.end(new Uint8Array(await response.arrayBuffer()));'''+s[body_end:]
(p/'shim/buffered.ts').write_text(fast)
(p/'http-buffered.ts').write_text((p/'http-full.ts').read_text().replace('./shim/serve.ts','./shim/buffered.ts'))
(p/'shim/typed.ts').write_text(s.replace('export type RouteResponse = Response | NextResponse;','export type RouteResponse = Response;'))
(p/'http-typed.ts').write_text((p/'http-full.ts').read_text().replace('./shim/serve.ts','./shim/typed.ts'))
# Group by route pattern: reuse the snapshotted shim request/response implementation.
start=s.index('export function serve('); const_get=s.index('  const get = module.GET;',start)
g=s[:start]+'''function createRoute(module: RouteModule, options: { pattern: string }) {
'''+s[const_get:]
g=g.replace('  const server = createServer(async (incoming, outgoing) => {','  const handle = async (incoming: IncomingMessage, outgoing: ServerResponse) => {',1)
end=g.index('  });\n  // httpxy')
g=g[:end]+'''  };
  return { match, handle };
}
export function serveMany(routes: {module: RouteModule; pattern: string}[], options: {port?:number} = {}):void {
  const port=options.port??Number(process.env.PORT);
  const handlers=routes.map(route=>createRoute(route.module,{pattern:route.pattern}));
  const server=createServer(async (incoming,outgoing)=>{
    const pathname=(incoming.url??"/").split("?")[0];
    try {
      for(const route of handlers) if(route.match(pathname)!==null) { await route.handle(incoming,outgoing);return; }
      incoming.resume();outgoing.statusCode=404;outgoing.end();
    } catch {incoming.resume();outgoing.statusCode=400;outgoing.end();}
  });
'''+g[end+5:]
# tail references options.port, valid in new serveMany.
(p/'shim/grouped.ts').write_text(g)
work=[('hello','/api/hello','hello','GET'),('search','/api/search','search','GET'),('markdown','/api/posts/[slug]','posts/[slug]','GET'),('verify','/api/verify','verify','GET'),('scrypt','/api/login-scrypt','login-scrypt','POST'),('primes','/api/primes','primes','GET')]
imports='import {serveMany} from "./shim/grouped.ts";\n'
items=[]
for alias,pattern,path,method in work:
 imports+=f'import {{{method} as {alias}}} from "../../demo/app/api/{path}/route.ts";\n'
 fields=','.join(f'{m}:{alias if m==method else "undefined"}' for m in ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'])
 items.append('{module:{'+fields+'},pattern:'+repr(pattern)+'}')
 # Separate identical-shim binaries for fair summed RSS comparison.
 (p/f'http-single-{alias}.ts').write_text('import {serve} from "./shim/serve.ts";\n'+f'import {{{method} as {alias}}} from "../../demo/app/api/{path}/route.ts";\nserve({{{fields}}},{{pattern:{pattern!r}}});\n')
(p/'http-grouped.ts').write_text(imports+'serveMany(['+','.join(items)+']);\n')
# Component microbench: increments are explanatory, do not sum to whole HTTP CPU.
(p/'components.ts').write_text('''import {NextRequest} from "./shim/next-server.ts";
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
''')
