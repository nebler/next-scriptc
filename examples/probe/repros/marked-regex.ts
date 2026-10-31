import { GET } from "../../demo/app/api/posts/[slug]/route.ts";

async function render(): Promise<string> {
  const response = await GET(new Request("http://demo.test/api/posts/reliable-webhooks"),
    { params: Promise.resolve({ slug: "reliable-webhooks" }) });
  return response.text();
}
async function main() {
  console.log(await render());
  for (let i = 0; i < 20; i++) await render();
  console.log("WARM");
  const count = Number(process.env.REPRO_COUNT ?? "60");
  const start = performance.now();
  let bytes = 0;
  for (let i = 0; i < count; i++) bytes += (await render()).length;
  console.log(JSON.stringify({ count, ms: performance.now() - start, bytes }));
}
main();
