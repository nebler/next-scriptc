import { createHash } from "node:crypto";
import path from "node:path";

export default function loader(text) {
  const { modules, port, client, server, promotionClient, promotionFile } = this.getOptions();
  const module = modules[this.resourcePath];
  if (!module) return text;
  if (!server && module.promotion) return text;
  if (!server) throw new Error(`[next-scriptc] ${this.resourcePath}: function ${module.functions.map((fn) => fn.name).join(", ")}: native functions cannot be imported into a browser or Edge module. Call them through a Server Action instead.`);
  if (module.hash !== createHash("sha256").update(text).digest("hex")) throw new Error(`[next-scriptc] ${this.resourcePath} changed after discovery. Restart the build.`);
  const name = `__scriptc_${module.hash.slice(0, 12)}`;
  for (const fn of [...module.functions].reverse()) {
    if(fn.promotion || module.promotion){
      const body=text.slice(fn.start,fn.end);
      text=text.slice(0,fn.start)+`{ return ${name}_auto(${JSON.stringify(promotionFile)}, ${JSON.stringify(fn.id)}, (${fn.params.join(", ")}) => ${body}, [${fn.params.join(", ")}]); }`+text.slice(fn.end);
      continue;
    }
    text = text.slice(0, fn.start) + `{ return ${name}(${port}, ${JSON.stringify(fn.id)}, [${fn.params.join(", ")}]); }` + text.slice(fn.end);
  }
  if(module.functions.some(fn=>fn.promotion)||module.promotion)text=`import { promote as ${name}_auto } from ${JSON.stringify(promotionClient)};\n${text}`;
  if(module.promotion)return text;
  return `import { callNative as ${name} } from ${JSON.stringify("./" + path.relative(path.dirname(this.resourcePath), client).split(path.sep).join("/"))};\n${text}`;
}
