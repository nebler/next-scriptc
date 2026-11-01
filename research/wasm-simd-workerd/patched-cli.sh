#!/bin/sh
set -eu
wasm_tools=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export WASM_RUNTIME_PACK="$PWD/.checks/wasm-workerd/node_modules/@scriptc/runtime-wasm32-wasi"
export NODE_OPTIONS="--require=$wasm_tools/runtime-pack.cjs"
exec node /Users/noah/code/scriptc-fork/packages/cli/dist/main.js "$@"
