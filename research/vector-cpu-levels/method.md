Registered before creating the Linux VM (2026-10-31).

One iad1 Sandbox, one vCPU, hard 330s lease + 30s provisioning/cleanup margin,
0.1 vCPU-hour cap. Stop in finally. All builds on Mac beforehand. Kernel source
unchanged. Stock 0.4.6 and patched source main × baseline, v3, dispatch. Two
reversed process orders, each fresh process 5 warmups + 10 samples, 100k×768.
Kernel timing includes score reset, dot products, and top-10 selection, excludes
fixture initialization and JSON. Full-process timing includes all those costs.

Go 1.27.3: shared fair scout plain default, plain GOAMD64=v3, and experimental
archsimd AVX2; same scalar source. Binary has no archsimd implementation: original
scout bits.OnesCount32 default (runtime feature dispatch) and GOAMD64=v3, labelled
separately, never called SIMD. Node runs unchanged TS with stock type stripping.
No within-query threads, fast math, input changes, memoization or excluded samples.
Exact top-10 IDs for every mode; exact integer scores, earlier prospectively
registered float reassociation tolerance 1e-10+1e-12*abs(reference).

30 interleaved fresh tiny-input execs per native binary measure process launch +
runtime/init cost, not certified Function cold starts. Both dispatch copies also
run each full-size mode under SCRIPTC_CPU_LEVEL=baseline/x86-64-v3 (1 warmup + 3
samples, validation/diagnostic only, excluded from headline measurements).

If >65s remain after kernels and the prepared HTTP tar exists: actual next start,
same grouped routes and synchronous kernels, patched baseline/dispatch, Go
plain/SIMD via the existing Next external rewrite. One-vCPU generator and app,
C=1, 5 warmups+20 samples, response-body parity, query dependence, zero tie oracle,
invalid dimension. No C=16, throughput claim or comparison of these absolute
numbers to earlier two-vCPU HTTP runs. Preparation/installation uses the same VM
lease; no second Sandbox or retries. If not enough time, explicitly omit HTTP.

One separate minimal Node 24/x86_64/iad1 diagnostic preview in the linked test
project, using the Build Output API, reads actual Function CPU flags. It is a
hardware observation, no inference of fleet-wide guarantees or hosted native
performance. No domain or project-setting changes.
