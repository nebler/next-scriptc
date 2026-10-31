import { measured } from "../vectors/measure.ts";
import { corpus, rows, dimensions } from "./data.ts";
import { query, insert, response } from "./common.ts";
import { invalid } from "../common.ts";

function search(data: Int8Array, embedding: Int8Array, n: number, d: number): Response {
  const scores = new Int32Array(10), ids = new Int32Array(10);
  scores.fill(-2147483648); ids.fill(-1);
  for (let row = 0; row < n; row++) {
    let sum = 0;
    const base = row * d;
    for (let j = 0; j < d; j++)
      sum = (sum + data[base + j] * embedding[j]) | 0;
    insert(sum, row, scores, ids);
  }
  return response(scores, ids);
}

export async function POST(request: Request) {
  try {
    const text = await request.text();
    return measured(() => {
      const embedding = query(text);
      return search(corpus, embedding, rows, dimensions);
    });
  } catch {
    return invalid();
  }
}
