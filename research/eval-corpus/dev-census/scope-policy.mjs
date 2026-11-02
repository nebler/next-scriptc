// Measurement scope only; this does not alter discovery or promotion policy.
const excluded=new Set(['bench','benches','benchmark','benchmarks','__benchmarks__']);
export const isMeasuredSource=file=>!file.split('/').some(x=>excluded.has(x))&&!/\.(?:bench|benchmark)\./.test(file);
