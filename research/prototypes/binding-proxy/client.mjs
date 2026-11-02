export function bindingProxy(url, token) {
  async function call(op, key, value) {
    const response = await fetch(new URL('/rpc', url), {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ op, key, value }),
    });
    if (!response.ok) throw new Error(`Binding proxy HTTP ${response.status}`);
    return (await response.json()).value;
  }
  return { KV: { get: key => call('get', key), put: (key, value) => call('put', key, value) }, ping: () => call('ping') };
}
