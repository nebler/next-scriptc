async function main() {
  const valid = await fetch('https://upstash.com', { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  console.log(JSON.stringify({ validStatus: valid.status, validBytes: (await valid.text()).length }));
  const invalid = process.env.PROBE_INVALID_TLS;
  if (invalid) {
    let rejected = false;
    try { await fetch(invalid, { signal: AbortSignal.timeout(10000) }); } catch { rejected = true; }
    console.log(JSON.stringify({ selfSignedRejected: rejected }));
    if (!rejected) throw new Error('Self-signed certificate unexpectedly accepted');
  }
}
main();
export {};
