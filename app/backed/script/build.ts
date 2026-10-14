import { build } from "esbuild";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

await build({
  entryPoints: [path.join(root, "server/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: path.join(root, "dist/index.cjs"),
  external: ["better-sqlite3"],
  sourcemap: true,
  logLevel: "info",
});

console.log("✅ backend bundled to dist/index.cjs");
