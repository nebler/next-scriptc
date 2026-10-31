import test from "node:test";
import assert from "node:assert/strict";
import { POST as natural } from "../../app/api/heavy/vectors/route.native.ts";
import { POST as imul } from "../../app/api/heavy/vectors-imul/route.native.ts";
import { corpus, dimensions, rows } from "../../app/api/heavy/vectors/data.ts";
import { vectorFixture } from "./fixtures.mjs";
const request = (body) => new Request("http://localhost/api/heavy/vectors", { method: "POST", body });

test("vector routes agree with an independent one-coordinate ranking and zero ties", async () => {
  const q = Array(dimensions).fill(0); q[19] = -128;
  // Independent full sort, rather than the route's insertion selection.
  const expected = Array.from({ length: rows }, (_, id) => ({ id, score: corpus[id * dimensions + 19] * -128 }))
    .sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 10);
  for (const route of [natural, imul]) {
    const r = await route(request(JSON.stringify({ embedding: q })));
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.ok(Number(r.headers.get("x-vector-init-ms")) > 0);
    assert.deepEqual((await r.json()).results, expected);
    const zero = await route(request(JSON.stringify({ embedding: Array(dimensions).fill(0) })));
    assert.deepEqual((await zero.json()).results, Array.from({ length: 10 }, (_, id) => ({ id, score: 0 })));
  }
});
test("query changes affect retrieval, both forms agree; invalid int8 input is rejected", async () => {
  const bodies = [vectorFixture(123), vectorFixture(456)];
  const outputs = [];
  for (const body of bodies) {
    const a = await natural(request(body)), b = await imul(request(body));
    assert.equal(a.status, 200); assert.equal(await a.text(), await b.text());
    outputs.push((await natural(request(body))).text());
  }
  assert.notEqual(...await Promise.all(outputs));
  for (const body of ['{"embedding":[]}', '{"embedding":null}', "null", "{", JSON.stringify({ embedding: ["1", ...Array(767).fill(0)] })]) {
    for (const route of [natural, imul]) assert.equal((await route(request(body))).status, 400);
  }
});
