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
