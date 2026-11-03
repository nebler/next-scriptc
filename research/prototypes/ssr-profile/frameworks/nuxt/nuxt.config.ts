export default defineNuxtConfig({ssr:true,telemetry:false,devtools:{enabled:false},sourcemap:{server:true,client:false},nitro:{preset:'node-server',sourceMap:true},routeRules:{'/**':{cache:false}}});
