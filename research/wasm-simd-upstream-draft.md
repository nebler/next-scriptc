# Draft issue: allow SIMD target features for wasm32 library builds

Not filed. This draft describes a local experiment, not a production Workers CPU claim.

scriptc's LLVM target-machine factory in `native/llvm-codegen/src/target.cpp` calls:

```cpp
Definition->createTargetMachine(
    TargetTriple, "generic", "", targetOptions(TargetTriple), Reloc::PIC_,
    CodeModel::Small, codeGenLevel(OptLevel))
```

The empty feature string prevents LLVM from selecting WebAssembly SIMD instructions for ordinary scalar IR. Stock scriptc 0.4.6 wasm32-wasi reactors for int8 vector search, a Float32Array dot product, and revenue contain zero SIMD instructions.

Library mode retains textual `<entry>.lib.ll`. `--emit-ir` adds typed IR JSON; it does not itself select LLVM IR. Compiling the retained LLVM IR with Zig 0.16.0 using `zig cc --target=wasm32-wasi -msimd128 -O3 -c INPUT.lib.ll`, then linking the same stock ABI-47 runtime objects and exports, succeeds without rebuilding scriptc's native helper. WABT 1.0.39 counts 110 SIMD instructions in each numeric module and 122 in revenue. The equivalent `-mno-simd128 -O3` builds contain zero. Runtime objects remain unchanged.

Named disassembly places all 110 numeric-module SIMD instructions in Zig/WASI libc helpers. The optimized compiler-generated numeric IR contains no vector types. The dot-product loops remain scalar. This establishes a missing codegen option and a separate vectorization barrier. It does not establish automatic vectorization of the dot-product reduction or a speedup from enabling that option. The experiment preserves the natural multiply and `Math.imul` variants, a scalar O3 control, full-result SHA-256 checks, and local workerd CPU measurements. See `research/wasm-simd-workerd.md` and its raw records for the results and limitations.

A minimal opt-in patch could add `--wasm-simd`, propagate the option into library codegen and the native helper request, and pass `+simd128` as the target feature string when the target architecture is wasm32. Cache keys must include the feature choice. The linker and any auxiliary LLVM compilation must receive compatible feature settings. Reject or ignore the flag explicitly on other architectures. A wasm-specific default is another policy choice, but changes the minimum runtime requirement for existing users.

Suggested regression checks:

- A scalar numeric IR fixture produces lane instructions with SIMD enabled and none with SIMD disabled.
- Both reactors instantiate and return identical outputs in a SIMD-capable runtime.
- Library builds and executable builds use the same feature selection, and cached scalar objects are not reused for SIMD.
- A typed-array reduction checks whether bounds checks, aliasing, or JavaScript arithmetic semantics still block vectorization. Enabling target features alone does not resolve those barriers.
