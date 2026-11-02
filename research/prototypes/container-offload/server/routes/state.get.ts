export default defineEventHandler(()=>[...(globalThis[Symbol.for('scriptc-promote.dispatchers')]??new Map()).values()].map(d=>d.snapshot()));
