import { performance } from "node:perf_hooks";
import { revenue } from "../lib/revenue.ts";
import { serializeLegacy } from "./function-json-legacy.ts";
import { serialize } from "../../../packages/next-scriptc/src/functions/json.ts";

// Run unchanged under Node and scriptc. These are in-process boundary costs;
// revenue's own timer separates parsing the stored export from aggregation.
export async function profile(size: number) {
  const begin = performance.now();
  const args = serialize(["2026-01-01", "2026-01-31", size, true]);
  const encoded = performance.now();
  const decoded = JSON.parse(args) as [string, string, number, boolean];
  const parsed = performance.now();
  const result = await revenue(decoded[0], decoded[1], decoded[2], decoded[3]);
  const computed = performance.now();
  const json = serialize(result, true, () => JSON.stringify(result));
  const serialized = performance.now();
  const plain = JSON.stringify(result);
  const stringified = performance.now();
  const strict = serializeLegacy(result);
  const strictEnd = performance.now();
  // Timing-only lower bound: this misses Date/toJSON, accessors and extra
  // non-enumerable/symbol properties, so it must not be the production boundary.
  const replaced = JSON.stringify(result, (_key: string, value: unknown): unknown => {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non-finite JSON number");
    return value;
  });
  const replacerEnd = performance.now();
  if (strict !== json || replaced !== json) throw new Error("Serialization mismatch");
  if (plain !== json) throw new Error("Serialization mismatch");
  const roundtrip = JSON.parse(json) as typeof result;
  const end = performance.now();
  return { argsSerializeMs: encoded - begin, argsParseMs: parsed - encoded,
    ...roundtrip.timings!, resultSerializeMs: serialized - computed,
    resultStringifyMs: stringified - serialized, resultStrictSerializeMs: strictEnd - stringified,
    resultReplacerMs: replacerEnd - strictEnd, resultParseMs: end - replacerEnd, resultBytes: Buffer.byteLength(json) };
}

// Batched samples avoid timer granularity dominating the four-argument input.
// Alternate order, warm both paths, and report milliseconds per serialization.
export async function profileSerializers() {
  const result = await revenue("2026-01-01", "2026-01-31", 5000, false);
  const values: unknown[] = [["2026-01-01", "2026-01-31", 5000, true], result];
  const results = [];
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    const json = serialize(value, index === 1);
    if (serializeLegacy(value) !== json) throw new Error("Serialization mismatch");
    const iterations = index === 0 ? 1000 : 10;
    const legacy: number[] = [];
    const batched: number[] = [];
    for (let sample = -20; sample < 100; sample++) {
      for (let order = 0; order < 2; order++) {
        const old = (sample + order) % 2 === 0;
        const begin = performance.now();
        let encoded = "";
        for (let i = 0; i < iterations; i++) encoded = old ? serializeLegacy(value) : serialize(value, index === 1);
        const elapsed = (performance.now() - begin) / iterations;
        if (encoded !== json) throw new Error("Serialization mismatch");
        if (sample >= 0) (old ? legacy : batched).push(elapsed);
      }
    }
    legacy.sort((a, b) => a - b);
    batched.sort((a, b) => a - b);
    results.push({ input: index === 0 ? "arguments" : "result", rows: index === 0 ? 0 : result.daily.length,
      bytes: Buffer.byteLength(json), iterations, samples: 100,
      legacyMs: legacy[50], batchedMs: batched[50] });
  }
  return results;
}
