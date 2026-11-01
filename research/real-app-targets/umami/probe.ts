import { flattenJSON } from './entry.ts';
console.log(JSON.stringify(flattenJSON({a:{b:1},c:[2,3]})));
