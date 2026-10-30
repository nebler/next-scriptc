"use scriptc";

import { marked } from "marked";
import { posts } from "../posts/content.ts";

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function GET() {
  const items = posts.slice().reverse().map((post) => {
    const url = `https://demo.example.com/posts/${post.slug}`;
    const html = marked.parse(post.markdown, { async: false });
    return `<item><title>${xml(post.title)}</title><link>${xml(url)}</link><guid isPermaLink="true">${xml(url)}</guid><pubDate>${new Date(post.published).toUTCString()}</pubDate><description>${xml(post.description)}</description><content:encoded>${xml(html)}</content:encoded></item>`;
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Field Notes &amp; Guides</title><link>https://demo.example.com/posts</link><description>Practical engineering notes</description><language>en</language>${items.join("")}</channel></rss>\n`;
  return new Response(body, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "no-store" } });
}
