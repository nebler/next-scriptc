// Only this demo function's process-local aggregates leave the server.
export function panelFromSnapshot(snapshot, functionId = 'lib/forecast.ts#forecast') {
  const functions = snapshot.dispatchers.flatMap(d => Object.entries(d.functions))
    .filter(([id]) => id === functionId);
  const buckets = functions.flatMap(([, f]) => f.buckets);
  return {
    observed: buckets.length > 0,
    lanes: [...new Set(buckets.map(b => b.lane === 'native' ? 'native' : 'js'))],
    shadows: buckets.reduce((n, b) => n + b.verified, 0),
    mismatches: buckets.reduce((n, b) => n + b.mismatches, 0),
    fallbacks: functions.reduce((n, [, f]) => n + f.fallback, 0),
    nativeCalls: functions.reduce((n, [, f]) => n + f.native, 0),
    buckets: buckets.map(b => ({bucket: b.bucket, lane: b.lane === 'native' ? 'native' : 'js', reason: b.reason,
      ratio: b.decision.ratio, samples: b.decision.samples})),
  };
}
