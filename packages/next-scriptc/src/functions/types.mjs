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
      function check(type, at) {
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
      for (const parameter of declaration.parameters) {
        const type = checker.getTypeAtLocation(parameter);
        const at = `parameter ${parameter.name.getText(source)}`;
        if (parameter.questionToken) fail(at, type, 'optional parameters are unsupported; use a required parameter with | null');
        check(type, at);
      }
      check(checker.getAwaitedType(checker.getReturnTypeOfSignature(signature)), 'return');
    }
  }
}
