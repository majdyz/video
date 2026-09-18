import { execSync } from "node:child_process";
import { defineConfig } from "vite";

const build = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
})();

export default defineConfig({
  base: "/video/dewarp/",
  build: { target: "es2023" },
  define: { __BUILD__: JSON.stringify(build) },
});
