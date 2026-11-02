import {createFileRoute} from '@tanstack/react-router';
import {compute} from '../lib/compute';
export const Route=createFileRoute('/')({component:()=> <button onClick={()=>compute({data:1000})}>Compute on server</button>});
