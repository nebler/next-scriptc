#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
workload=${1:-revenue}
label=${2:-$(date -u +%Y%m%dT%H%M%SZ)}
[[ "$label" =~ ^[a-zA-Z0-9_-]+$ ]] || exit 2
case "$workload" in revenue|correctness) ;; *) echo 'Workload must be revenue or correctness' >&2; exit 2;; esac
if [[ ! -f .checks/standin/arm64/boundary.node || ! -f .checks/standin/arm64/functions || ! -f .checks/standin/x64/revenue.node ]]; then
  mkdir -p .checks/standin/{arm64,x64}
  for pair in arm64:arm64 x64:x64; do
    arch=${pair%%:*}
    npm pack "@scriptc/runtime-linux-$arch-gnu@0.4.6" --pack-destination ".checks/standin/$arch"
    tar -xzf .checks/standin/"$arch"/*.tgz -C .checks/standin/"$arch"
  done
  node research/standin/build.mjs > research/standin/raw/build.log 2>&1
fi
mkdir -p research/standin/raw
out="research/standin/raw/$label-$workload.json"
[[ ! -e "$out" ]] || { echo "Refusing to overwrite $out" >&2; exit 2; }
name="nsc-standin-$label-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
if [[ "$workload" == correctness ]]; then
  image=node:24.22.2-bookworm-slim
  platform=linux/amd64
else
  docker build --platform linux/arm64 -t nsc-standin:node24 research/standin > research/standin/raw/image-build.log
  image=nsc-standin:node24
  platform=linux/arm64
fi
# Only this newly created, uniquely named container is ever removed.
(while :; do date -u +%FT%TZ; uptime; ps -A -o pcpu=,comm= | sort -rn | head -8; sleep 2; done) > "research/standin/raw/$label-host-load.log" &
monitor=$!
trap 'kill "$monitor" 2>/dev/null || true; docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
docker run --name "$name" --platform "$platform" --cpus=1 --cpuset-cpus="${STANDIN_CPU:-0}" --memory=2g --memory-swap=2g \
  --mount "type=bind,source=$PWD,target=/work" --workdir /work "$image" \
  node research/standin/measure.mjs "$workload" "$out"
docker inspect "$name" --format '{{json .HostConfig}}' > "research/standin/raw/$label-container.json"
