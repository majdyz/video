#!/usr/bin/env python3
"""Builds the Studio "AI subject detection" model files (EdgeTAM video tracker, Apache-2.0) for the web build.

Inputs (pinned): the jax-image-tools/edgetam-video-onnx graphs (rev 8ca3d3e) and the two EdgeTAM parameters the
memory bank needs outside the graphs (no-memory embedding, memory temporal position encodings) from the
yonigozlan/EdgeTAM-hf checkpoint. Taken from the local Hugging Face cache, or downloaded when missing.

Output (default ~/video-data/models/edgetam-web, override with SEG_MODELS_DIR or argv[1]):
  vision_encoder.onnx, mask_decoder.onnx, memory_attention.onnx, memory_encoder.onnx
      fp16 *storage*: every float weight is stored as fp16 and cast back to fp32 at load, so the graphs compute in
      fp32 on every execution provider (the WASM CPU kernels have no fp16 math) at half the download.
      No INT8: the dynamic INT8 EdgeTAM builds lose the subject (IoU 0.24-0.36).
  bank.json      no_memory_embedding (256), memory_temporal_positional_encoding (7 x 64), graph constants
  manifest.json  file sizes + sha256 (the app's cache key)
  NOTICE         licence notice shipped beside the weights

The Vite build copies this folder into dist/seg/ (vite.config.ts studioSegModels); nothing here is committed.
Run with a Python that has onnx, numpy, safetensors (e.g. ~/.venvs/video/bin/python).
"""
import glob, hashlib, json, os, sys
import numpy as np, onnx
from onnx import helper, numpy_helper, TensorProto

VIDEO_REPO, VIDEO_REV = "jax-image-tools/edgetam-video-onnx", "8ca3d3e4169938e65b552cdf14542fde25e8badb"
CKPT_REPO = "yonigozlan/EdgeTAM-hf"
GRAPHS = ["vision_encoder", "mask_decoder", "memory_attention", "memory_encoder"]
HF_HOME = os.environ.get("HF_HOME", os.path.expanduser("~/video-data/models/hf"))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SEG_MODELS_DIR", os.path.expanduser("~/video-data/models/edgetam-web"))

NOTICE = """Studio AI subject detection uses EdgeTAM (Meta Platforms, Inc.), https://github.com/facebookresearch/EdgeTAM
Copyright (c) Meta Platforms, Inc. and affiliates. Licensed under the Apache License, Version 2.0.
ONNX graphs: jax-image-tools/edgetam-video-onnx (Apache-2.0); weights converted to fp16 storage by deepfix
(apps/studio/scripts/seg-models.py), no other changes.
Runtime: ONNX Runtime Web 1.20.1, Copyright (c) Microsoft Corporation, MIT License.
A copy of the Apache License is at http://www.apache.org/licenses/LICENSE-2.0
"""


def snapshot(repo, rev=None):
    hits = glob.glob(os.path.join(HF_HOME, "hub", "models--" + repo.replace("/", "--"), "snapshots", rev or "*", ""))
    if hits:
        return hits[0]
    from huggingface_hub import snapshot_download  # only when not cached
    return snapshot_download(repo, revision=rev, cache_dir=os.path.join(HF_HOME, "hub")) + "/"


def fp16_storage(model, min_elems=64):
    """Float initializers (and large float Constant nodes) -> fp16 initializer + Cast(to=float) node."""
    g = model.graph
    casts, keep = [], []
    for init in g.initializer:
        if init.data_type == TensorProto.FLOAT and int(np.prod(init.dims or [1])) >= min_elems:
            h = numpy_helper.from_array(numpy_helper.to_array(init).astype(np.float16), init.name + "__f16")
            keep.append(h)
            casts.append(helper.make_node("Cast", [h.name], [init.name], to=TensorProto.FLOAT, name=init.name + "__cast"))
        else:
            keep.append(init)
    del g.initializer[:]
    g.initializer.extend(keep)
    nodes = []
    for n in g.node:
        t = n.attribute[0].t if n.op_type == "Constant" and n.attribute and n.attribute[0].name == "value" else None
        if t is not None and t.data_type == TensorProto.FLOAT and int(np.prod(t.dims or [1])) >= min_elems:
            h = numpy_helper.from_array(numpy_helper.to_array(t).astype(np.float16), n.output[0] + "__f16")
            g.initializer.append(h)
            nodes.append(helper.make_node("Cast", [h.name], [n.output[0]], to=TensorProto.FLOAT, name=n.output[0] + "__cast"))
        else:
            nodes.append(n)
    del g.node[:]
    g.node.extend(casts + nodes)
    return model


def main():
    os.makedirs(OUT, exist_ok=True)
    src = snapshot(VIDEO_REPO, VIDEO_REV)
    for name in GRAPHS:
        onnx.save(fp16_storage(onnx.load(src + name + ".onnx")), os.path.join(OUT, name + ".onnx"))
    from safetensors import safe_open
    ck = safe_open(glob.glob(snapshot(CKPT_REPO) + "model.safetensors")[0], "np")
    bank = {
        "no_memory_embedding": ck.get_tensor("no_memory_embedding").reshape(-1).astype(float).tolist(),
        "memory_temporal_positional_encoding": ck.get_tensor("memory_temporal_positional_encoding").reshape(7, 64).astype(float).tolist(),
        "constants": json.load(open(src + "constants.json")),
    }
    json.dump(bank, open(os.path.join(OUT, "bank.json"), "w"))
    open(os.path.join(OUT, "NOTICE"), "w").write(NOTICE)
    files = {}
    for f in sorted(os.listdir(OUT)):
        if f == "manifest.json":
            continue
        b = open(os.path.join(OUT, f), "rb").read()
        files[f] = {"bytes": len(b), "sha256": hashlib.sha256(b).hexdigest()}
    json.dump({"model": "edgetam-video", "source": f"{VIDEO_REPO}@{VIDEO_REV}", "files": files}, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
    for f, v in files.items():
        print(f"{f:28s} {v['bytes'] / 1e6:7.2f} MB")
    print("->", OUT)


if __name__ == "__main__":
    main()
