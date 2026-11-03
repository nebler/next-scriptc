// Stable adapter diagnostics. Compiler SC codes remain intact.
export function repair(message) {
 if (/possibly.*undefined|undefined.*assignable/i.test(message)) return 'Guard the indexed value, use a tuple, or add a non-null check.';
 if (/unsupported reference/.test(message)) return 'Use a supported local helper; replace class parameter properties with explicit fields and assignments.';
 if (/async|generator/.test(message)) return 'Use a named async function for explicit native calls; automatic candidates must be synchronous.';
 if (/module initialization/.test(message)) return 'Move module setup into a declaration initializer or keep this module in JS.';
 if (/mutation|reassigned/.test(message)) return 'Use local fresh values and avoid mutating arguments or module state.';
 if (/work:/.test(message)) return 'Keep small helpers in JS, or mark a known hot synchronous helper with "use native".';
 return 'Use supported types and a closed pure helper, or opt out with "use js".';
}
export function sourceDiagnostic(text, source, offset, message) {
 if(/NSC\d{4}:/.test(message))return message;
 const prefix=text.slice(0,offset), line=prefix.split('\n').length, col=offset-(prefix.lastIndexOf('\n')+1)+1;
 const code=/unsupported reference/.test(message)?'NSC1001':/async|generator/.test(message)?'NSC1002':/module initialization/.test(message)?'NSC1003':/mutation|reassigned/.test(message)?'NSC1004':/work:/.test(message)?'NSC1005':'NSC1000';
 return `[next-scriptc] ${source}:${line}:${col} - ${code}: ${message} Hint: ${repair(message)}`;
}
export function translateDiagnostics(output, mappings=[]) {
 let text=String(output).replace(/\x1b\[[0-9;]*m/g,'');
 for(const {file,module} of mappings) {
  const escaped=file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  text=text.replace(new RegExp(escaped+':(\\d+):(\\d+)','g'),(match,l,c)=>{
   const lines=module.native.split('\n');let offset=Number(c)-1;for(let i=0;i<Number(l)-1;i++)offset+=(lines[i]?.length??0)+1;
   if(module.loweringMap){const segment=module.loweringMap.find(s=>offset>=s.generatedOffset&&offset<s.generatedOffset+s.length);if(segment)offset=segment.originalOffset+offset-segment.generatedOffset;}
   if(module.compilerSourceMap){
    const map=module.compilerSourceMap;
    const segment=map.segments.find(s=>offset>=s.generatedOffset&&offset<s.generatedOffset+s.length);
    if(segment){const at=segment.originalOffset+offset-segment.generatedOffset, prefix=map.text.slice(0,at),line=prefix.split('\n').length,column=at-prefix.lastIndexOf('\n')-1;
     const mapped=map.mappings.filter(m=>m.generated.line===line&&m.generated.column<=column&&m.original).at(-1);
     if(mapped)return `${mapped.source}:${mapped.original.line}:${mapped.original.column+1}`;
    }
   }
   const segment=module.sourceMap?.find(s=>offset>=s.generatedOffset&&offset<s.generatedOffset+s.length);
   if(!segment)return match;
   const original=segment.originalOffset+offset-segment.generatedOffset, prefix=module.originalText.slice(0,original);
   return `${module.source}:${prefix.split('\n').length}:${original-prefix.lastIndexOf('\n')}`;
  });
 }
 return text.split('\n').filter(line=>!/^\s*(?:\d+|)\s*\|/.test(line)).map(line=>/error SC\d+/.test(line)&&!/SC3004/.test(line)?`${line} Hint: ${repair(line)}`:line).join('\n');
}
export function infrastructureFailure(error) {
 const detail=String(error.stderr||error.message||error);
 if(!/ENOENT|EACCES|permission denied|SC3004|command not found/i.test(detail)||!/spawn|SC3004|command not found|permission denied/i.test(detail))return null;
 const tool=detail.match(/spawn(?:Sync)?\s+(\S+)\s+(?:ENOENT|EACCES)/)?.[1]??( /TypeScript server|permission denied/i.test(detail)?'scriptc helper':error.path??'scriptc toolchain');
 const command=/^(ar|clang)$/.test(tool)?(process.platform==='darwin'?'xcode-select --install':'sudo apt-get install build-essential'):tool==='zig'?'Install zig and add it to PATH':'pnpm approve-builds && pnpm rebuild scriptc';
 return `[next-scriptc] NSC2001: Toolchain unavailable (${tool}): ${detail.trim()}. The app continues in JS. Run scriptc-promote doctor . (or next-scriptc doctor .). Repair: ${command}.`;
}
