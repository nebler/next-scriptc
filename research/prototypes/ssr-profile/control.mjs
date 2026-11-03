// Loaded into the measured process. IPC keeps CPU accounting out of HTTP routes.
import inspector from "node:inspector";
const session = new inspector.Session();
session.connect();
const post = (method, params = {}) =>
  new Promise((resolve, reject) =>
    session.post(method, params, (e, r) => (e ? reject(e) : resolve(r))),
  );
let cpu, startUs;
process.on("message", async (m) => {
  try {
    if (m.op === "start") {
      if (m.profile) {
        await post("Profiler.enable");
        await post("Profiler.setSamplingInterval", { interval: 1000 });
        await post("Profiler.start");
      }
      cpu = process.cpuUsage();
      startUs = Number(process.hrtime.bigint() / 1000n);
      process.send({ id: m.id });
    } else if (m.op === "stop") {
      const stopUs = Number(process.hrtime.bigint() / 1000n);
      const usage = process.cpuUsage(cpu);
      const profile = m.profile
        ? (await post("Profiler.stop")).profile
        : undefined;
      process.send({ id: m.id, usage, profile, bounds: { startUs, stopUs } });
    }
  } catch (e) {
    process.send({ id: m.id, error: String(e) });
  }
});
