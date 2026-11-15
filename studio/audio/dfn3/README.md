# DeepFilterNet3 for Sound › Clean voice

Third-party files, MIT OR Apache-2.0 (LICENSE-MIT, LICENSE-APACHE), by Hendrik Schröter.
Source: https://github.com/Rikorose/DeepFilterNet at commit 7b14b895fe7fc42cab72b4a4c1e49c982bd6404b.

| File | What | sha256 |
|---|---|---|
| `DeepFilterNet3_onnx.tgz.bin` | `models/DeepFilterNet3_onnx.tar.gz` from the repo, renamed (servers that send `.gz` with `Content-Encoding: gzip` handed the page a bare tar) | c94d91f70911001c946e0fabb4aa9adc37045f45a03b56008cb0c8244cb63616 |
| `df_bg.wasm` | libDF built for the web: `wasm-pack build --target web --release --out-name df libDF -- --no-default-features --features wasm`, `RUSTFLAGS="-C target-feature=+simd128"`, rustc 1.97.1, wasm-pack 0.13.1 | 03bf5ad9af9bb61014e0374b86b068608e0bae6e7b60be83a5792b538982c034 |

The JS glue is `src/pipeline/audio/df/df.js` (wasm-bindgen output of the same build).

Changes to upstream for the build:
- the `wasm` feature no longer pulls `default-model` (the model is this separate file, not embedded);
- `RuntimeParams` derives `Clone`; `DFState` keeps the parsed model and runtime params;
- three functions added to `libDF/src/wasm.rs`: `df_free` (drop a state), `df_reset` (fresh model state, same model:
  each chunk of the clip starts clean, see chunks.ts) and `df_process_frames` (many 480-sample frames per call).
