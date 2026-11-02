// Local research endpoint. Only the KV text subset below is supported.
export default {
  async fetch(request, env) {
    if (request.headers.get('authorization') !== `Bearer ${env.PROXY_TOKEN}`)
      return new Response('Unauthorized', { status: 401 });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/rpc')
      return new Response('Not found', { status: 404 });
    const text = await request.text();
    if (text.length > 140000) return new Response('Too large', { status: 413 });
    let input;
    try { input = JSON.parse(text); } catch { return new Response('Bad JSON', { status: 400 }); }
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return new Response('Bad envelope', { status: 400 });
    const { op, key, value } = input;
    if (op === 'ping') return Response.json({ value: null });
    if (typeof key !== 'string' || !key.startsWith('bench:') || key.length > 200 ||
        !['get', 'put'].includes(op) || (op === 'put' && (typeof value !== 'string' || value.length > 65536)))
      return new Response('Unsupported operation', { status: 400 });
    try {
      if (op === 'put') { await env.KV.put(key, value); return Response.json({ value: null }); }
      return Response.json({ value: await env.KV.get(key, 'text') });
    } catch { return new Response('Binding failed', { status: 502 }); }
  }
};
