// Opt-in benchmark launcher. Buffer this streamed page so timing from its
// Suspense child can be included in HTTP headers. Ordinary builds stay streamed.
const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");
const storage = globalThis[Symbol.for("next-scriptc.report-timing")] ??= new AsyncLocalStorage();
const instance = randomUUID();
module.exports = function wrap(handler) {
  return function timed(req, res) {
    if (process.env.NATIVE_VERCEL_TIMING !== "1" || !req.url.split("?")[0].endsWith("/reports")) return handler(req, res);
    const begin = performance.now(), sample = {}, chunks = [];
    const write = res.write, end = res.end, writeHead = res.writeHead, flushHeaders = res.flushHeaders;
    let head;
    res.writeHead = function (...args) { head = args; return this; };
    res.flushHeaders = function () {};
    res.write = function (chunk, encoding, callback) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === "string" ? encoding : undefined));
      if (typeof encoding === "function") encoding();
      else callback?.();
      return true;
    };
    res.end = function (chunk, encoding, callback) {
      if (chunk) res.write(chunk, encoding);
      Object.assign(res, { write, end, writeHead, flushHeaders });
      if (head) writeHead.apply(this, head);
      // writeHead can commit headers, so set observations before forwarding it.
      return end.call(this, Buffer.concat(chunks), typeof encoding === "function" ? encoding : callback);
    };
    const bufferedEnd = res.end;
    res.end = function (...args) {
      const totalMs = performance.now() - begin;
      res.setHeader("server-timing", `function;dur=${sample.functionMs?.toFixed(3)}, render;dur=${totalMs.toFixed(3)}`);
      res.setHeader("x-native-instance", instance);
      res.setHeader("x-native-ready-before-call", String(sample.readyBeforeCall));
      res.setHeader("x-native-boot-ms", String(sample.bootMs ?? "none"));
      res.setHeader("x-native-attempts", String(sample.attempts ?? 0));
      res.setHeader("x-native-pid", String(sample.pid ?? "none"));
      return bufferedEnd.apply(this, args);
    };
    return storage.run(sample, () => handler(req, res));
  };
};
