import { Agent, request } from 'undici';
import { createHash, randomUUID } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { availableParallelism } from 'node:os';

export const allowedHost = host => /^next-scriptc-[a-z0-9]+-noahs-projects-8a075d15\.vercel\.app$/.test(host);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const instance = randomUUID(), pools = new Map(), observations = new WeakMap(), sockets = new WeakMap();
let socketSequence = 0, invocationSequence = 0, busy = false;
const pending = new Map();
export function newObservation() {
  const id = randomUUID(), observation = {};
  pending.set(id, observation);
  return { id, observation, dispose: () => pending.delete(id) };
}
// Undici exposes the actual socket used for each dispatch. Observe without retaining headers.
channel('undici:request:create').subscribe(({ request }) => {
  // Pool queue dispatch can run in another request's async context. Correlate
  // with an explicit non-secret ID instead, extracting no other header values.
  let id;
  for (let i = 0; i < request.headers.length; i += 2) {
    if (request.headers[i].toLowerCase() === 'x-near-client-sample') { id = request.headers[i + 1]; break; }
  }
  const observation = pending.get(id);
  if (observation) observations.set(request, observation);
});
channel('undici:client:sendHeaders').subscribe(({ request, socket }) => {
  const old = sockets.get(socket), value = old ?? { id: ++socketSequence, uses: 0 };
  value.uses++; sockets.set(socket, value);
  Object.assign(observations.get(request) ?? {}, { socketId: value.id, reusedSocket: value.uses > 1 });
});
channel('undici:request:headers').subscribe(({ request }) => {
  const value = observations.get(request);
  if (value) value.headersAt = performance.now();
});

export function validateSpec(spec) {
  if (!spec || !Array.isArray(spec.targets) || !spec.targets.length || spec.targets.length > 6) throw Error('spec');
  for (const key of ['warmups', 'count', 'concurrency']) if (!Number.isInteger(spec[key])) throw Error('spec');
  if (spec.warmups < 0 || spec.warmups > 10 || spec.count < 1 || spec.count > 20 || ![1, 4].includes(spec.concurrency)) throw Error('spec');
  if (spec.concurrency === 4 && (spec.targets.length !== 1 || spec.count > 16 || spec.warmups > 4)) throw Error('spec');
  if (spec.durationMs !== undefined && (!Number.isInteger(spec.durationMs) || spec.durationMs < 1 || spec.durationMs > 2000)) throw Error('spec');
  if (new Set(spec.targets.map(t => t.id)).size !== spec.targets.length) throw Error('spec');
  for (const t of spec.targets) {
    const u = new URL(t.url);
    if (u.protocol !== 'https:' || !allowedHost(u.hostname) || u.username || u.password || u.port || u.hash) throw Error('host');
    if (!/^[a-z0-9-]{1,40}$/.test(t.id) || !/^[a-f0-9]{64}$/.test(t.expected)) throw Error('spec');
    if (t.kind === 'vector') {
      if (!/^\/api\/(heavy\/vectors(?:-imul)?|heavy-go\/vectors|heavy-go-simd\/vectors)$/.test(u.pathname) || typeof t.body !== 'string' || Buffer.byteLength(t.body) > 4000) throw Error('spec');
    } else if (t.kind === 'report') {
      if (u.pathname !== '/reports' || ![1000, 2000, 3000, 5000, 15000, 200000].includes(t.size) || u.search !== `?size=${t.size}`) throw Error('spec');
    } else throw Error('spec');
  }
}

