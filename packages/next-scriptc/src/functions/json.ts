export function serialize(value: unknown): string {
  const seen = new Set<unknown>();
  function property(value: object, key: string): void {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || descriptor.get || descriptor.set) throw new Error("JSON properties must be enumerable data properties");
    check((value as Record<string, unknown>)[key]);
  }
  function check(value: unknown): void {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (typeof value !== "object" || value === null) throw new Error("Expected JSON data (null, finite numbers, strings, booleans, arrays and plain objects)");
    if (seen.has(value)) throw new Error("Cyclic JSON data");
    seen.add(value);
    if (Object.getOwnPropertySymbols(value).length) throw new Error("Symbol properties are not JSON data");
    if (Array.isArray(value)) {
      if (Object.getOwnPropertyNames(value).length !== value.length + 1) throw new Error("Expected a dense JSON array without extra properties");
      for (let i = 0; i < value.length; i++) property(value, String(i));
    } else {
      if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Expected a plain JSON object");
      for (const key of Object.getOwnPropertyNames(value)) property(value, key);
    }
    seen.delete(value);
  }
  try {
    check(value);
    return JSON.stringify(value);
  } catch (error) {
    throw new Error(`[next-scriptc] JSON serialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// TypeScript's structural types cannot exclude extra properties, cycles, sparse
// arrays, non-finite numbers, or values fabricated by assertions/JSON.parse.
// Read descriptors in one batch per container. Besides avoiding a reflection
// call per field, traversing descriptor values never invokes user getters.
// The explicit descriptor type keeps scriptc out of its dynamic `any` tier.
type DataDescriptor = { enumerable: boolean; get: unknown; set: unknown; value: unknown };

export function serializeResult(value: unknown): string {
  const seen = new Set<unknown>();
  function data(descriptor: DataDescriptor | undefined): void {
    if (!descriptor || !descriptor.enumerable || descriptor.get || descriptor.set) throw new Error("JSON properties must be enumerable data properties");
    check(descriptor.value);
  }
  function check(value: unknown): void {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (typeof value !== "object" || value === null) throw new Error("Expected JSON data (null, finite numbers, strings, booleans, arrays and plain objects)");
    if (seen.has(value)) throw new Error("Cyclic JSON data");
    seen.add(value);
    if (Object.getOwnPropertySymbols(value).length) throw new Error("Symbol properties are not JSON data");
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) throw new Error("Expected a plain JSON object or array");
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, DataDescriptor>;
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
    return JSON.stringify(value);
  } catch (error) {
    throw new Error(`[next-scriptc] JSON serialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
