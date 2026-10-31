import { createHmac, timingSafeEqual } from 'node:crypto';
const bytes = createHmac('sha256', 'secret').update('hello').digest();
console.log(bytes.toString('hex'));
console.log(timingSafeEqual(bytes, Buffer.from(bytes.toString('hex'), 'hex')));
