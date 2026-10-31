#!/bin/sh
# SCRIPTC_SOURCE identifies the built source checkout; no package override needed.
set -eu
: "${SCRIPTC_SOURCE:?Set SCRIPTC_SOURCE to the scriptc source checkout}"
exec "${SCRIPTC_NODE:-node}" "$SCRIPTC_SOURCE/packages/cli/dist/main.js" "$@"
