// A literal dynamic import must not run this initializer before listen().
await new Promise<void>((resolve) => setTimeout(resolve, 250));
export { GET, POST, PUT, PATCH } from "./route.ts";
