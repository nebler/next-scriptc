import {constructionType} from './construction-validator.mjs';
import {babelModules} from '../babel.mjs';

// Keep the original string parameter, and supply its checked preflight value
// through an additional native-only parameter. The JS closure stays unchanged.
export function constructionDecode(text, fn, enabled) {
 const guards=enabled ? fn.constructionProof?.guards?.[fn.name]??[] : [];
 fn.decodedInputs=[];
 if(!guards.length)return text;
 const {parse}=babelModules.parser();
 const traverse=babelModules.traverse().default,generate=babelModules.generator().default,t=babelModules.types();
 const ast=parse(text,{sourceType:'module',plugins:['typescript']});
 const bounded=s=>['number','string','boolean','null'].includes(s.kind)
  || ['array','nullable'].includes(s.kind)&&bounded(s.value)
  || s.kind==='object'&&s.fields.length>0&&s.fields.every(([,v])=>bounded(v));
 const isParse=n=>t.isMemberExpression(n.callee)&&!n.callee.computed
  &&t.isIdentifier(n.callee.object,{name:'JSON'})&&t.isIdentifier(n.callee.property,{name:'parse'})
  &&n.arguments.length===1&&t.isIdentifier(n.arguments[0]);
 traverse(ast,{FunctionDeclaration(p){
  if(p.node.id?.name!==fn.name)return;
  const bindings=new Map();
  for(const index of new Set(guards.map(g=>g.index))){
   if(fn.boundary.params[index]!=='string')continue;
   // Repeated or conditional parses can expose distinct object identities.
   // Only a single top-level initializer can share the preflight allocation.
   if(guards.filter(g=>g.index===index).length!==1)continue;
   const shape=guards.find(g=>g.index===index).shape;
   if(!bounded(shape))continue;
   const param=p.node.params[index];
   if(!t.isIdentifier(param))throw Error('Construction decode requires direct parameter');
   const binding=p.scope.getBinding(param.name);
   let sites=0,safe=true;
   p.traverse({CallExpression(q){
    if(!isParse(q.node)||q.scope.getBinding(q.node.arguments[0].name)!==binding)return;
    sites++;
    const cast=q.parentPath,decl=cast.parentPath;
    safe&&=cast.isTSAsExpression()&&decl.isVariableDeclarator()
     &&decl.node.init===cast.node&&decl.parentPath.parentPath.node===p.node.body;
   }});
   if(sites!==1||!safe)continue;
   const name=p.scope.generateUidIdentifier('scriptcDecoded'+index);
   const type=parse('type T='+constructionType(shape),{plugins:['typescript']}).program.body[0].typeAnnotation;
   name.typeAnnotation=t.tsTypeAnnotation(type);
   bindings.set(binding,name.name);
   p.node.params.push(name);
   fn.decodedInputs.push({index,name:name.name});
  }
  p.traverse({CallExpression(q){
   if(!isParse(q.node))return;
   const replacement=bindings.get(q.scope.getBinding(q.node.arguments[0].name));
   if(replacement)q.replaceWith(t.identifier(replacement));
  }});
  p.skip();
 }});
 return generate(ast).code;
}
