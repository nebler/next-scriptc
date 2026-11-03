import {build} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import vue from '@vitejs/plugin-vue';
for(const [name,entry,plugins] of [
  ['svelte','svelte/src/lib/Page.svelte',[svelte({compilerOptions:{generate:'server'}})]],
  ['nuxt','nuxt/app/components/Page.vue',[vue()]]
]) await build({configFile:false,plugins,build:{ssr:entry,outDir:`renderers/${name}`,sourcemap:true,minify:false,rollupOptions:{output:{entryFileNames:'page.mjs'}}}});
