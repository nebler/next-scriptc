# Contributing

Use Node 24 and pnpm 11.1.3. After cloning:

```sh
pnpm install --frozen-lockfile
pnpm test
```

`pnpm test` runs compiler-free package tests and the demo's offline benchmark
harness. This is also the CI suite. The full package tests include three native
integration cases, so run these with the platform toolchain installed:

```sh
SCRIPTC_CHECKER_SERVER=0 pnpm test:native
```

Keep optional dependencies enabled. scriptc 0.4.6 supplies platform-specific
checker, comptime, LLVM and runtime packages; native builds also need a host
linker. See the [compiler installation notes](examples/demo/README.md#compiler-installation)
for requirements and helper-permission repair. CI installs with `--ignore-scripts`
and never compiles native code.

For adapter changes, run the integration commands in the root
[Tests section](README.md#tests) sequentially. They build and launch local Next
and native servers. Use the installed Next documentation in
`examples/demo/node_modules/next/dist/docs/` for version-specific adapter APIs.

Include a small reproduction and the Node, Next and scriptc versions in bug
reports. Preserve failed benchmark runs and link performance claims to a method
and raw evidence in [research](research/README.md). Report quiet-host or hosted
measurements separately from timings on a loaded development machine.

Contributions are licensed under [Apache-2.0](LICENSE).
