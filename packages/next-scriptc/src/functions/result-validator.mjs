// Generate typed visits, but never treat a structural type as a closed shape.
// Unknown shapes take the complete generic path. Helpers run before typed reads.
export function resultValidator(shape, name = 'validateResult') {
  if (!shape) return '';
  const type = s => s.kind === 'array' ? `Array<${type(s.value)}>` : s.kind === 'nullable' ? `${type(s.value)}|null` : s.kind === 'object' ? `{${s.fields.map(([k,v])=>`${JSON.stringify(k)}:${type(v)}`).join(';')}}` : s.kind;
  let next = 0;
  const functions = [];
  function visit(s) {
    const id = `${name}_${next++}`;
    let body;
    if (s.kind === 'number') body = 'return typeof v==="number"&&Number.isFinite(v)&&!Object.is(v,-0);';
    else if (s.kind === 'string' || s.kind === 'boolean') body = `return typeof v===${JSON.stringify(s.kind)};`;
    else if (s.kind === 'null') body = 'return v===null;';
    else if (s.kind === 'nullable') body = `return v===null||${visit(s.value)}(v,seen);`;
    else if (s.kind === 'array') {
      const child = visit(s.value);
      body = `if(!resultContainer(v,true,[],seen))return false;for(let j=0;j<v.length;j++){if(!${child}(v[j],seen))return false;}seen.delete(v);return true;`;
    } else if (s.kind === 'object') {
      const fields = s.fields.map(([key, value]) => [key, visit(value)]);
      body = `if(!resultContainer(v,false,${JSON.stringify(fields.map(([key])=>key))},seen))return false;${fields.map(([key,child])=>`if(!${child}(v[${JSON.stringify(key)}],seen))return false;`).join('')}seen.delete(v);return true;`;
    } else return '';
    functions.push(`function ${id}(v:${type(s)},seen:Set<unknown>):boolean {${body}}`);
    return id;
  }
  const root = visit(shape);
  return functions.join('\n') + `\nfunction ${name}(v:any):boolean {return ${root}(v,new Set<unknown>());}\n`;
}
