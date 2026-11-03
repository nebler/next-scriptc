import {forecast} from '../../examples/shared-native/lib/forecast.ts';
const input={trials:10,seed:42,cash:250000,revenue:40000,costs:50000};
for(let i=0;i<100;i++)forecast(input);
for(let i=0;i<30;i++)for(const trials of [1000,10000,100000])forecast({...input,trials});
console.log('BEGIN steady workload');
let checksum=0;
for(let i=0;i<100;i++)for(const trials of [1000,10000,100000])checksum+=forecast({...input,trials}).solvent;
console.log('END steady workload',checksum);
