#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
name=nsc-standin-d3
if docker container inspect "$name" >/dev/null 2>&1; then echo "$name already exists" >&2; exit 1; fi
trap 'docker rm -f "$name" >/dev/null' EXIT
docker create --name "$name" --platform linux/arm64 --cpus=1 --cpuset-cpus=11 --memory=2g --memory-swap=2g --network=none --mount "type=bind,source=$PWD,target=/work" --workdir /work nsc-standin:node24 sleep infinity >/dev/null
docker start "$name" >/dev/null
docker inspect "$name" > research/nested-dispatch/revenue-container.json
for workload in micro revenue; do
 ps -A -o pid,pcpu,comm > "research/nested-dispatch/$workload-host.log"
 uptime >> "research/nested-dispatch/$workload-host.log"
 if [[ "$workload" == micro ]]; then
  docker exec "$name" node research/nested-dispatch/micro.mjs research/nested-dispatch/micro.json
 else
  docker exec "$name" node research/standin/measure.mjs revenue research/nested-dispatch/revenue.json
 fi
done
