import {createRequire} from 'node:module';
import path from 'node:path';
const [install,output]=process.argv.slice(2);
const require=createRequire(path.resolve(install,'package.json'));
require('esbuild').buildSync({entryPoints:[`${import.meta.dirname}/csv-entry.ts`],bundle:true,platform:'node',format:'esm',outfile:output,nodePaths:[path.resolve(install,'node_modules')],banner:{js:'// @ts-nocheck'}});
