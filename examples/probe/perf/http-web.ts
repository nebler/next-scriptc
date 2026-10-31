import {createServer} from "node:http";
import {GET} from "../../demo/app/api/hello/route.ts";
const server=createServer(async(req,res)=>{
 const headers=new Headers();for(let i=0;i<req.rawHeaders.length;i+=2)headers.append(req.rawHeaders[i],req.rawHeaders[i+1]);
 const response=GET(new Request("http://localhost"+req.url,{headers}));
 response.headers.forEach((v,k)=>res.setHeader(k,v));res.setHeader("x-next-scriptc","native");
 res.end(new Uint8Array(await response.arrayBuffer()));
});
server.keepAliveTimeout=60000;server.listen(Number(process.env.PORT),"127.0.0.1",()=>console.log("READY"));
