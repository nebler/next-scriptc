import {createServer} from "node:http";
const server=createServer((req,res)=>{
 const language=req.headers["accept-language"]??"en";
 const message=language.startsWith("de")?"Hallo von next-scriptc!":"Hello from next-scriptc!";
 res.setHeader("content-type","application/json");res.setHeader("vary","accept-language");res.setHeader("x-next-scriptc","native");res.end(JSON.stringify({message}));
});
server.keepAliveTimeout=60000;server.listen(Number(process.env.PORT),"127.0.0.1",()=>console.log("READY"));
