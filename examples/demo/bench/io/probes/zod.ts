import { createOrder } from './zod-schema.ts';
const valid = { id: 'order-1', email: 'ada@example.com', items: [{ sku: 'LAMP', quantity: 2 }, { sku: 'CABLE', quantity: 1 }] };
const invalid = { id: '../bad', email: 'bad', items: [{ sku: 'UNKNOWN', quantity: 0 }] };
const runs = 10000;
function run(body: unknown) {
  let successes = 0;
  const start = performance.now();
  for (let i = 0; i < runs; i++) if (createOrder.safeParse(body).success) successes++;
  return { runs, successes, elapsedMs: performance.now() - start };
}
// Print functional evidence before timing; benchmark the unmodified validator.
console.log(JSON.stringify({ valid: createOrder.safeParse(valid), invalid: createOrder.safeParse(invalid) }));
run(valid); run(invalid);
for (let i = 0; i < 3; i++) console.log(JSON.stringify({ valid: run(valid), invalid: run(invalid) }));
