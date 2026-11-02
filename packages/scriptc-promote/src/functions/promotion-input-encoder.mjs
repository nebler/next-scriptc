// Schema-specific JSON writers, compiled once per loaded schema. Node native
// promotion already requires a native addon. Under a no-eval CSP use the strict
// interpreter instead; edge runtimes cannot load this native lane in either case.
// Never cache descriptor validation by keys/prototype: JS exposes no sound
// hidden-class token, and a later object can replace any field with an accessor.
export function generateInputEncoder(shape) {
  const functions=[];
  let budget=256;
  function visit(s,depth=0){
    if(--budget<0||depth>32)throw Error('Encoder schema too large');
    const name='e'+functions.length,slot=functions.push('')-1;
    let body;
    if(s.kind==='handle')body='return String(h(v));';
    else if(s.kind==='nullable'){const child=visit(s.value,depth+1);body=`return v===null?'null':${child}(v,h);`;}
    else if(s.kind==='array'){
      const child=visit(s.value,depth+1);
      body=`if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||Object.getOwnPropertySymbols(v).length||Object.getOwnPropertyNames(v).length!==v.length+1)fail();const parts=new Array(v.length);for(let i=0;i<v.length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!('value' in d))fail();parts[i]=${child}(d.value,h);}return '['+parts.join(',')+']';`;
    }else if(s.kind==='object'){
      // Evaluate in schema order (handle IDs depend on it), then emit JSON's
      // integer-key enumeration order. Validate only projected properties.
      const fields=s.fields;
      body="if(v===null||typeof v!=='object')fail();const p=Object.getPrototypeOf(v);if(p!==Object.prototype&&p!==null)fail();";
      for(const [i,[key,child]] of fields.entries()){
        if(['__proto__','constructor','prototype','toJSON'].includes(key))throw Error('Reserved boundary field');
        const literal=JSON.stringify(key);
        if(s.original&&key==='__scriptcOriginal')body+=`const f${i}=String(h(v));`;
        else{const fn=visit(child,depth+1);body+=`const d${i}=Object.getOwnPropertyDescriptor(v,${literal});if(!d${i}||!('value' in d${i}))throw Error('Expected own data field');const f${i}=${fn}(d${i}.value,h);`;}
      }
      const keys=Object.keys(Object.fromEntries(fields));
      body+="return '{'"+keys.map((key,i)=>`+${JSON.stringify((i?',':'')+JSON.stringify(key)+':')}+f${fields.findIndex(([k])=>k===key)}`).join('')+"+'}';";
    }else if(s.kind==='number')body="if(typeof v!=='number'||!Number.isFinite(v))fail();return String(v);";
    else if(s.kind==='string')body="if(typeof v!=='string'||!v.isWellFormed())fail();return JSON.stringify(v);";
    else if(s.kind==='boolean')body="if(typeof v!=='boolean')fail();return v?'true':'false';";
    else if(s.kind==='null')body="if(v!==null)fail();return 'null';";
    else throw Error('Unsupported input shape');
    functions[slot]=`function ${name}(v,h){${body}}`;
    return name;
  }
  try{
    const entry=visit(shape);
    return new Function(`'use strict';function fail(){throw Error('Invalid projected boundary data');}${functions.join('\n')}return ${entry};`)();
  }catch{return null;} // Unsupported schema or CSP: retain the checked walker.
}