async function sample(target, secret, concurrency, phase, ordinal) {
  const origin = new URL(target.url).origin, key = `${origin}:${concurrency}`;
  if (!pools.has(key)) pools.set(key, new Agent({ connections: concurrency, pipelining: 1, keepAliveTimeout: 60000, keepAliveMaxTimeout: 60000, allowH2: false }));
  const started = performance.now();
  const trace = newObservation(), { observation } = trace;
  let response;
  try { response = await request(target.url, {
      dispatcher: pools.get(key), method: target.kind === 'vector' ? 'POST' : 'GET',
      body: target.kind === 'vector' ? target.body : undefined,
      headers: { 'x-vercel-protection-bypass': secret, 'x-near-client-sample': trace.id, 'accept-encoding': 'identity', ...(target.kind === 'vector' ? { 'content-type': 'application/json' } : {}) },
      maxRedirections: 0, headersTimeout: 15000, bodyTimeout: 15000, signal: AbortSignal.timeout(20000),
    }); } finally { trace.dispose(); }
  const headerAt = observation?.headersAt ?? performance.now();
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 2_000_000) throw Error('body-limit'); chunks.push(chunk); }
  const totalMs = performance.now() - started, body = Buffer.concat(chunks), h = response.headers;
  const row = { target: target.id, phase, ordinal, status: response.statusCode, ttfbMs: headerAt - started, totalMs,
    socketId: observation?.socketId, reusedSocket: observation?.reusedSocket, bytes, sha256: sha(body),
    serverTiming: h['server-timing'] ?? null, vercelId: h['x-vercel-id'] ?? null, cache: h['x-vercel-cache'] ?? null,
    cacheControl: h['cache-control'] ?? null, contentType: h['content-type'] ?? null,
    targetInstance: h['x-vector-instance'] ?? h['x-native-instance'] ?? null,
    attempts: h['x-native-attempts'] ?? null, pid: h['x-native-pid'] ?? null,
    readyBeforeCall: h['x-native-ready-before-call'] ?? null, bootMs: h['x-native-boot-ms'] ?? null };
  const failures = [];
  if (row.status !== 200) failures.push('status');
  if (row.cache !== 'MISS') failures.push('cache');
  if (!row.vercelId || !/^iad1::iad1::/.test(row.vercelId)) failures.push('region');
  if (typeof row.reusedSocket !== 'boolean') failures.push('socket-observation');
  try {
    if (target.kind === 'vector') {
      JSON.parse(body.toString()); row.resultSha256 = row.sha256;
      row.computeMs = Number(/^compute;dur=([\d.]+)$/.exec(row.serverTiming)?.[1]);
      row.targetCpuMs = Number(h['x-vector-cpu-us']) / 1000; row.rss = Number(h['x-vector-rss']);
      if (!row.contentType?.includes('application/json') || !row.cacheControl?.includes('no-store') || !Number.isFinite(row.targetCpuMs) || !(row.rss > 0)) failures.push('vector-metadata');
    } else {
      const match = /<pre id="result">([\s\S]*?)<\/pre>/.exec(body.toString());
      if (!match) throw Error('result');
      const json = match[1].replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&#x27;', "'").replaceAll('&amp;', '&');
      row.resultSha256 = sha(json);
      if (JSON.parse(json).events !== target.size) failures.push('size');
      row.computeMs = Number(/function;dur=([\d.]+)/.exec(row.serverTiming)?.[1]);
      row.renderMs = Number(/render;dur=([\d.]+)/.exec(row.serverTiming)?.[1]);
      if (!row.contentType?.includes('text/html') || !Number.isFinite(row.renderMs)) failures.push('report-metadata');
      if (target.id.includes('native') && row.attempts !== '1') failures.push('sidecar-restart');
    }
  } catch { failures.push('result-parse'); }
  if (row.resultSha256 !== target.expected) failures.push('result-hash');
  if (!Number.isFinite(row.computeMs) || row.computeMs < 0 || !row.targetInstance) failures.push('timing-instance');
  row.valid = failures.length === 0; if (failures.length) row.failures = failures;
  return row;
}

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"method"}'); return; }
  if (busy) { res.statusCode = 409; res.end('{"error":"busy"}'); return; }
  let spec, secret = req.headers['x-bench-target-bypass'];
  try {
    let body = ''; for await (const part of req) { body += part; if (body.length > 40000) throw Error('spec'); }
    spec = JSON.parse(body); validateSpec(spec);
    if (typeof secret !== 'string' || !secret.length) throw Error('secret');
  } catch { res.statusCode = 400; res.end('{"error":"invalid-spec-or-header"}'); return; }
  busy = true;
  const firstInvocation = ++invocationSequence === 1, started = performance.now(), cpu = process.cpuUsage(), elu = performance.eventLoopUtilization();
  const delay = monitorEventLoopDelay({ resolution: 10 }); delay.enable();
  const out = { instance, invocationSequence, firstInvocation, region: process.env.VERCEL_REGION ?? null, node: process.version, availableParallelism: availableParallelism(), startedAt: new Date().toISOString(), samples: [], windows: [], status: 'running' };
  try {
    const run = async (t, phase, ordinal) => {
      if (performance.now() - started > 40000) throw Error('batch-deadline');
      const row = await sample(t, secret, spec.concurrency, phase, ordinal); out.samples.push(row);
      if (!row.valid) throw Error('response-validation');
    };
    if (spec.concurrency === 1) {
      for (let i = 0; i < spec.warmups + spec.count; i++) {
        const offset = (i + (spec.rotation ?? 0)) % spec.targets.length;
        for (const t of [...spec.targets.slice(offset), ...spec.targets.slice(0, offset)]) await run(t, i < spec.warmups ? 'warmup' : 'measured', i < spec.warmups ? i : i - spec.warmups);
      }
    } else {
      const t = spec.targets[0];
      const warming = await Promise.allSettled(Array.from({ length: spec.warmups }, (_, i) => run(t, 'warmup', i)));
      if (warming.some(r => r.status === 'rejected')) throw Error('warmup-failed');
      let issued = 0, failure;
      const start = performance.now(), used = process.cpuUsage();
      await Promise.all(Array.from({ length: spec.concurrency }, async () => {
        while (!failure && issued < spec.count && performance.now() - start < (spec.durationMs ?? 2000)) {
          const i = issued++; try { await run(t, 'measured', i); } catch (e) { failure ??= e; }
        }
      }));
      const c = process.cpuUsage(used), elapsedMs = performance.now() - start;
      out.windows.push({ target: t.id, issued, elapsedMs, cpuMs: (c.user + c.system) / 1000, cpuCores: (c.user + c.system) / 1000 / elapsedMs, requestsPerSecond: issued * 1000 / elapsedMs });
      if (failure) throw failure;
    }
    out.status = 'complete';
  } catch { out.status = 'failed'; out.error = 'request-or-validation-failed'; }
  finally {
    secret = undefined; delay.disable(); busy = false;
    const c = process.cpuUsage(cpu); out.elapsedMs = performance.now() - started;
    out.cpu = { userMs: c.user / 1000, systemMs: c.system / 1000, cores: (c.user + c.system) / 1000 / out.elapsedMs };
    out.eventLoop = { utilization: performance.eventLoopUtilization(elu).utilization, delayMaxMs: delay.max / 1e6, delayP99Ms: delay.percentile(99) / 1e6 };
    res.end(JSON.stringify(out));
  }
}
