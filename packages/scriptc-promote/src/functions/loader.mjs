import {realpathSync,existsSync} from 'node:fs';
import {babelModules} from '../babel.mjs';
import { createHash } from "node:crypto";
import {assertDependencyHashes} from './dependency-closure.mjs';
import path from "node:path";

export default function loader(text) {
  const { modules, port, client, server, promotionClient, promotionFile } = this.getOptions();
  const module = modules[this.resourcePath];
  if (!module) return text;
  if (!server && module.promotion) return text;
  if (!server) throw new Error(`[next-scriptc] ${this.resourcePath}: function ${module.functions.map((fn) => fn.name).join(", ")}: native functions cannot be imported into a browser or Edge module. Call them through a Server Action instead.`);
  if (module.hash !== createHash("sha256").update(text).digest("hex")) throw new Error(`[next-scriptc] ${this.resourcePath} changed after discovery. Restart the build.`);
  assertDependencyHashes(module,file=>this.addDependency?.(file));
  const name = `__scriptc_${module.hash.slice(0, 12)}`;
  const raw = fn => `__scriptc_raw_${fn.id}`;
  const canonical=file=>existsSync(file)?realpathSync(file):file;
  const bySource=new Map(Object.entries(modules).map(([file,m])=>[canonical(file),{...m,source:file}]));
  const companions=[], imports=new Map(), replacements=new Map();
  if(module.functions.some(fn=>fn.promotion)||module.promotion){
    const ast=babelModules.parser().parse(text,{sourceType:'module',plugins:['typescript','jsx']});
    let program;babelModules.traverse().default(ast,{Program(p){program=p;}});
    for(const fn of module.functions){
      if(!fn.promotion&&!module.promotion)continue;
      const refs=[];
      const targets=new Map(module.functions.filter(f=>f.promotion||module.promotion).map(f=>[f.name,raw(f)]));
      for(const [local,link] of Object.entries(fn.rawLinks??{})){
        const linked=bySource.get(canonical(link.source));
        const target=linked?.functions.find(f=>f.name===link.name&&(f.promotion||linked.promotion));
        if(target){const alias=`${raw(target)}_import`;targets.set(local,alias);imports.set(alias,`import { ${raw(target)} as ${alias} } from ${JSON.stringify(linked.source)};`);}
      }
      for(const [local,target] of targets){
        for(const ref of program.scope.getBinding(local)?.referencePaths??[]){
          if(ref.node.start>=fn.start&&ref.node.end<=fn.end&&!ref.findParent(p=>p.isTSType()))
            refs.push([ref.node.start,ref.node.end,ref.parentPath.isObjectProperty()&&ref.parent.shorthand?`${local}: ${target}`:target]);
        }
      }
      // Named function expressions have a private recursive binding as well.
      babelModules.traverse().default(ast,{FunctionExpression(p){
        if(p.node.body.start===fn.start&&p.node.id)for(const ref of p.scope.getBinding(p.node.id.name)?.referencePaths??[])
          if(ref.node.start>=fn.start&&ref.node.end<=fn.end)refs.push([ref.node.start,ref.node.end,raw(fn)]);
      }});
      let body=text.slice(fn.start,fn.end);
      for(const [start,end,value] of refs.sort((a,b)=>b[0]-a[0]))body=body.slice(0,start-fn.start)+value+body.slice(end-fn.start);
      const binding=program.scope.getBinding(fn.name);
      const exported=binding?.path.findParent(p=>p.isExportNamedDeclaration())||binding?.referencePaths.some(p=>p.parentPath.isExportSpecifier());
      companions.push(`${exported?'export ':''}function ${raw(fn)}(${(fn.originalParams??fn.params).join(', ')}) ${fn.expression?`{ return (${body}); }`:body}`);
      replacements.set(fn.id,raw(fn));
    }
  }
  for (const fn of [...module.functions].reverse()) {
    if(fn.promotion || module.promotion){
      const callback=replacements.get(fn.id);
      const replacement=`{ return ${name}_auto(${JSON.stringify(promotionFile)}, ${JSON.stringify(fn.id)}, ${callback}, [${fn.params.join(", ")}]); }`;
      text=text.slice(0,fn.start)+replacement+text.slice(fn.end);
      // Replace the outer binding patterns: the original closure performs all
      // defaults/destructuring exactly once, after dispatch chooses a lane.
      for(let i=(fn.parameterRanges?.length??0)-1;i>=0;i--){const [start,end]=fn.parameterRanges[i];text=text.slice(0,start)+fn.params[i]+(fn.defaults[i]?' = undefined':'')+text.slice(end);}
      continue;
    }
    text = text.slice(0, fn.start) + `{ return ${name}(${port}, ${JSON.stringify(fn.id)}, [${fn.params.join(", ")}]); }` + text.slice(fn.end);
  }
  if(module.functions.some(fn=>fn.promotion)||module.promotion)text=`import { promote as ${name}_auto } from ${JSON.stringify(path.isAbsolute(promotionClient) ? "./" + path.relative(path.dirname(this.resourcePath), promotionClient).split(path.sep).join("/") : promotionClient)};\n${text}`;
  text+='\n'+[...imports.values(),...companions].join('\n');
  if(module.promotion)return text;
  return `import { callNative as ${name} } from ${JSON.stringify("./" + path.relative(path.dirname(this.resourcePath), client).split(path.sep).join("/"))};\n${text}`;
}
