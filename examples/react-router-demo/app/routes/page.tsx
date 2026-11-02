import {checksum} from '../lib/checksum';
export function loader(){return {checksum:checksum(100)};}
export default function Page(){return <p>{checksum(10)}</p>;}
