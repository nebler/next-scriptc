// Reproduces the schema loaded through an async route module (as the adapter does).
async function main() {
  const { payment } = await import('./payment-zod-schema.ts');
  console.log(payment.safeParse({}).success);
}
main();
export {};
