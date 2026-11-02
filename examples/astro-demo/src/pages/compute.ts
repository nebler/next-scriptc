import {checksum} from '../lib/checksum';
export function GET({url}: {url: URL}) {
 return new Response(JSON.stringify({checksum:checksum(Number(url.searchParams.get('n')??100))}));
}
