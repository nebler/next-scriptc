import {numeric} from '../../compute/numeric';
export default defineEventHandler(event=>{
 const n=Number(getQuery(event).n??100000);
 if(!Number.isInteger(n)||n<0||n>1000000)throw createError({statusCode:400});
 return {value:numeric(n)};
});
