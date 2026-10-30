import MiniSearch from "minisearch";
const index = new MiniSearch({ fields: ["title"], storeFields: ["title"] });
index.addAll([{ id: "doc-1", title: "Webhook retries" }]);
const results = index.search("webhook");
console.log(results.map((result) => result.title));
