// Execute the emitted pre-B1 copy as JS to isolate the extraction semantic gap.
// This is not a claim of native compiler acceptance.
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const rows=JSON.parse(fs.readFileSync(new URL('reproducers-pre-b1.json',import.meta.url)));
const instantiate=text=>new Function(stripTypeScriptTypes(text.replace(/export\s*\{[^}]*\};?/g,'').replace(/export\s+(?=const|function)/g,'').replace(/export\s+default\s+/g,'void '))+';return {rows,advance:typeof advance==="undefined"?null:advance,table:typeof table==="undefined"?null:table,mutate:typeof mutate==="undefined"?null:mutate};')();
const results=[];
for(const name of ['alias','aliaspush']){
 const r=rows.find(r=>r.name===name),original=instantiate(r.text),copy=instantiate(r.native),input=name==='alias'?[{n:1}]:[1],nativeCaller=structuredClone(input),decoded=structuredClone(nativeCaller);
 const jsReturn=original.rows(input),copiedReturn=copy.rows(decoded);results.push({name,jsReturn,copiedReturn,jsCallerAfter:input,nativeCallerAfter:nativeCaller});
}
for(const name of ['exported','escape','defaultEffect','init']){
 const r=rows.find(r=>r.name===name),original=instantiate(r.text),copy=instantiate(r.native);
 if(name==='exported')original.table.n=9;else if(name==='escape')original.mutate();
 results.push({name,jsReturn:original.rows([1]),copiedReturn:copy.rows([1])});
}
{const r=rows.find(r=>r.name==='statefulLiteral'),original=instantiate(r.text),copy=instantiate(r.native);original.advance();results.push({name:'statefulLiteral',jsReturn:original.rows(['x']),copiedReturn:copy.rows(['x'])});}
fs.writeFileSync(new URL('counterexamples.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
for(const name of ['functionMetadata','lexicalHelper']){
 const r=rows.find(r=>r.name===name),original=instantiate(r.text),copy=instantiate(r.native);original.mutate();
 results.push({name,jsReturn:original.rows(name==='functionMetadata'?['v']:[1]),copiedReturn:copy.rows(name==='functionMetadata'?['v']:[1])});
}
for(const name of ['tdzDefault','tdzArithmetic','tdzTable','tdzReverse']){
 const r=rows.find(r=>r.name===name),copy=instantiate(r.native);
 const source=r.text.replace(/(export function rows\([^)]*\)\s*\{)/,'$1if(nativeRows)return nativeRows(x);');
 const plain=stripTypeScriptTypes(source.replace(/export\s+(?=const|function)/g,'').replace(/export\s+default\s+/g,'void '));
 const factory=new Function('nativeRows',plain+';return '+(name==='tdzDefault'?'Marker.value':'early')+';');
 let js;try{js={value:factory(null)};}catch(e){js={throws:e.name};}
 results.push({name,js,forcedNativeDuringOriginalSetup:{value:factory(copy.rows)},note:'Simulates the copied closure behind the original module wrapper during setup.'});
}
fs.writeFileSync(new URL('counterexamples.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
