// Boundary types come from the application's checker, including imported aliases,
// inferred returns, tsconfig paths/extends and the configured standard libraries.
export function checkFunctionTypes(ts, program, modules) {
  const checker = program.getTypeChecker();
  for (const module of modules) {
    const source = program.getSourceFile(module.source);
    for (const fn of module.functions) {
      const fail = (at, type, reason) => {
        const printed = checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
        throw new Error(`[next-scriptc] ${module.source}: function ${fn.name}: ${at}: ${reason} (type ${printed})`);
      };
      let declaration;
      function find(node) {
        if (ts.isFunctionLike(node) && node.body?.getStart(source) === fn.start) declaration = node;
        else ts.forEachChild(node, find);
      }
      find(source);
      if (!declaration) throw new Error(`[next-scriptc] ${module.source}: function ${fn.name}: cannot resolve TypeScript signature`);
      const signature = checker.getSignatureFromDeclaration(declaration);
      const active = new Set();
      const isBytes = type => fn.promotion && type.getSymbol()?.getName()==='Uint8Array' && type.getSymbol().declarations?.some(d=>program.isSourceFileDefaultLibrary(d.getSourceFile()));
      function check(type, at) {
        if(!at.includes('.') && !at.includes('[') && isBytes(type))return;
        if (type.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.Null)) return;
        if (type.isUnion()) { for (const member of type.types) check(member, at); return; }
        if (!(type.flags & ts.TypeFlags.Object) && !type.isIntersection()) fail(at, type, 'expected JSON data; any, unknown, undefined, void, bigint, symbol and unresolved generics are unsupported');
        if (active.has(type)) return; // Recursive data types are valid; runtime rejects cycles.
        active.add(type);
        try {
          if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length || checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length) fail(at, type, 'functions and constructors are not JSON data');
          const symbol = type.getSymbol();
          if (symbol?.declarations?.some((d) => ts.isClassDeclaration(d) || ts.isClassExpression(d))) fail(at, type, 'class instances are not JSON data');
          if (checker.isTupleType(type)) {
            const flags = type.target.elementFlags;
            for (const [i, element] of checker.getTypeArguments(type).entries()) {
              if (flags[i] & ts.ElementFlags.Optional) fail(`${at}[${i}]`, element, 'optional tuple elements are unsupported; use a required element with | null');
              check(element, `${at}[${i}]`);
            }
            return;
          }
          if (checker.isArrayType(type)) { check(checker.getTypeArguments(type)[0], `${at}[]`); return; }
          for (const property of checker.getPropertiesOfType(type)) {
            const location = property.valueDeclaration ?? property.declarations?.[0] ?? declaration;
            const propertyType = checker.getTypeOfSymbolAtLocation(property, location);
            const nested = `${at}.${property.getName()}`;
            if (property.flags & ts.SymbolFlags.Optional) fail(nested, propertyType, 'optional properties are unsupported; use a required property with | null');
            if (property.escapedName.toString().startsWith('__@')) fail(nested, propertyType, 'symbol properties are not JSON data');
            if (property.declarations?.some((d) => ts.isGetAccessorDeclaration(d) || ts.isSetAccessorDeclaration(d))) fail(nested, propertyType, 'accessors are not JSON data');
            check(propertyType, nested);
          }
          for (const index of checker.getIndexInfosOfType(type)) {
            if (index.keyType.flags & ts.TypeFlags.ESSymbolLike) fail(`${at}[symbol]`, index.type, 'symbol index signatures are not JSON data');
            check(index.type, `${at}[${checker.typeToString(index.keyType)}]`);
          }
        } finally { active.delete(type); }
      }
      function encoding(type) {
        if(isBytes(type))return 'bytes';
        if (type.isUnion()) {
          const kinds = new Set(type.types.map(encoding));
          return kinds.size === 1 ? [...kinds][0] : 'json';
        }
        if (type.flags & ts.TypeFlags.StringLike) return 'string';
        if (type.flags & ts.TypeFlags.NumberLike) return 'number';
        if (type.flags & ts.TypeFlags.BooleanLike) return 'boolean';
        if (type.flags & ts.TypeFlags.Null) return 'null';
        return 'json';
      }
      for (const parameter of declaration.parameters) {
        const type = checker.getTypeAtLocation(parameter);
        const at = `parameter ${parameter.name.getText(source)}`;
        if (parameter.questionToken) fail(at, type, 'optional parameters are unsupported; use a required parameter with | null');
        check(type, at);
      }
      const result = checker.getAwaitedType(checker.getReturnTypeOfSignature(signature));
      check(result, 'return');
      // Bounded schemas only. Recursive types, dictionaries, tuples and mixed
      // unions keep the generic validator rather than guessing a closed layout.
      let shapeBudget = 256;
      function shape(type, seen = new Set(), depth = 0) {
        if (--shapeBudget < 0 || depth > 32 || seen.has(type)) return null;
        if (type.flags & ts.TypeFlags.StringLike) return {kind:'string'};
        if (type.flags & ts.TypeFlags.NumberLike) return {kind:'number'};
        if (type.flags & ts.TypeFlags.BooleanLike) return {kind:'boolean'};
        if (type.flags & ts.TypeFlags.Null) return {kind:'null'};
        if (type.isUnion()) {
          const members = type.types.filter(t => !(t.flags & ts.TypeFlags.Null));
          if (members.length === 1 && members.length < type.types.length) {
            const value = shape(members[0], seen, depth + 1);
            return value && {kind:'nullable',value};
          }
          return null;
        }
        const nested = new Set(seen).add(type);
        if (checker.isArrayType(type)) {
          const value = shape(checker.getTypeArguments(type)[0], nested, depth + 1);
          return value && {kind:'array',value};
        }
        if (checker.isTupleType(type) || checker.getIndexInfosOfType(type).length) return null;
        const fields = checker.getPropertiesOfType(type).map(p => [p.getName(),shape(checker.getTypeOfSymbolAtLocation(p,p.valueDeclaration ?? p.declarations?.[0] ?? declaration),nested,depth + 1)]);
        return fields.every(([,s])=>s) ? {kind:'object',fields} : null;
      }
      if (fn.promotion && encoding(result) === 'json') fn.resultShape = shape(result);
      fn.boundary = { params: declaration.parameters.map(p => encoding(checker.getTypeAtLocation(p))), result: encoding(result) };
    }
  }
}
