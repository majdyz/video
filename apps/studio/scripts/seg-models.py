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
      memory_attention, memory_encoder: their big row-local blocks run in 8 row chunks (chunk_rows; the same
      numbers): the WASM heap of a pass peaked at ~330 MB on the 4096 x 4096 score matrices.
  bank.json      no_memory_embedding (256), memory_temporal_positional_encoding (7 x 64), graph constants
  manifest.json  file sizes + sha256 (the app's cache key)
  NOTICE         licence notice shipped beside the weights

The Vite build copies this folder into dist/seg/ (vite.config.ts studioSegModels); nothing here is committed.
Run with a Python that has onnx, numpy, safetensors (e.g. ~/.venvs/video/bin/python).
  --only memory_attention   rebuild only the named graphs (comma-separated) in an existing folder; other files
                            (vision_encoder_lite.onnx) and the manifest's notes are kept
"""
import glob, hashlib, json, os, re, sys
import numpy as np, onnx
from onnx import helper, numpy_helper, TensorProto

VIDEO_REPO, VIDEO_REV = "jax-image-tools/edgetam-video-onnx", "8ca3d3e4169938e65b552cdf14542fde25e8badb"
CKPT_REPO = "yonigozlan/EdgeTAM-hf"
GRAPHS = ["vision_encoder", "mask_decoder", "memory_attention", "memory_encoder"]
HF_HOME = os.environ.get("HF_HOME", os.path.expanduser("~/video-data/models/hf"))
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
ONLY = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
if ONLY:
    ARGS = [a for a in ARGS if a != ",".join(ONLY)]
OUT = ARGS[0] if ARGS else os.environ.get("SEG_MODELS_DIR", os.path.expanduser("~/video-data/models/edgetam-web"))

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


def chunk_rows(model, blocks, chunks=8, rows=4096, name=""):
    """Row-local blocks of a graph run over `chunks` row blocks (axis -2, `rows` long) and are concatenated after:
    the same numbers, but their big activations never exist whole. ONNX Runtime Web's WASM heap only grows, so a
    graph's peak is what a phone keeps for the rest of the pass. `blocks`:
    (start node name pattern, its end's name by re.sub); a block is every node on a path from the start to its end,
    the start's first input is the one split."""
    g = model.graph
    prod = {o: n for n in g.node for o in n.output}
    cons = {}
    for n in g.node:
        for i in n.input:
            cons.setdefault(i, []).append(n)
    byname = {n.name: n for n in g.node}
    found = []
    for n in g.node:
        for sp, er in blocks:
            if not re.search(sp, n.name):
                continue
            end = byname[re.sub(sp, er, n.name)]
            desc, todo = set(), [n]
            while todo:
                x = todo.pop()
                for o in x.output:
                    for c in cons.get(o, []):
                        if id(c) not in desc:
                            desc.add(id(c))
                            todo.append(c)
            anc, todo = set(), [end]
            while todo:
                x = todo.pop()
                for i in x.input:
                    q = prod.get(i)
                    if q is not None and id(q) not in anc:
                        anc.add(id(q))
                        todo.append(q)
            body = (desc & anc) | {id(n), id(end)}
            inner = {o for x in g.node if id(x) in body and x is not end for o in x.output}
            for o in inner:
                assert all(id(c) in body for c in cons[o]), f"{o} leaves the block"
            found.append((n, end, [x for x in g.node if id(x) in body]))
    split = numpy_helper.from_array(np.full(chunks, rows // chunks, np.int64), f"rowchunk_split_{rows}")
    g.initializer.append(split)
    drop, add = set(), {}
    for start, end, body in found:
        tag = start.name + "__chunk"
        parts = [f"{tag}_x{k}" for k in range(chunks)]
        new = [helper.make_node("Split", [start.input[0], split.name], parts, axis=-2, name=tag + "_split")]
        outs = []
        for k in range(chunks):
            ren = {start.input[0]: parts[k]}
            for x in body:
                for o in x.output:
                    ren[o] = f"{o}__c{k}"
                ins = [ren.get(i, i) if (x is not start or j == 0) else i for j, i in enumerate(x.input)]
                attrs = {a.name: helper.get_attribute_value(a) for a in x.attribute}
                new.append(helper.make_node(x.op_type, ins, [ren[o] for o in x.output], name=f"{x.name}__c{k}", **attrs))
            outs.append(ren[end.output[0]])
        new.append(helper.make_node("Concat", outs, [end.output[0]], axis=-2, name=tag + "_concat"))
        drop.update(id(x) for x in body)
        add[id(end)] = new  # at the block's end: every input it reads exists by then
    nodes = []
    for n in g.node:
        if id(n) in add:
            nodes.extend(add[id(n)])
        elif id(n) not in drop:
            nodes.append(n)
    del g.node[:]
    g.node.extend(nodes)
    print(f"{name}: {len(found)} blocks in {chunks} row chunks")
    return model


# memory_attention: each attention (MatMul(Q, Kt) -> Softmax -> MatMul(P, V)) and MLP over 8 blocks of its 4096
# queries (softmax is per row: the same result); the 4096 x 4096 score matrices (64 MB each, two alive at once) and
# the 4096 x 2048 MLP activations were the pass's peak (WASM heap ~330 MB, ~145 MB chunked).
# memory_encoder: the fuser's pointwise MLPs (64 x 64 x 1024 activations, GELU spelled out) over 8 column blocks.
CHUNKS = {
    "memory_attention": dict(blocks=[(r"/self_attn/MatMul$", "/self_attn/MatMul_1"), (r"/cross_attn_image/MatMul$", "/cross_attn_image/MatMul_1"),
                                     (r"/mlp/up_proj/MatMul$", "/mlp/down_proj/Add")], rows=4096),
    "memory_encoder": dict(blocks=[(r"/pointwise_conv1/MatMul$", "/pointwise_conv2/Add")], rows=64),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    src = snapshot(VIDEO_REPO, VIDEO_REV)
    for name in ONLY or GRAPHS:
        m = fp16_storage(onnx.load(src + name + ".onnx"))
        if name in CHUNKS:
            m = chunk_rows(m, name=name, **CHUNKS[name])
        onnx.checker.check_model(m)
        onnx.save(m, os.path.join(OUT, name + ".onnx"))
    if ONLY:
        write_manifest()
        return
    from safetensors import safe_open
    ck = safe_open(glob.glob(snapshot(CKPT_REPO) + "model.safetensors")[0], "np")
    bank = {
        "no_memory_embedding": ck.get_tensor("no_memory_embedding").reshape(-1).astype(float).tolist(),
        "memory_temporal_positional_encoding": ck.get_tensor("memory_temporal_positional_encoding").reshape(7, 64).astype(float).tolist(),
        "constants": json.load(open(src + "constants.json")),
    }
    json.dump(bank, open(os.path.join(OUT, "bank.json"), "w"))
    open(os.path.join(OUT, "NOTICE"), "w").write(NOTICE)
    write_manifest()


def write_manifest():
    path = os.path.join(OUT, "manifest.json")
    notes = json.load(open(path)).get("notes") if os.path.exists(path) else None
    files = {}
    for f in sorted(os.listdir(OUT)):
        if f == "manifest.json":
            continue
        b = open(os.path.join(OUT, f), "rb").read()
        files[f] = {"bytes": len(b), "sha256": hashlib.sha256(b).hexdigest()}
    json.dump({"model": "edgetam-video", "source": f"{VIDEO_REPO}@{VIDEO_REV}", "files": files, **({"notes": notes} if notes else {})}, open(path, "w"), indent=1)
    for f, v in files.items():
        print(f"{f:28s} {v['bytes'] / 1e6:7.2f} MB")
    print("->", OUT)


if __name__ == "__main__":
    main()
