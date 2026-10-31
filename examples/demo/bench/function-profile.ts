import { performance } from "node:perf_hooks";
import { revenue } from "../lib/revenue.ts";
import { serialize, serializeResult } from "../../../packages/next-scriptc/src/functions/json.ts";

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
  const json = serializeResult(result);
  const serialized = performance.now();
  const plain = JSON.stringify(result);
  const stringified = performance.now();
  const strict = serialize(result);
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
