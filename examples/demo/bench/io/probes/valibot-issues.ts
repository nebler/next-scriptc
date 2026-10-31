import { safeParse } from 'valibot';
import { createOrder } from '../../../app/api/app/orders/schema.ts';
console.log(JSON.stringify(safeParse(createOrder, { id: 'test', email: 'bad', items: [{ sku: 'LAMP', quantity: 1 }] })));
