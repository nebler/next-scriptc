import {checksum} from '../lib/server/checksum';
export function GET({url}: {url: URL}): Response {
 const n = Math.max(0, Math.min(10000, Number(url.searchParams.get('n') ?? 1000)));
 return new Response(JSON.stringify({checksum: checksum(n)}), {headers:{'content-type':'application/json'}});
}
