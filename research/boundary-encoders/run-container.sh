#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
name=nsc-standin-e1
if docker container inspect "$name" >/dev/null 2>&1; then echo "$name already exists" >&2; exit 1; fi
trap 'docker rm -f "$name" >/dev/null' EXIT
docker create --name "$name" --platform linux/arm64 --cpus=1 --cpuset-cpus=11 --memory=2g --memory-swap=2g --network=none --mount "type=bind,source=$PWD,target=/work" --workdir /work nsc-standin:node24 sleep infinity >/dev/null
docker start "$name" >/dev/null
docker inspect "$name" > research/boundary-encoders/container.json
ps -A -o pid,pcpu,comm > research/boundary-encoders/container-host.log
uptime >> research/boundary-encoders/container-host.log
if [[ "${E1_REVENUE_ONLY:-0}" != 1 ]]; then
 docker exec "$name" node research/boundary-encoders/measure.mjs linux research/boundary-encoders/container-raw.json
fi
ps -A -o pid,pcpu,comm > research/boundary-encoders/revenue-host.log
uptime >> research/boundary-encoders/revenue-host.log
if [[ "${E1_FIXTURE_ONLY:-0}" != 1 ]]; then
 docker exec "$name" node research/boundary-encoders/measure-revenue.mjs research/boundary-encoders/m3.json
fi
