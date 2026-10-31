// Clone the pinned tag into .sources/marked first; see upstream-issues.md.
import { marked } from "../.sources/marked/src/marked.ts";

console.log(await marked("# Generic class fields\n\nHello **world**."));
