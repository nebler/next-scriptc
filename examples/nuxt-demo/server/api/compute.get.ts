import {checksum} from '../utils/checksum';
export default defineEventHandler(event=>{
 const query=getQuery(event);
 if('state' in query)return [...(globalThis[Symbol.for('scriptc-promote.dispatchers')]??new Map()).values()].map(dispatcher=>dispatcher.snapshot());
 return {checksum:checksum(Number(query.n??1000))};
});
