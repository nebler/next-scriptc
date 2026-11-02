export function aggregateColumns(rows:{amount:number[];weight:number[];enabled:boolean[]},scale:number){
 let sum=0,count=0;
 for(let i=0;i<rows.amount.length;i++){if(rows.enabled[i]){sum+=rows.amount[i]*rows.weight[i]*scale;count++;}}
 return {sum,count};
}
