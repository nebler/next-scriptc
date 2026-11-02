type Row={amount:number;weight:number;enabled:boolean};
export function aggregate(rows:Row[],scale:number){
 let sum=0,count=0;
 for(const row of rows){if(row.enabled){sum+=row.amount*row.weight*scale;count++;}}
 return {sum,count};
}
