import { POST as login } from "../../demo/app/api/login/route.ts";
import { GET as verify } from "../../demo/app/api/verify/route.ts";
import { GET as search } from "../../demo/app/api/search/route.ts";
import { GET as post } from "../../demo/app/api/posts/[slug]/route.ts";
import { GET as feed } from "../../demo/app/api/feed.xml/route.ts";
import { printResponse } from "./print.ts";

async function main() {
  const response = await login(new Request("http://probe.test/api/login", { method: "POST", body: JSON.stringify({ email: "ada@example.com", password: "correct horse battery staple" }) }));
  const token = (await response.clone().json() as { accessToken: string }).accessToken;
  await printResponse("login", response);
  await printResponse("verify", await verify(new Request("http://probe.test/api/verify", { headers: { authorization: `Bearer ${token}` } })));
  await printResponse("bad-token", await verify(new Request("http://probe.test/api/verify", { headers: { authorization: "Bearer malformed" } })));
  await printResponse("invalid-login", await login(new Request("http://probe.test/api/login", { method: "POST", body: "[]" })));
  await printResponse("search", search(new Request("http://probe.test/api/search?q=desk%20lamp&limit=7")));
  await printResponse("fuzzy-search", search(new Request("http://probe.test/api/search?q=hedset")));
  await printResponse("bad-search", search(new Request("http://probe.test/api/search?limit=0")));
  await printResponse("article", await post(new Request("http://probe.test/api/posts/reliable-webhooks"), { params: Promise.resolve({ slug: "reliable-webhooks" }) }));
  await printResponse("missing-article", await post(new Request("http://probe.test/api/posts/missing"), { params: Promise.resolve({ slug: "missing" }) }));
  await printResponse("rss", feed());
}
main();
