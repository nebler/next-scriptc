// Clone the pinned tag into .sources/minisearch first; see upstream-issues.md.
import MiniSearch from "../.sources/minisearch/src/MiniSearch.ts";

const index = new MiniSearch<{ id: number; title: string }>({ fields: ["title"] });
index.addAll([{ id: 1, title: "Desk lamp" }]);
console.log(JSON.stringify(index.search("lamp")));
