// tsserver loads plugins synchronously via require, including in ESM packages.
const {Worker} = require('node:worker_threads');
const path = require('node:path');
module.exports = function init({typescript: ts}) {
  return {create(info) {
    const service = info.languageService;
    const proxy = Object.create(null);
    for (const key of Object.keys(service)) if (typeof service[key] === 'function') proxy[key] = service[key].bind(service);
    const cache = new Map();
    const pending = new Map();
    let worker, active, deadline, disposed = false, sequence = 0;
    const config = info.config || {};
    const delay = Math.max(20, Math.min(2000, Number(config.debounceMs) || 150));
    const log = error => {try {info.project.projectService.logger.info(`[scriptc-promote] ${error}`);} catch {}};
    function stop() {
      clearTimeout(deadline);
      if (worker) worker.terminate().catch(() => {});
      worker = undefined;
      active = undefined;
    }
    function pump() {
      if (disposed || active || !pending.size) return;
      const [file, job] = pending.entries().next().value;
      pending.delete(file);
      try {
        if (!worker) {
          worker = new Worker(path.join(__dirname, 'worker.mjs'));
          worker.unref();
          worker.on('error', error => {log(error); stop();});
          worker.on('message', result => {
            if (!active || result.id !== active.id) return;
            clearTimeout(deadline);
            const job = active;
            active = undefined;
            if (result.error) log(result.error);
            else if (cache.get(job.file)?.key === job.key) {
              cache.get(job.file).result = result;
              try {info.project.refreshDiagnostics();} catch {}
            }
            pump();
          });
        }
        active = job;
        worker.postMessage(job);
        deadline = setTimeout(() => {log('analysis exceeded 5 seconds; discarded'); stop(); pump();}, 5000);
        deadline.unref();
      } catch (error) {log(error); stop();}
    }
    function lookup(file) {
      if (disposed) return;
      const host = info.languageServiceHost;
      const key = `${host.getScriptVersion(file)}:${host.getProjectVersion?.() || ''}`;
      let entry = cache.get(file);
      if (!entry || entry.key !== key) {
        clearTimeout(entry?.timer);
        entry = {key};
        cache.set(file, entry);
        while (cache.size > 32) {const oldest = cache.keys().next().value; clearTimeout(cache.get(oldest).timer); cache.delete(oldest); pending.delete(oldest);}
      }
      if (!entry.timer && Date.now() - (entry.checked || 0) > 1000) {
        entry.timer = setTimeout(() => {
          entry.timer = undefined;
          if (disposed || cache.get(file) !== entry) return;
          try {
            // Collect unsaved buffers after the debounce, never in a request.
            const names = host.getScriptFileNames();
            if (names.length > 256) return;
            const overlays = {};
            let bytes = 0;
            for (const name of new Set([...names, file])) {
              const snapshot = host.getScriptSnapshot(name);
              if (!snapshot) continue;
              bytes += snapshot.getLength();
              if (bytes > 2_000_000) return;
              overlays[path.resolve(name)] = snapshot.getText(0, snapshot.getLength());
            }
            entry.checked = Date.now();
            pending.set(file, {id: ++sequence, file, key, overlays, root: host.getCurrentDirectory(), options: host.getCompilationSettings(), hints: config.unmarkedHints === true, typescriptPath: path.join(path.dirname(host.getDefaultLibFileName(host.getCompilationSettings())), 'typescript.js')});
            pump();
          } catch (error) {log(error);}
        }, delay);
        entry.timer.unref();
      }
      return entry.result;
    }
    function diagnostics(file) {
      const result = lookup(file);
      if (!result) return [];
      const source = service.getProgram()?.getSourceFile(file);
      if (!source) return [];
      return result.diagnostics.map(d => ({...d, file: source, category: d.marked ? ts.DiagnosticCategory.Error : ts.DiagnosticCategory.Suggestion, source: 'scriptc-promote'}));
    }
    proxy.getSemanticDiagnostics = file => {
      const original = service.getSemanticDiagnostics(file);
      try {return original.concat(diagnostics(file).filter(d => d.marked));} catch (error) {log(error); return original;}
    };
    proxy.getSuggestionDiagnostics = file => {
      const original = service.getSuggestionDiagnostics(file);
      try {return original.concat(diagnostics(file).filter(d => !d.marked));} catch (error) {log(error); return original;}
    };
    proxy.getQuickInfoAtPosition = (file, position) => {
      const original = service.getQuickInfoAtPosition(file, position);
      try {
        const result = lookup(file);
        const status = result?.statuses.find(s => position >= s.start && position < s.end);
        if (!status) return original;
        const documentation = [...(original?.documentation || []), {kind: 'text', text: `\nuse native: ${status.message}`}];
        return original ? {...original, documentation} : {kind: ts.ScriptElementKind.functionElement, kindModifiers: '', textSpan: {start: status.start, length: status.end - status.start}, displayParts: [], documentation};
      } catch (error) {log(error); return original;}
    };
    proxy.dispose = () => {disposed = true; for (const entry of cache.values()) clearTimeout(entry.timer); pending.clear(); stop(); service.dispose();};
    return proxy;
  }};
};
