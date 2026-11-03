import {createHash} from 'node:crypto';
import path from 'node:path';
import {withBrowserWasm} from 'scriptc-promote/browser/next';
import {withScriptc} from 'next-scriptc';
// Default automatic discovery. No directive, forced lane, or separate native port.
export default await withBrowserWasm(withScriptc({experimental: {cpus: 2}, env: {SHARED_NATIVE_FUNCTION_ID: createHash('sha256').update(path.join(import.meta.dirname, 'lib/forecast.ts') + '\0forecast').digest('hex').slice(0, 20)}}), {root:import.meta.dirname,sourceDir:'lib',functions:[{source:'lib/forecast.ts',name:'forecast',sizePath:[0,'trials'],key:'45cf321c6222ebad27c34266fa52826915007581fa34c88ea5c6fdd0c17280e8',buckets:[13,16]}]});
