// TypeScript's structural types cannot exclude extra properties, cycles, sparse
// arrays, non-finite numbers, or values fabricated by assertions/JSON.parse.
// Read descriptors in one batch per container. Besides avoiding a reflection
// call per field, traversing descriptor values never invokes user getters.
// Keep the built-in descriptor dictionaries in their checked dynamic form.
// Converting them to native records copies descriptors and installs identity
// observers for each field. Measured with scriptc 0.4.6, that costs more than
// these short dynamic lookups. This is not a Node island or an unchecked path.

// Native results already required ordinary array prototypes; Node arguments
// accepted any dense array. Preserve both policies with the same traversal.
// A generated dispatcher can retain its concrete return type in encode. Invoke
// it only AFTER the complete validation, so accessors/toJSON cannot run first.
// JSON.stringify on an erased native value repeatedly refreshes typed views;
// the same builtin at the typed call site uses the native JSON encoder.
export function serialize(value: unknown, plainArrays = false, encode: (() => string) | null = null, validated: (() => void) | null = null): string {
  const seen = new Set<unknown>();
  function data(descriptor: any): void {
    if (!descriptor || !descriptor.enumerable || descriptor.get || descriptor.set) throw new Error("JSON properties must be enumerable data properties");
    check(descriptor.value);
  }
  function check(value: unknown): void {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    // JSON transport canonicalizes -0 to 0 (JSON.stringify(-0) === "0"). Throwing
    // here inside the native lane would panic and poison the instance.
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (typeof value !== "object" || value === null) throw new Error("Expected JSON data (null, finite numbers, strings, booleans, arrays and plain objects)");
    if (seen.has(value)) throw new Error("Cyclic JSON data");
    seen.add(value);
    const array = Array.isArray(value);
    if (!array && Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Expected a plain JSON object");
    if (array && plainArrays && Object.getPrototypeOf(value) !== Array.prototype) throw new Error("Expected a plain JSON object or array");
    const descriptors: any = Object.getOwnPropertyDescriptors(value);
    // Descriptors include symbol keys. Inspect this plain dictionary rather
    // than asking scriptc to refresh the original native container again.
    if (Object.getOwnPropertySymbols(descriptors).length) throw new Error("Symbol properties are not JSON data");
    const keys = Object.keys(descriptors);
    if (array) {
      const length = (value as unknown[]).length;
      if (keys.length !== length + 1) throw new Error("Expected a dense JSON array without extra properties");
      for (let i = 0; i < length; i++) data(descriptors[String(i)]);
    } else {
      for (const key of keys) data(descriptors[key]);
    }
    seen.delete(value);
  }
  try {
    check(value);
    if (validated !== null) validated();
    return encode === null ? JSON.stringify(value) : encode();
  } catch (error) {
    throw new Error(`[next-scriptc] JSON serialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
