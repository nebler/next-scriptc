import {createServerFn} from '@tanstack/react-start';
import {checksum} from './checksum';
export const compute=createServerFn({method:'GET'})
 .validator((n:number)=>n)
 .handler(({data})=>checksum(data));
