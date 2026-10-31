import { GET, POST } from '../../../app/api/app/orders/route.native.ts';
import { POST as webhook } from '../../../app/api/app/webhooks/payment/route.native.ts';
import { GET as diagnostic } from '../../../app/api/app/diagnostics/redis/route.native.ts';
async function main() {
  console.log((await GET(new Request('http://localhost/api/app/orders'))).status);
  console.log((await POST(new Request('http://localhost/api/app/orders', { method: 'POST', body: '{}' }))).status);
  console.log((await webhook(new Request('http://localhost/api/app/webhooks/payment', { method: 'POST', body: '{}' }))).status);
  console.log(await (await diagnostic(new Request('http://localhost/api/app/diagnostics/redis'))).text());
}
main();
