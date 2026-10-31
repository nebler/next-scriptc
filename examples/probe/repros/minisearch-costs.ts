import { GET } from "../../demo/app/api/search/route.ts";

async function search(): Promise<string> {
  return GET(new Request("http://demo.test/api/search?q=desk%20lamp&limit=7")).text();
}
async function main() {
  console.log(await search());
  for (let i = 0; i < 100; i++) await search();
  console.log("WARM");
  const count = Number(process.env.REPRO_COUNT ?? "400");
  const start = performance.now();
  let bytes = 0;
  for (let i = 0; i < count; i++) bytes += (await search()).length;
  console.log(JSON.stringify({ count, ms: performance.now() - start, bytes }));
}
main();
