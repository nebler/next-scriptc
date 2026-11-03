// A string facade also compiles as the Cloudflare reactor ABI.
function equal(a:string,b:string):boolean{return a===b;}
export function run(input:string):string {
 if(input==="zero")return JSON.stringify([Object.is(-0,0),Object.is(-0,-0),-0]);
 if(input==="nan")return JSON.stringify([NaN,Infinity,-Infinity]);
 if(input==="integer")return JSON.stringify([2147483647+1,(2147483647+1)|0,Math.imul(2147483647,2),9007199254740991+1,9007199254740991+2]);
 if(input==="float")return JSON.stringify([0.1+0.2,1e-7,1e21,5e-324]);
 if(input==="string")return JSON.stringify(["😀"<"\uffff",equal("é","e\u0301"),["é","😀","a","\uffff"].sort()]);
 if(input==="stable")return JSON.stringify([{k:1,id:"b"},{k:1,id:"a"},{k:0,id:"c"}].sort((a,b)=>a.k-b.k));
 if(input==="map"){const m=new Map<string,number>();m.set("b",1);m.set("a",2);m.set("b",3);m.delete("a");m.set("a",4);return JSON.stringify(Array.from(m.entries()));}
 if(input==="set"){const s=new Set<string>();s.add("b");s.add("a");s.add("b");s.delete("b");s.add("b");return JSON.stringify(Array.from(s));}
 return JSON.stringify({"10":1,"2":2,b:3,a:4,"01":5});
}
