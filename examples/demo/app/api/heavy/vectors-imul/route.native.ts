import { corpus, rows, dimensions } from "../vectors/data.ts";
import { query, insert, response } from "../vectors/common.ts";
import { invalid } from "../common.ts";

export async function POST(request: Request) {
  try {
    const embedding = query(await request.text());
    const scores = new Int32Array(10), ids = new Int32Array(10);
    scores.fill(-2147483648); ids.fill(-1);
    for (let row = 0; row < rows; row++) {
      let sum = 0;
      const base = row * dimensions;
      for (let j = 0; j < dimensions; j++)
        sum = (sum + Math.imul(corpus[base + j], embedding[j])) | 0;
      insert(sum, row, scores, ids);
    }
    return response(scores, ids);
  } catch {
    return invalid();
  }
}
