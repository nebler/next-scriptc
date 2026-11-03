import {createHash} from 'node:crypto';
import path from 'node:path';
import {withBrowserWasm} from 'scriptc-promote/browser/next';
import {withScriptc} from 'next-scriptc';
// Default automatic discovery. No directive, forced lane, or separate native port.
export default await withBrowserWasm(withScriptc({experimental: {cpus: 2}, env: {SHARED_NATIVE_FUNCTION_ID: createHash('sha256').update(path.join(import.meta.dirname, 'lib/forecast.ts') + '\0forecast').digest('hex').slice(0, 20)}}), {root:import.meta.dirname,sourceDir:'lib',functions:[{source:'lib/forecast.ts',name:'forecast',sizePath:[0,'trials'],key:'58aa1dd1ed19f90bd2292725504961ce7f09588e68332e67372b1c2906db815f',buckets:[9,13,16]}]});
