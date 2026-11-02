import {numeric} from './compute/numeric';
export function run(input:string):string {return JSON.stringify(numeric(JSON.parse(input) as number));}
