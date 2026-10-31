#!/bin/sh
# Reuse the V4-verified built CLI with V4's rebuilt main-compatible musl runtime.
set -eu
export SCRIPTC_SOURCE=/Users/noah/code/scriptc-fork
export SCRIPTC_RUNTIME_PACK=/Users/noah/code/scriptc-fork-v4/packages/runtime-linux-x64-musl
vector_tools=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export NODE_OPTIONS="--require=$vector_tools/../vector-cpu-levels/runtime-pack.cjs"
exec node "$SCRIPTC_SOURCE/packages/cli/dist/main.js" "$@"
