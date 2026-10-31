import { dimensions, initMs } from "./data.ts";
export type Hit = { id: number; score: number };
export const vectorHeaders = { "cache-control": "no-store", "x-vector-init-ms": String(initMs) };
export function query(text: string): Int8Array {
  if (text.length > 8192) throw new Error("query too large");
  const input = JSON.parse(text) as { embedding: number[] };
  if (!input || !Array.isArray(input.embedding) || input.embedding.length !== dimensions)
    throw new Error("expected 768 dimensions");
  const result = new Int8Array(dimensions);
  for (let j = 0; j < dimensions; j++) {
    const x = input.embedding[j];
    if (typeof x !== "number" || !Number.isInteger(x) || x < -128 || x > 127)
      throw new Error("expected signed int8");
    result[j] = x;
  }
  return result;
}
export function insert(score: number, id: number, scores: Int32Array, ids: Int32Array): void {
  // Ascending corpus scan gives ties to the smaller document ID.
  if (score <= scores[9]) return;
  let j = 9;
  while (j > 0 && score > scores[j - 1]) {
    scores[j] = scores[j - 1]; ids[j] = ids[j - 1]; j--;
  }
  scores[j] = score; ids[j] = id;
}
export function response(scores: Int32Array, ids: Int32Array): Response {
  const results: Hit[] = [];
  for (let j = 0; j < 10; j++) results.push({ id: ids[j], score: scores[j] });
  return Response.json({ results }, { headers: vectorHeaders });
}
