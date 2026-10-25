// Pushes app.config.json (app id, name, version, build number) into the
// native projects. Android reads app.config.json at build time
// (android/app/build.gradle), so only iOS files are rewritten here:
//   ios/App/App.xcodeproj/project.pbxproj  PRODUCT_BUNDLE_IDENTIFIER, MARKETING_VERSION, CURRENT_PROJECT_VERSION
//   ios/App/App/Info.plist                 CFBundleDisplayName, BGTaskSchedulerPermittedIdentifiers
// `--check` exits 1 when a file is out of date (CI runs this).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobile = resolve(here, "..");
const check = process.argv.includes("--check");
const app = JSON.parse(readFileSync(join(mobile, "app.config.json"), "utf8"));
if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(app.appId)) throw new Error(`appId "${app.appId}" is not a valid reverse-DNS id (lower case, works for both stores)`);

const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const edits = [
  {
    file: "ios/App/App.xcodeproj/project.pbxproj",
    apply: (s) => s
      .replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${app.appId};`)
      .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${app.version};`)
      .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${app.build};`),
  },
  {
    file: "ios/App/App/Info.plist",
    apply: (s) => s
      .replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${xml(app.appName)}$2`)
      .replace(/(<key>BGTaskSchedulerPermittedIdentifiers<\/key>\s*<array>\s*<string>)[^<]*(<\/string>)/, `$1${app.appId}.export.*$2`),
  },
];

let stale = 0;
for (const { file, apply } of edits) {
  const path = join(mobile, file);
  const before = readFileSync(path, "utf8");
  const after = apply(before);
  if (after === before) continue;
  stale++;
  if (check) console.error(`out of date: ${file} (run pnpm --filter mobile brand)`);
  else {
    writeFileSync(path, after);
    console.log(`updated ${file}`);
  }
}
if (check && stale) process.exit(1);
if (!stale) console.log(`native projects match app.config.json (${app.appId}, "${app.appName}" ${app.version} (${app.build}))`);
