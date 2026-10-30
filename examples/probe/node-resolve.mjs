// Next's bundler accepts this extensionless subpath; Node's ESM resolver doesn't.
// Resolve only the spelling, retaining the real installed Next implementation.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
  },
});
