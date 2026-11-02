# Build context is the repository root. Always tag nsc-co1-app:local.
FROM node:24.22.0-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends clang python3 curl ca-certificates xz-utils && rm -rf /var/lib/apt/lists/*
RUN mkdir /opt/zig && curl -fsSL https://ziglang.org/download/0.14.1/zig-x86_64-linux-0.14.1.tar.xz | tar -xJ --strip-components=1 -C /opt/zig
ENV PATH="/opt/zig:${PATH}"
WORKDIR /repo
COPY packages/scriptc-promote ./packages/scriptc-promote
COPY research/prototypes/container-offload ./research/prototypes/container-offload
WORKDIR /repo/research/prototypes/container-offload
RUN npm pack /repo/packages/scriptc-promote --pack-destination . && npm install --no-package-lock && node node_modules/scriptc/scripts/install-native.mjs
RUN mkdir -p /root/.cache/node-gyp/24.22.1 && curl -fsSL https://nodejs.org/dist/v24.22.1/node-v24.22.1-headers.tar.gz | tar -xz --strip-components=1 -C /root/.cache/node-gyp/24.22.1
RUN node node_modules/nitropack/dist/cli/index.mjs build
FROM node:24.22.0-bookworm-slim
WORKDIR /app
COPY --from=build /repo/research/prototypes/container-offload/.output/server ./server
ENV PORT=8080 HOST=0.0.0.0
EXPOSE 8080
CMD ["node","server/index.mjs"]
