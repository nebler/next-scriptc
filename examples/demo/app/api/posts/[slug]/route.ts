"use scriptc";

import { marked } from "marked";
import { posts } from "../content.ts";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const post = posts.find((post) => post.slug === slug);
  if (!post) return Response.json({ error: "Post not found" }, { status: 404 });
  const html = marked.parse(post.markdown, { async: false });
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
