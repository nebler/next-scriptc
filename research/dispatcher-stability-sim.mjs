// Deterministic empirical resampling only. Does not invoke any workload/addon.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {decideLane,stabilityDefaults as policy} from '../packages/next-scriptc/src/functions/promotion-policy.mjs';
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
export function simulate(trials=1000){
 const windows=[1,2,3].map(w=>JSON.parse(readFileSync(new URL(`./standin/raw/m2-window${w}-phase1.json`,import.meta.url))));
 const report=[];
 for(const [index,size] of [1000,5000,15000,200000].entries()){
  let oldWrong=0,newWrong=0,stressWrong=0,firstEpochWrong=0;
  for(let seed=1;seed<=trials;seed++){
   let state=seed;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
   const pick=a=>a[Math.floor(random()*a.length)];
   const w=windows[(seed-1)%3],bucket=Object.values(w.decisions)[0].buckets[index];
   const js=w.rows.filter(r=>r.section==='bucket'&&r.mode==='js'&&r.n===size).map(r=>r.ms);
   const native=w.rows.filter(r=>r.section==='bucket'&&r.mode==='new'&&r.n===size).map(r=>r.ms);
   const expected=median(native)<median(js)?'native':'js-final';
   const old=median(Array.from({length:5},()=>pick(bucket.times)))<0.9*median(Array.from({length:60},()=>pick(bucket.js)))?'native':'js-final';
   oldWrong+=old!==expected;
   const pairs=Array.from({length:24},()=>[pick(js),pick(native)]);
   firstEpochWrong+=decideLane(pairs,'js-final')!==expected;
   let cleanLane='js-final';
   for(let epoch=0;epoch<8;epoch++)cleanLane=decideLane(Array.from({length:24},()=>[pick(js),pick(native)]),cleanLane);
   newWrong+=cleanLane!==expected;
   // In addition to observed service tails, inject 10% independent 3x
   // service stalls. Eight disjoint epochs permit correction. Scheduling
   // noise is deliberately absent: runShadow's clock excludes that delay.
   let lane='js-final';
   for(let epoch=0;epoch<8;epoch++){
    const pairs=Array.from({length:policy.samples},()=>[pick(js),pick(native)*(random()<0.1?3:1)]);
    lane=decideLane(pairs,lane);
   }
   stressWrong+=lane!==expected;
  }
  report.push({size,trials,oldWrong,firstEpochWrong,newWrong,stressWrong});
 }
 return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(simulate(),null,2));
