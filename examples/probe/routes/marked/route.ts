"use native";

import { marked } from "marked";
export function GET() {
  const markdown = "# Shipping safely\n\nA **reliable** API handles retries & failures. Café 🚀\n\n| Status | Action |\n| --- | --- |\n| 429 | Retry |\n\n- [x] Validate input\n- [ ] Deploy\n\n```ts\nconst retry = 3;\n```\n\n[Read more](https://example.com/docs)\n";
  return new Response(marked.parse(markdown, { async: false }), { headers: { "content-type": "text/html; charset=utf-8" } });
}
