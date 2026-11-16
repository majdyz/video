# Sound › Voices models

Third-party model files, built by `scripts/speakers-models.py` (fp16 weight storage, cast to fp32 at load). Loaded
lazily by `src/pipeline/audio/speakers-worker.ts` only after Clean voice has run, and kept in the app's own cache.

| File | Model | Licence | Source |
|---|---|---|---|
| `segmentation-3.0.onnx` | pyannote segmentation-3.0 (speech / overlap per 17 ms frame, 10 s windows) | MIT, (c) CNRS, Hervé Bredin | [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0); ONNX from [onnx-community/pyannote-segmentation-3.0](https://huggingface.co/onnx-community/pyannote-segmentation-3.0) rev 733a93b |
| `campplus-en.onnx` | CAM++ speaker embedding (VoxCeleb, 512-d) | Apache-2.0, Alibaba 3D-Speaker | [iic/speech_campplus_sv_en_voxceleb_16k](https://www.modelscope.cn/models/iic/speech_campplus_sv_en_voxceleb_16k); ONNX from [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models); ceil-mode AveragePool rewritten for onnxruntime-web 1.20 (see the script) |
| `tiger-speech-4s.onnx` | TIGER-speech separator core, 2 speakers, 16 kHz, fixed 4 s: splits overlapped speech; opt-in (`?voicesplit=1`, desktop): +0.4 dB SI-SDRi on the test conversations for 7x the time and ~1.5 GB | Apache-2.0 (weights), MIT (code), Kai Li et al. | [JusperLee/TIGER-speech](https://huggingface.co/JusperLee/TIGER-speech) rev f034034, [JusperLee/TIGER](https://github.com/JusperLee/TIGER) |
