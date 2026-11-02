import {checksum} from '../lib/checksum';
export function loader({request}: {request: Request}) {
 return new Response(JSON.stringify({checksum:checksum(Number(new URL(request.url).searchParams.get('n')??100))}));
}
export const action = loader;
