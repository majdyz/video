// AI subject detection worker (seg-serve.ts) with onnxruntime-web's plain WASM build, for WebKit (the model runs on
// WASM there): 11 MB of WebAssembly instead of the WebGPU build's 22, whose compiled code is a phone's memory too.
import * as ort from "onnxruntime-web";
import { serve } from "./seg-serve.ts";

serve(ort, false);
