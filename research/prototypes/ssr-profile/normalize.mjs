// Explicit equivalence only; never used on the measured response path.
import { escape } from "./shared/concat.js";
const decode = s => s.replace(/&(amp|lt|gt|quot|apos|#x27|#39);/g, (_, e) => ({amp:"&",lt:"<",gt:">",quot:'"',apos:"'",'#x27':"'",'#39':"'"})[e]);
export function normalizeMain(html, framework) {
  if (!["astro", "svelte", "nuxt"].includes(framework)) return html;
  // Svelte hydration anchors and Vue fragment anchors. Unknown comments survive.
  return html.replace(/<!--(?:\[|\]|\[!|)-->/g, "")
    .split(/(<[^>]*>)/g).map(part => part.startsWith("<")
      ? part.replace(/href="([^"]*)"/g, (_, value) => 'href="' + escape(decode(value)) + '"')
      : escape(decode(part))).join("");
}
