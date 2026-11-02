type RecordRow={category:string;amount:number;weight:number;enabled:boolean;label:string;region:string;sequence:number;timestamp:number};
export function aggregate(rows:RecordRow[],scale:number){
 let sum=0,count=0;const selected=[];
 for(const row of rows){if(row.enabled){sum+=row.amount*row.weight*scale;count++;if(count===1)selected.push(row);}}
 return {sum,count,selected};
}
