// AI subject detection worker (seg-serve.ts) with onnxruntime-web's WebGPU build (WebGPU when the device has it,
// else its WASM provider).
import * as ort from "onnxruntime-web/webgpu";
import { serve } from "./seg-serve.ts";

serve(ort, true);
