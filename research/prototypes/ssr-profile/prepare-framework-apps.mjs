// Apply only to disposable clones under /tmp/nsc-ssr-r2, before production builds.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
const root='/tmp/nsc-ssr-r2';
let p=root+'/dashboard/nuxt.config.ts';
writeFileSync(p,readFileSync(p,'utf8').replace('export default defineNuxtConfig({','export default defineNuxtConfig({\n  telemetry:false, fonts:false, sourcemap:{server:true}, nitro:{preset:"node-server",sourceMap:true},'));
p=root+'/astro-paper/astro.config.ts';
let s=readFileSync(p,'utf8').replace('import {\n','import node from "@astrojs/node";\nimport {\n',1).replace('export default defineConfig({','export default defineConfig({\n  output:"server",adapter:node({mode:"standalone"}),');
const a=s.indexOf('  fonts: ['),b=s.indexOf('  env:',a);
s=s.slice(0,a)+'  fonts: [],\n'+s.slice(b);
s=s.replace('  vite: {\n    plugins:','  vite: {\n    build:{sourcemap:true}, plugins:');writeFileSync(p,s);
function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const f=dir+'/'+e.name;if(e.isDirectory())walk(f);else if(f.endsWith('.astro'))writeFileSync(f,readFileSync(f,'utf8').replace(/<Font[^>]*\/>/g,'<style>:root{--font-google-sans-code:monospace}</style>'));}}
walk(root+'/astro-paper/src');
