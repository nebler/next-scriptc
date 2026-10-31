// Audit symbols before stripping, then prove that stripping preserves code/data.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const bin='/tmp/vector-vercel/patched-unstripped',stripped='/tmp/vector-vercel/patched';
const llvm='/opt/homebrew/opt/llvm/bin/';
const run=(name,args)=>execFileSync(llvm+name,args,{encoding:'utf8',maxBuffer:2**28});
const sha=b=>createHash('sha256').update(b).digest('hex');
const nm=run('llvm-nm',[bin]);
const match=/^([0-9a-f]+) [a-zA-Z] sc_cpu_level$/m.exec(nm);assert(match,'dispatch global symbol');
const address=parseInt(match[1],16);
const elf=run('llvm-readelf',['-h',bin]);assert(/EXEC \(Executable file\)/.test(elf),'fixed-address ELF needed for self-memory diagnostic');
run('llvm-strip',['--strip-all','-o',stripped,bin]);
const sections={};
for(const section of ['.text','.data']){
 const a=`/tmp/vector-vercel/unstripped${section}`,b=`/tmp/vector-vercel/stripped${section}`;
 run('llvm-objcopy',[`--dump-section=${section}=${a}`,bin]);run('llvm-objcopy',[`--dump-section=${section}=${b}`,stripped]);
 assert.deepEqual(readFileSync(a),readFileSync(b));sections[section]=sha(readFileSync(a));
}
const symbols=nm.split('\n').filter(l=>/cpu_level|4eaed5b9b2c2|54b53f1dabe9/.test(l));
writeFileSync('/tmp/vector-vercel/symbols.txt',symbols.join('\n')+'\n');
const disassembly=run('llvm-objdump',['-d','--no-show-raw-insn',bin]);
writeFileSync('/tmp/vector-vercel/patched-assembly.txt',disassembly);
const functions=disassembly.split(/(?=^[0-9a-f]+ <)/m).filter(s=>/^[0-9a-f]+ <[^>]*(4eaed5b9b2c2|54b53f1dabe9)[^>]*>:/i.test(s));
const searchFunctions=functions.map(s=>({name:s.split('\n')[0],avxLines:s.split('\n').filter(l=>/vpmovsxb|vpmadd|vpaddd|ymm/.test(l)).slice(0,30),dispatcherLines:s.split('\n').filter(l=>/sc_cpu_level|\.base|\.v3/.test(l)).slice(0,12)}));
const init=disassembly.split(/(?=^[0-9a-f]+ <)/m).find(s=>s.startsWith('')&&/<sc_cpu_level_init>:\n/.test(s));
const metadata={address,addressHex:'0x'+match[1],elfHeader:elf,sections,unstripped:{bytes:readFileSync(bin).length,sha256:sha(readFileSync(bin))},stripped:{bytes:readFileSync(stripped).length,sha256:sha(readFileSync(stripped))},entrySha256:sha(readFileSync('examples/demo/.vercel/scriptc-build/entry-0.ts')),symbols,searchFunctions,cpuInitExcerpt:init?.split('\n').slice(0,85)};
writeFileSync('research/vector-vercel/patched-audit.json',JSON.stringify(metadata)+'\n');
console.log(JSON.stringify({address,bytes:metadata.stripped.bytes,sha256:metadata.stripped.sha256,searchFunctions:searchFunctions.map(x=>({name:x.name,avxLines:x.avxLines.length}))}));
