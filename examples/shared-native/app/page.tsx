'use client';
import {browserSnapshot} from 'scriptc-promote/browser';
import {useState} from 'react';
import {forecast, type ForecastResult} from '../lib/forecast';
import {canonicalResult} from 'scriptc-promote/functions/promotion-encodings.mjs';
type Panel = {observed: boolean; lanes: string[]; shadows: number; mismatches: number; fallbacks: number; nativeCalls: number; buckets: {bucket: number; lane: string; reason: string; ratio: number | null; samples: number}[]};
type BrowserPanel = {lane:string;checks:number;mismatches:number;fallbacks:number;ready:boolean;disabled:boolean};
type Run = {browser:BrowserPanel | null;client: ForecastResult; server: ForecastResult; clientMs: number; serverMs: number; panel: Panel; same: boolean};
export default function Page() {
  const [trials, setTrials] = useState(10000);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState('');
  async function simulate(collect = false) {
    setBusy(true); setError('');
    await new Promise(resolve => setTimeout(resolve, 0));
    try {
      const input = {trials, seed: 42, cash: 250000, revenue: 40000, costs: 50000};
      const start = performance.now();
      const client = forecast(input);
      const clientMs = performance.now() - start;
      const browser = browserSnapshot().find(s => s.id === process.env.SHARED_NATIVE_FUNCTION_ID) ?? null;
      if (collect) {
        for (let i = 0; i < 750; i++) {
          const sample = await fetch('/api/forecast', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({...input, trials: 1000})});
          if (!sample.ok) throw Error('Sample collection failed. Try again.');
          const observation = await sample.json();
          if (i % 20 === 0) setProgressText(`${i + 1} calls · ${observation.panel.shadows} verified pairs`);
          if (observation.panel.nativeCalls > 0) break;
          await new Promise(resolve => setTimeout(resolve, 2));
        }
      }
      const response = await fetch('/api/forecast', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(input)});
      if (!response.ok) throw Error('Server calculation failed. Try again.');
      const data = await response.json();
      setRun({client, browser, server: data.result, clientMs, ...data,
        same: canonicalResult(client, {result: 'json'}) === canonicalResult(data.result, {result: 'json'})});
    } catch (e) {setError(e instanceof Error ? e.message : 'Calculation failed');}
    finally {setBusy(false); setProgressText('');}
  }
  return <main><h1>Cash runway, shared</h1>
    <p>One TypeScript function. Browser JS or wasm and server native, checked against the same JS reference.</p>
    <section><h2>36 months of uncertainty</h2><p>$250,000 cash · $40,000 monthly revenue · $50,000 costs · seed 42</p>
      <label htmlFor="trials">Forecast paths: {trials.toLocaleString()}</label>
      <input id="trials" type="range" min="1000" max="100000" step="1000" value={trials} disabled={busy} onChange={e => {setTrials(Number(e.target.value)); setRun(null);}} />
      <button disabled={busy} onClick={() => simulate()}>{busy ? 'Calculating…' : 'Run both'}</button>
      <button className="secondary" disabled={busy} onClick={() => simulate(true)}>Collect verification samples</button>
      <p>Promotion needs 24 pairs. Collect samples sends up to 750 sequential calls at 1,000 paths, using the default policy. Allow about 5 seconds; all three sizes share the small-input bucket.</p>
      <p role="status">{progressText}</p>
      {error && <p role="alert">{error}</p>}
    </section>
    <div aria-live="polite">{run ? <>
      <section><h2>{run.same ? 'Same result' : 'Results differ'}</h2>
        <strong>{(100 * run.client.solvent / run.client.trials).toFixed(2)}% survive all 36 months</strong>
        <progress aria-label="Share of paths surviving" value={run.client.solvent} max={run.client.trials} />
        <p>Exact dispatcher canonical comparison, with no tolerance.</p>
        <dl><dt>Browser {run.browser?.lane ?? 'js'}</dt><dd>{run.clientMs.toFixed(3)} ms</dd><dt>Server call</dt><dd>{run.serverMs.toFixed(3)} ms</dd>
          <dt>Summed ending cash</dt><dd>${run.client.totalEndingCash.toLocaleString()}</dd></dl>
      </section>
      <section><h2>Browser verification</h2><dl><dt>Lane</dt><dd>{run.browser?.lane ?? 'js'}</dd><dt>Verified shadows</dt><dd>{run.browser?.checks ?? 0}</dd><dt>Mismatches</dt><dd>{run.browser?.mismatches ?? 0}</dd><dt>Fallbacks</dt><dd>{run.browser?.fallbacks ?? 0}</dd></dl><p>JS answers while wasm loads and at uncalibrated sizes, including 1k paths. The first three calls per calibrated size bucket and every 32nd call compare against JS. A mismatch or trap permanently selects JS until reload.</p></section>
      <section><h2>Server verification</h2>
        <dl><dt>Lane</dt><dd>{run.panel.lanes.join(', ') || 'JS (no dispatcher observed)'}</dd>
          <dt>Verified shadows</dt><dd>{run.panel.shadows}</dd><dt>Mismatches</dt><dd>{run.panel.mismatches}</dd>
          <dt>Fallbacks</dt><dd>{run.panel.fallbacks}</dd><dt>Successful native calls</dt><dd>{run.panel.nativeCalls}</dd></dl>
        {run.panel.buckets.map(b => <p key={b.bucket}>Bucket {b.bucket}: {b.reason}. Native / JS {b.ratio === null ? 'pending' : b.ratio.toFixed(3)} ({b.samples} pairs).</p>)}
        <p>Process-local aggregates only. Server time excludes HTTP; paired ratio includes the native boundary. Restarting the server resets observations.</p>
      </section>
    </> : <section><h2>Ready to compare</h2><p>Choose a path count and run both. The browser starts in JS and loads wasm after the first call. At 10k or 100k paths, run again to observe wasm. Server native requires a production build.</p></section>}</div>
    <footer><code>lib/forecast.ts</code> is imported by this client and the route. The browser reactor and server addon compile that same source. No separate implementation.</footer>
  </main>;
}
