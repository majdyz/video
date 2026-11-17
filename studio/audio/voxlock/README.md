# Sound › Voices › Solo model

Third-party model files, unchanged. Loaded lazily by `src/pipeline/audio/solo-worker.ts` only when someone taps
**Solo** on a person (and that person talks over someone), and kept in the app's own cache (`voxlock-v1`).

| File | Model | Licence | Source |
|---|---|---|---|
| `enroll_fp16.onnx` (6.3 MB) | VoxLock enrollment graph: a ~3 s voice sample (16 kHz) → its spectrum + 512-d context (WeSpeaker ECAPA-TDNN512 inside) | Apache-2.0 (see `LICENSE`, `NOTICE`) | [nphearum/voxlock](https://huggingface.co/nphearum/voxlock) `onnx/enroll_fp16.onnx` (mirror of [arbazsiddiqui/voxlock](https://huggingface.co/arbazsiddiqui/voxlock)), sha256 `5fd3bb31…a62533` |
| `chunk_int8_full.onnx` (57.7 MB) | VoxLock extractor, fully int8-quantised: a causal band-split RNN (27 M params) target-speaker extraction, 100 STFT frames (512/128 at 16 kHz) per call, LSTM state carried. Chosen over fp16 for speed in onnxruntime-web WASM (measured in Node, one server vCPU: RTF 7.1 fp16 vs 4.0 int8_full on 1 thread, 1.5 on 4 threads); the card: 99.1 % of fp32's correct words, fewest leaked words | Apache-2.0 | same repo `onnx/chunk_int8_full.onnx`, sha256 `7b57c1bf…1eaa337` |

`chunk_int8_full.onnx` is over 50 MB, so it is not in git: `scripts/fetch-models.mjs` (run by `pnpm build`, or
`pnpm models`) downloads it from the pinned repo commit and checks the sha256.

Licence notes (to revisit before any paid release; the app is a free private beta as of Nov 2026):
- The VoxLock card and repo say Apache-2.0. Its weights are fine-tuned from the REAL-TSE challenge baseline
  checkpoint (`tfmap_context_causal_100`, WeSep). That checkpoint shipped without a licence; VoxLock's `NOTICE` says its
  trainer (Ke Zhang) confirmed Apache-2.0 for the inference code and the parameters.
- Training data: LibriSpeech and the AMI Meeting Corpus (both CC BY 4.0); speaker encoder from WeSpeaker (VoxCeleb).
- fp16 = the float32 model with weights rounded to float16 (the card: output matches fp32 to 45 dB).
