// Execute the emitted pre-B1 copy as JS to isolate the extraction semantic gap.
// This is not a claim of native compiler acceptance.
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const rows=JSON.parse(fs.readFileSync(new URL('reproducers-pre-b1.json',import.meta.url)));
const instantiate=text=>new Function(stripTypeScriptTypes(text.replace(/export\s*\{[^}]*\};?/g,'').replace(/export\s+(?=const|function)/g,'').replace(/export\s+default\s+/g,'void '))+';return {rows,table:typeof table==="undefined"?null:table,mutate:typeof mutate==="undefined"?null:mutate};')();
const results=[];
for(const name of ['alias','aliaspush']){
 const r=rows.find(r=>r.name===name),original=instantiate(r.text),copy=instantiate(r.native),input=name==='alias'?[{n:1}]:[1],nativeCaller=structuredClone(input),decoded=structuredClone(nativeCaller);
 const jsReturn=original.rows(input),copiedReturn=copy.rows(decoded);results.push({name,jsReturn,copiedReturn,jsCallerAfter:input,nativeCallerAfter:nativeCaller});
}
for(const name of ['exported','escape','defaultEffect']){
 const r=rows.find(r=>r.name===name),original=instantiate(r.text),copy=instantiate(r.native);
 if(name==='exported')original.table.n=9;else if(name==='escape')original.mutate();
 results.push({name,jsReturn:original.rows([1]),copiedReturn:copy.rows([1])});
}
fs.writeFileSync(new URL('counterexamples.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
