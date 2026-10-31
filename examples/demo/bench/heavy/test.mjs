import test from "node:test";
import assert from "node:assert/strict";
import { parseCSV } from "../../app/api/heavy/csv/parser.ts";
import { POST as csv } from "../../app/api/heavy/csv/route.native.ts";
import { POST as json } from "../../app/api/heavy/json/route.native.ts";
import { POST as thumbnail } from "../../app/api/heavy/thumbnail/route.native.ts";
const request = (path, body) =>
  new Request(`http://localhost/api/heavy/${path}`, { method: "POST", body });
test("CSV quoting and CRLF normalization including empty cells", () => {
  assert.deepEqual(
    parseCSV('\r\na,b,c\r\n"a,b","two\r\nlines","say ""hi"""\r\n,,\r\n'),
    [
      ["a", "b", "c"],
      ["a,b", "two\nlines", 'say "hi"'],
      ["", "", ""],
    ],
  );
  for (const text of ['"open', 'a"b', '"a"x'])
    assert.throws(() => parseCSV(text));
});
test("CSV report paid filter, totals and deterministic tie order", async () => {
  const r = await csv(
    request(
      "csv",
      "id,region,sku,amountCents,quantity,status,note\n0,1,2,100,2,paid,a\n1,0,3,200,1,paid,b\n2,1,2,900,1,refund,c\n",
    ),
  );
  assert.deepEqual(await r.json(), {
    rows: 3,
    accepted: 2,
    groups: [
      { key: 3, orders: 1, revenueCents: 200 },
      { key: 130, orders: 1, revenueCents: 200 },
    ],
  });
});
test("JSON joins discounts, filters refunds and sorts exact integer cents", async () => {
  const input = {
    customers: [{ id: 7, region: 2, discountBps: 333 }],
    orders: [
      {
        id: 2,
        customerId: 7,
        amountCents: 101,
        quantity: 3,
        status: "paid",
        note: "x",
      },
      {
        id: 1,
        customerId: 7,
        amountCents: 303,
        quantity: 1,
        status: "paid",
        note: "x",
      },
      {
        id: 3,
        customerId: 7,
        amountCents: 999,
        quantity: 1,
        status: "refund",
        note: "x",
      },
    ],
  };
  const r = await json(request("json", JSON.stringify(input)));
  assert.deepEqual(await r.json(), {
    rows: 3,
    accepted: 2,
    groups: [{ key: 2, orders: 2, revenueCents: 584 }],
    items: [
      { id: 1, customerId: 7, region: 2, netCents: 292 },
      { id: 2, customerId: 7, region: 2, netCents: 292 },
    ],
  });
});
test("thumbnail averages each channel and floors once per box", async () => {
  const bytes = Uint8Array.from({ length: 64 }, (_, i) => i);
  const r = await thumbnail(request("thumbnail?width=4&height=4", bytes));
  assert.deepEqual(
    [...new Uint8Array(await r.arrayBuffer())],
    [30, 31, 32, 33],
  );
});
