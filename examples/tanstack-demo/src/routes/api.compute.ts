import {createFileRoute} from '@tanstack/react-router';
import {compute} from '../lib/compute';
export const Route=createFileRoute('/api/compute')({server:{handlers:{GET:async({request})=>{
 const url=new URL(request.url);
 if(url.searchParams.has('state'))return Response.json([...(globalThis[Symbol.for('scriptc-promote.dispatchers')]??new Map()).values()].map(dispatcher=>dispatcher.snapshot()));
 return Response.json({checksum:await compute({data:Number(url.searchParams.get('n')??1000)})});
}}}});
