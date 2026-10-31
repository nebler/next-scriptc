import { safeParse, flatten } from 'valibot';
import { createOrder } from '../../../app/api/app/orders/schema.ts';
const valid = { id: 'order-1', email: 'ada@example.com', items: [{ sku: 'LAMP', quantity: 2 }, { sku: 'CABLE', quantity: 1 }] };
console.log(JSON.stringify(safeParse(createOrder, valid)));
const invalid = safeParse(createOrder, { ...valid, email: 'bad' });
if (!invalid.success) console.log(JSON.stringify({ success: false, issues: flatten(invalid.issues) }));
