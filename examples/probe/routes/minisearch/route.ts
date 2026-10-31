"use native";

import MiniSearch from "minisearch";
const index = new MiniSearch({ fields: ["title", "text"], storeFields: ["title"], searchOptions: { boost: { title: 2 }, prefix: true, fuzzy: 0.2 } });
index.addAll([{ id: 1, title: "Webhook retries", text: "Retry failed requests with exponential backoff" }, { id: 2, title: "API authentication", text: "Verify signed tokens on incoming requests" }, { id: 3, title: "Webhook security", text: "Verify signatures and prevent replay attacks" }]);
export function GET() { return Response.json({ exact: index.search("webhook"), fuzzy: index.search("authentcation"), empty: index.search("potato") }); }
