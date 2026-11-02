export default defineEventHandler(async event=>{
 const kv=event.context.cloudflare?.env?.KV;
 if(!kv)throw createError({statusCode:503,statusMessage:'KV binding unavailable in Node'});
 return {value:await kv.get('co1')};
});
