# Sound › Concert models

Third-party model files, unchanged. Loaded lazily by `src/pipeline/audio/concert-worker.ts` and kept in the app's own
cache (`concert-v1`): YAMNet after Clean voice has run (is the clip a concert?), Spleeter only in Concert mode.

| File | Model | Licence | Source |
|---|---|---|---|
| `yamnet.fp16.onnx` (7.5 MB) | YAMNet (MobileNetV1 on AudioSet, 521 classes) over 0.96 s log-mel patches, scores every 0.48 s | Apache-2.0 (Google; `LICENSE-YAMNET-APACHE`) | [audiojs/yamnet](https://huggingface.co/audiojs/yamnet) `yamnet.fp16.onnx`, sha256 `0a1f3b05…515688` (converted from tensorflow/models `research/audioset/yamnet` + `yamnet.h5`) |
| `vocals.fp16.onnx` (19.7 MB) | Spleeter 2-stem, vocals U-Net (44.1 kHz stereo magnitudes, FFT 4096 / hop 1024, 1024 bins, 512-frame blocks) | MIT (Deezer; `LICENSE-SPLEETER-MIT`) | sherpa-onnx release `source-separation-models`, `sherpa-onnx-spleeter-2stems-fp16.tar.bz2`, sha256 `24cef84a…7b668` |
| `accompaniment.fp16.onnx` (19.7 MB) | Spleeter 2-stem, accompaniment U-Net | MIT (Deezer) | same archive, sha256 `d14cea55…b014fcc0` |

Licence notes (to revisit before any paid release; the app is a free private beta as of Nov 2026):
- Spleeter: code and pretrained models MIT, trained on Deezer's own catalogue (not MUSDB); used commercially by
  others (VirtualDJ, Acoustica). sherpa-onnx (Apache-2.0) did the ONNX export.
- YAMNet: Apache-2.0 code and weights (Google). The ONNX conversion by @audio/neural-tag is Apache-2.0.
- Not used (stronger but unlicensed): UVR MDX-Net Crowd_HQ_1 (aufr33, no licence from the author), HTDemucs (weights
  trained partly on MUSDB18, research-only).
