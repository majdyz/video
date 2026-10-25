// Lets Node's type stripping run sources written for Vite (extensionless
// relative imports, e.g. apps/dewarp/src): `node --import ./ts-resolve.mjs …`.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try {
    return await next(spec, ctx);
  } catch (e) {
    if ((spec.startsWith("./") || spec.startsWith("../")) && !/\\.[cm]?[jt]sx?$/.test(spec)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        try { return await next(spec + ext, ctx); } catch {}
      }
    }
    throw e;
  }
}`),
);
