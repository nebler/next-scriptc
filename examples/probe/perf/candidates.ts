// Candidate routes: identical file and fixture sizes under Node and scriptc.
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

const bytes = Buffer.alloc(1024 * 1024);
for (let i=0;i<bytes.length;i++) bytes[i]=(i*31 + (i>>>8)) & 255;
const logRows: {region:number;amountCents:number;quantity:number;label:string}[]=[];
for(let i=0;i<5000;i++) logRows.push({region:i%8,amountCents:100+(i*7919)%49900,quantity:1+i%5,label:`item-${i}`});
const json = JSON.stringify(logRows);
const image = new Uint8Array(512*512*4);
for(let i=0;i<image.length;i++) image[i]=(i*17+(i>>>8)) & 255;
const coordinates = new Float64Array(20000*2);
for(let i=0;i<20000;i++){coordinates[2*i]=-85+(i*0.017)%170;coordinates[2*i+1]=-179+(i*0.031)%358;}

export function hashRoute():Response {
 return Response.json({sha256:createHash("sha256").update(bytes).digest("hex"),inputBytes:bytes.length});
}
export function compressionRoute():Response {
 // Real gzip export plus validation of its lossless result; no cached output.
 const compressed=gzipSync(json,{level:6});
 const restored=gunzipSync(compressed);
 return Response.json({sha256:createHash("sha256").update(restored).digest("hex"),inputBytes:Buffer.byteLength(json)});
}
export function aggregationRoute():Response {
 const rows=JSON.parse(json) as {region:number;amountCents:number;quantity:number;label:string}[];
 const totals=new Array<number>(8).fill(0);
 for(const row of rows) totals[row.region]+=row.amountCents*row.quantity;
 return Response.json({rows:rows.length,totals});
}
export function imageRoute():Response {
 // Integer Rec.601 luma + histogram, as in image analysis/preprocessing.
 const histogram=new Uint32Array(256);
 for(let i=0;i<image.length;i+=4){const y=(77*image[i]+150*image[i+1]+29*image[i+2])>>>8;histogram[y]++;}
 return Response.json({pixels:512*512,histogram:Array.from(histogram)});
}
export function geoRoute():Response {
 // Haversine radius filtering for 20k stores against a London origin.
 const lat=51.5074*Math.PI/180; const lng=-0.1278*Math.PI/180;
 let count=0;let metres=0;
 for(let i=0;i<coordinates.length;i+=2){
  const a=coordinates[i]*Math.PI/180;const b=coordinates[i+1]*Math.PI/180;
  const dlat=a-lat;const dlng=b-lng;
  const h=Math.sin(dlat/2)**2+Math.cos(lat)*Math.cos(a)*Math.sin(dlng/2)**2;
  const distance=6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  if(distance<1000000){count++;metres+=Math.round(distance);}
 }
 return Response.json({count,metres});
}
async function main(){
 const kind=process.env.PERF_CANDIDATE??"hash";
 const count=Number(process.env.PERF_COUNT??"100");
 function handle():Response {
  if(kind==="hash")return hashRoute();
  if(kind==="compression")return compressionRoute();
  if(kind==="aggregation")return aggregationRoute();
  if(kind==="image")return imageRoute();
  if(kind==="geo")return geoRoute();
  throw new Error("unknown candidate");
 }
 console.log(JSON.stringify({kind:"parity",body:await handle().text()}));
 for(let i=0;i<50;i++)await handle().text();
 for(let r=0;r<3;r++){
  const start=performance.now();let bytes=0;
  for(let i=0;i<count;i++)bytes+=(await handle().text()).length;
  console.log(JSON.stringify({kind:"time",candidate:kind,count,ms:performance.now()-start,bytes,rss:process.memoryUsage().rss}));
 }
}
main();
