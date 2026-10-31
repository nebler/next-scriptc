import { createHash } from "node:crypto";
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const password = "correct horse battery staple";
const note = 'International merchant order, "priority" delivery to München';
export function csvFixture(rows) {
  const lines = ["id,region,sku,amountCents,quantity,status,note"];
  for (let i = 0; i < rows; i++) {
    const text = i % 17 === 0 ? `${note}\nsecond line` : note;
    lines.push(
      `${i},${i % 8},${Math.floor(i / 8) % 128},${100 + ((i * 7919) % 49900)},${1 + (i % 5)},${i % 7 === 0 ? "refund" : "paid"},"${text.replaceAll('"', '""')}"`,
    );
  }
  return Buffer.from(lines.join("\r\n") + "\r\n");
}
export function jsonFixture(rows) {
  const customers = Array.from({ length: 256 }, (_, id) => ({
    id,
    region: id % 8,
    discountBps: (id * 97) % 2001,
  }));
  const orders = Array.from({ length: rows }, (_, id) => ({
    id,
    customerId: (id * 17) % 256,
    amountCents: 100 + ((id * 7919) % 49900),
    quantity: 1 + (id % 5),
    status: id % 7 === 0 ? "refund" : "paid",
    note,
  }));
  return Buffer.from(JSON.stringify({ customers, orders }));
}
export function rgbaFixture(size) {
  const bytes = Buffer.alloc(size * size * 4);
  let state = 0x12345678;
  for (let i = 0; i < bytes.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[i] = state >>> 24;
  }
  return bytes;
}
export function vectorFixture(seed = 0xabcdef01) {
  let state = seed;
  const embedding = Array.from({ length: 768 }, () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return ((state >>> 0) % 256) - 128;
  });
  return Buffer.from(JSON.stringify({ embedding }));
}
export function spec(id, size) {
  let path = `/api/heavy/${id}`,
    body,
    contentType = "application/json";
  if (id === "csv") {
    body = csvFixture(size);
    contentType = "text/csv";
  } else if (id === "json") body = jsonFixture(size);
  else if (id === "thumbnail") {
    body = rgbaFixture(size);
    contentType = "application/octet-stream";
    path += `?width=${size}&height=${size}`;
  } else if (id === "bcrypt") body = Buffer.from(JSON.stringify({ password }));
  else if (id === "vectors" || id === "vectors-imul") body = vectorFixture();
  else throw new Error(`Unknown fixture: ${id}`);
  return {
    id,
    size,
    path,
    method: "POST",
    body,
    headers: { "content-type": contentType },
    responseType:
      id === "thumbnail" ? "application/octet-stream" : "application/json",
  };
}
export const sizes = {
  csv: [40000, 100000],
  json: [10000, 30000],
  thumbnail: [512, 1024],
  bcrypt: [10],
  vectors: [100000],
  "vectors-imul": [100000],
};
export function selected(id) {
  const filter = process.env.HEAVY_WORKLOADS?.split(",");
  if (filter?.some((name) => !(name in sizes))) throw new Error("Unknown HEAVY_WORKLOADS");
  return !filter || filter.includes(id);
}
export function workloads(hosted = false) {
  return Object.entries(sizes).filter(([id]) => selected(id)).map(([id, values]) =>
    spec(
      id,
      hosted && ["csv", "json"].includes(id) ? values[0] : values.at(-1),
    ),
  );
}
export function metadata(s) {
  return {
    id: s.id,
    size: s.size,
    path: s.path,
    requestBytes: s.body.length,
    requestSha256: digest(s.body),
  };
}
export function edgeCases() {
  const csv = (body, status = 400) => ({
    id: "csv",
    path: "/api/heavy/csv",
    method: "POST",
    body: Buffer.from(body),
    status,
  });
  const header = "id,region,sku,amountCents,quantity,status,note\r\n";
  const json = (body, status = 400) => ({
    id: "json",
    path: "/api/heavy/json",
    method: "POST",
    body: Buffer.from(body),
    status,
  });
  return [
    csv(header, 200),
    csv(header + '0,0,0,100,2,paid,"a,b\r\nc""d"\r\n', 200),
    csv(header + '0,0,0,100,2,paid,"unterminated'),
    csv(header + '0,0,0,100,2,paid,bad"quote'),
    csv(header + '0,0,0,100,2,paid,"closed"extra'),
    csv(header + "0,0,0,100,2,paid"),
    csv("bad header"),
    json('{"customers":[],"orders":[]}', 200),
    json("null"),
    json("{"),
    json('{"customers":[],"orders":[{}]}'),
    {
      id: "thumbnail",
      path: "/api/heavy/thumbnail?width=4&height=4",
      method: "POST",
      body: Buffer.alloc(64, 128),
      status: 200,
    },
    {
      id: "thumbnail",
      path: "/api/heavy/thumbnail?width=0&height=4",
      method: "POST",
      body: Buffer.alloc(64),
      status: 400,
    },
    {
      id: "thumbnail",
      path: "/api/heavy/thumbnail?width=4&height=4",
      method: "POST",
      body: Buffer.alloc(63),
      status: 400,
    },
    ...["wrong password", "", "é".repeat(37)].map((password, i) => ({
      id: "bcrypt",
      path: "/api/heavy/bcrypt",
      method: "POST",
      body: Buffer.from(JSON.stringify({ password })),
      status: i === 0 ? 200 : 400,
    })),
    ...["vectors", "vectors-imul"].flatMap((id) => [
      ...["{", "null", "[]", "{}", '{"embedding":null}', '{"embedding":[]}'].map((body) => ({ body, status: 400 })),
      ...[
        { embedding: Array(768).fill(0) },
        { embedding: Array(768).fill(-128) },
        { embedding: Array(768).fill(127) },
        { embedding: Array(767).fill(0) },
        { embedding: Array(769).fill(0) },
        ...[128, -129, 0.5, "1", null, true].map((x) => ({ embedding: [x, ...Array(767).fill(0)] })),
      ].map((value, i) => ({ body: JSON.stringify(value), status: i < 3 ? 200 : 400 })),
    ].map((s) => ({ ...s, id, path: `/api/heavy/${id}`, method: "POST", body: Buffer.from(s.body) }))),
  ].filter((s) => selected(s.id));
}
