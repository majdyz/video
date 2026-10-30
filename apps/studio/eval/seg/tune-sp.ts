// Imported first by tune.ts: `?sp={...}` overrides SUBJECT_POP (and `?sc={...}` SUBJECT_CLEAR) before the shaders
// bake their constants (an ablation or a candidate tuning without a rebuild).
import { SUBJECT_CLEAR, SUBJECT_POP } from "../../../aqua-fix/src/engine/params.ts";

const q = new URLSearchParams(location.search);
const sp = q.get("sp"), sc = q.get("sc");
if (sp) Object.assign(SUBJECT_POP, JSON.parse(sp));
if (sc) Object.assign(SUBJECT_CLEAR, JSON.parse(sc));
