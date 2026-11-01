// Extracted arithmetic, corpus generator and insertion from demo vectors sources.
const dimensions=768;
let corpus: Int8Array | null=null;
let count=0;
function data(n:number):Int8Array {
  if(corpus!==null && count===n) return corpus;
  const value=new Int8Array(n*dimensions);let state=0x12345678;
  for(let i=0;i<value.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;value[i]=((state>>>0)%255)-127;}
  corpus=value;count=n;return value;
}
function insert(score:number,id:number,scores:Int32Array,ids:Int32Array):void {
  if(score<=scores[9])return;
  let j=9;while(j>0 && score>scores[j-1]){scores[j]=scores[j-1];ids[j]=ids[j-1];j--;}
  scores[j]=score;ids[j]=id;
}
export function vector(n:number,values:number[]) {
  const corpus=data(n);const embedding=new Int8Array(dimensions);
  if(values.length!==dimensions)throw new Error('expected 768 dimensions');
  for(let j=0;j<dimensions;j++){const x=values[j];if(!Number.isInteger(x)||x< -128||x>127)throw new Error('expected signed int8');embedding[j]=x;}
  const scores=new Int32Array(10),ids=new Int32Array(10);scores.fill(-2147483648);ids.fill(-1);
  for(let row=0;row<n;row++){
    let sum=0;const base=row*dimensions;
    for(let j=0;j<dimensions;j++)sum=(sum+Math.imul(corpus[base+j],embedding[j]))|0;
    insert(sum,row,scores,ids);
  }
  const results:{id:number;score:number}[]=[];
  for(let j=0;j<10;j++)results.push({id:ids[j],score:scores[j]});
  return {results};
}

export function run(n:number):string {const v:number[]=[];for(let i=0;i<768;i++)v.push(1);return JSON.stringify(vector(n,v));}
