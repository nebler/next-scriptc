// Opt-in first-call profiling, shared by the Node fallback and native build.
export function revenueTrace(): number[] | null {
  return process.env.NEXT_SCRIPTC_CALL_TIMING === "1" ? [Number(process.hrtime.bigint()) / 1e6] : null;
}
export function revenueMark(trace: number[] | null, done = false): void {
  if (trace === null) return;
  trace.push(Number(process.hrtime.bigint()) / 1e6);
  if (done) console.log("scriptc-call " + JSON.stringify({ side: "revenue", stamps: trace }));
}
