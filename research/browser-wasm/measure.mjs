// Browser-compatible harness: the caller supplies the unchanged JS function and reactor.
export function measure(forecast, reactor, environment) {
  const wasm = input => JSON.parse(reactor.run(JSON.stringify([input])));
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const parity=[];
  for (const trials of [1000,10000,100000]) for (const seed of [1,42,2147483648,4294967295]) {
    const input={trials,seed,cash:250000,revenue:40000,costs:50000};
    const js=forecast(input), compiled=wasm(input);
    if(!equal(js,compiled))throw new Error('Mismatch: '+JSON.stringify({input,js,compiled}));
    parity.push({trials,seed,result:js});
  }
  const median = xs => [...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
  const rows=[];
  for (const trials of [1000,10000,100000]) {
    const input={trials,seed:42,cash:250000,revenue:40000,costs:50000};
    for(let i=0;i<30;i++){forecast(input);wasm(input);}
    const js=[],wasmMs=[];
    for(let i=0;i<51;i++) for(const lane of (i%2?['wasm','js']:['js','wasm'])) {
      const start=performance.now(); const value=(lane==='js'?forecast:wasm)(input);
      const duration=performance.now()-start;
      if(!equal(value,parity.find(p=>p.trials===trials&&p.seed===42).result))throw new Error('Measured mismatch');
      (lane==='js'?js:wasmMs).push(duration);
    }
    rows.push({trials,samples:51,jsMs:median(js),wasmMs:median(wasmMs),speedup:median(js)/median(wasmMs),jsSamples:js,wasmSamples:wasmMs});
  }
  return {environment,parity,rows,memoryBytes:reactor.memoryBytes(),wasiCalls:reactor.calls};
}
