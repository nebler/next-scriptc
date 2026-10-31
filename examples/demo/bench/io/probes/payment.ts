import { POST } from '../../../app/api/app/webhooks/payment/route.native.ts';
import { createHmac } from 'node:crypto';
async function main() {
  const raw = JSON.stringify({ id: 'evt_probe', type: 'payment_intent.succeeded', data: { object: { id: 'pi_probe', amount_received: 11600, currency: 'usd', metadata: { orderId: 'probe' } } } });
  const t = 1793318400;
  const signature = createHmac('sha256', 'next-scriptc-demo-payment-signing-secret').update(`${t}.${raw}`).digest('hex');
  const response = await POST(new Request('http://localhost/api/app/webhooks/payment', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${signature}` }, body: raw }));
  console.log(response.status, await response.text());
}
main();
