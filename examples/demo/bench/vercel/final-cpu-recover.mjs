// Control-plane recovery only: raw failed full-run artifact remains unchanged.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const prefix = 'research/benchmarks/vercel-final';
const read = (s) => JSON.parse(readFileSync(`${prefix}-${s}.json`));
const save = (s, value) => writeFileSync(`${prefix}-${s}.json`, JSON.stringify(value, null, 2) + '\n');
const full = read('pair-5'), state = read('sandbox-recovery'), provenance = read('provenance'), cost = read('cost');
assert.equal(full.status, 'failed'); assert.equal(full.stopError, 'The operation was aborted due to timeout');
assert(!full.error && !full.failureDetails && !existsSync(`${prefix}-cpu.json`));
assert.equal(state.status, 'stopped'); assert.equal(state.name, full.sandbox.id);
assert.equal(execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim(), provenance.sourceCommit);
assert.equal(execFileSync('git', ['diff',provenance.sourceCommit,'--'], {encoding:'utf8'}), '');
assert.equal(full.deployments.length, 2);
for (const d of full.deployments) {
  assert.equal(d.rows.length, 6);
  assert(d.memoryAfterFirst.body && d.memoryAfterLoad.body);
  for (const r of d.rows) {
    assert.equal(r.status, 'measured'); assert.equal(r.sequential.status, 'complete'); assert.equal(r.concurrent.status, 'complete');
    assert.equal(r.sequential.warmup.status,'complete'); assert.equal(r.concurrent.warmup.status,'complete');
    const other=full.deployments.find((a)=>a.variant!==d.variant).rows.find((a)=>a.workload===r.workload);
    assert.equal(r.first.digest,other.first.digest);
  }
}
// The reference's status describes measurement completeness. Original runner
// status, stop error, exact raw bytes/hash and independent recovery are explicit.
const reference={...full,status:'complete',originalRunnerStatus:full.status,measurementStatus:'complete',
  referenceDerivation:{rawArtifact:`${prefix}-pair-5.json`,rawSha256:createHash('sha256').update(readFileSync(`${prefix}-pair-5.json`)).digest('hex'),
    recoveryArtifact:`${prefix}-sandbox-recovery.json`,reason:'All downloaded measurements and memory probes complete; only SDK stop call timed out; Sandbox independently confirmed stopped. No measurement repeated or edited.'}};
save('pair-5-reference',reference);
provenance.controlFailures ??= [];
provenance.controlFailures.push({stage:'full-run shutdown',rawArtifact:`${prefix}-pair-5.json`,recoveryArtifact:`${prefix}-sandbox-recovery.json`,referenceArtifact:`${prefix}-pair-5-reference.json`});
const recorded = cost.sandboxes.find((s)=>s.id===full.sandbox.id);
Object.assign(recorded,{controllerElapsedVcpuHours:recorded.provisionedVcpuHours,provisionedVcpuHours:0.134,
  accounting:'Conservatively charged full four-minute lifetime plus controller margin after stop timeout; independent status confirms stopped',
  confirmedStatus:state.status,platformTotalDurationMs:state.totalDurationMs,activeCpuDurationMs:state.totalActiveCpuDurationMs});
const recalc = () => { cost.httpAttempts=cost.validationLocalHttpAttempts+cost.hostedHttpAttempts; cost.provisionedVcpuHours=cost.sandboxes.reduce((n,s)=>n+s.provisionedVcpuHours,0);cost.activeCpuDurationMs=cost.sandboxes.reduce((n,s)=>n+(s.activeCpuDurationMs??0),0);save('cost',cost);save('provenance',provenance); };
recalc(); assert(cost.provisionedVcpuHours+0.134<=0.3);assert(cost.httpAttempts+6372<=40000);
const origins=Object.fromEntries(full.deployments.map((d)=>[d.variant,d.url]));
try {
  execFileSync(process.execPath,['--env-file=.env.local','examples/demo/bench/vercel/run.mjs','--node',origins.node,'--native',origins.native,
    '--mode','cpu','--reference',`${prefix}-pair-5-reference.json`,'--output',`${prefix}-cpu`],{stdio:'inherit'});
} finally {
  if(existsSync(`${prefix}-cpu.json`)) {
    const data=read('cpu');cost.hostedHttpAttempts+=data.requestsIssued??6372;
    if(data.sandbox)cost.sandboxes.push({artifact:`${prefix}-cpu.json`,...data.sandbox});
  } else {cost.hostedHttpAttempts+=6372;cost.sandboxes.push({artifact:`${prefix}-cpu.json`,provisionedVcpuHours:0.134,status:'unknown; charged reservation'});}
  recalc();
}
assert.equal(read('cpu').status,'complete');
provenance.status='measurements-complete';cost.status='measurements-complete; verification and cleanup pending';recalc();
