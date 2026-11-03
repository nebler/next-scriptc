import { test } from "node:test";
import assert from "node:assert/strict";
import { attribute, category } from "../attribute.mjs";
test("clip sample intervals at measured boundaries without losing idle weight", () => {
  const profile = {
    startTime: 100,
    nodes: [
      {
        id: 1,
        callFrame: {
          url: "/node_modules/react-dom/cjs/react-dom-server.node.production.js",
        },
      },
      { id: 2, callFrame: { url: "", functionName: "(idle)" } },
    ],
    samples: [1, 2, 1],
    timeDeltas: [50, 100, 50],
  };
  const a = attribute(profile, { startUs: 125, stopUs: 275 });
  assert.equal(a.totalsUs.html, 50);
  assert.equal(a.totalsUs.idle, 100);
  assert.equal(a.excludedUs, 50);
  assert.equal(a.activeUs, 50);
  assert.equal(a.percent.html, 100);
});
test("mapped package ownership distinguishes Flight, Fizz, routing, and Prisma", () => {
  assert.equal(
    category({
      url: "webpack://next/src/server/app-render/stream-ops.node.ts",
    }),
    "routing",
  );
  assert.equal(
    category({
      url: "webpack://next/dist/compiled/react-server-dom-webpack/server.js",
      functionName: "serialize",
    }),
    "flight",
  );
  assert.equal(
    category({
      url: "webpack://next/dist/compiled/react-dom/cjs/react-dom-server.edge.production.js",
    }),
    "html",
  );
  assert.equal(
    category(
      { url: "../src/runtime/core/engines/library/LibraryEngine.ts" },
      { url: "/node_modules/@prisma/client/runtime/library.js" },
    ),
    "data",
  );
});
test("Astro, Svelte and Vue ownership survives bundled application paths", () => {
  for (const url of ["/node_modules/astro/dist/runtime/server/render/astro/render.js", "/node_modules/svelte/src/internal/server/index.js", "/node_modules/@vue/server-renderer/dist/server-renderer.cjs.prod.js"])
    assert.equal(category({url}, {url:"/build/server/index.js"}), "html");
  assert.equal(category({url:"/node_modules/devalue/src/stringify.js"}), "serialization");
  assert.equal(category({url:"/app/Page.vue"}), "html");
  assert.equal(category({url:"/node_modules/@vue/shared/dist/shared.cjs.prod.js",functionName:"escapeHtml"}), "html");
  assert.equal(category({url:"/node_modules/h3/dist/index.mjs"}), "routing");
});
test('mapped framework helper stays routing while date formatting is application work',()=>{
 assert.equal(category({url:'../../node_modules/@sveltejs/kit/src/utils/hash.js'}, {url:'/build/server/chunks/index.js'}),'routing');
 assert.equal(category({url:'/node_modules/dayjs/plugin/timezone.js'}),'application');
 assert.equal(category({url:'../../shared/data.js'}, {url:'/tmp/nuxt/.output/server/chunks/page.mjs'}),'application');
});
