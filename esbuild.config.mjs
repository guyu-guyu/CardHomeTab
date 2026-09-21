import esbuild from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const production = process.argv[2] === "production";
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const outputDirectory = path.join(projectRoot, "dist");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  ["manifest.json", "styles.css"].map((fileName) =>
    copyFile(path.join(projectRoot, fileName), path.join(outputDirectory, fileName)),
  ),
);

const context = await esbuild.context({
  banner: {
    js: "/* CardHomeTab - generated from TypeScript source */",
  },
  bundle: true,
  charset: "utf8",
  entryPoints: [path.join(projectRoot, "src/main.ts")],
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
  ],
  format: "cjs",
  loader: {
    ".css": "text",
  },
  logLevel: "info",
  outfile: path.join(outputDirectory, "main.js"),
  platform: "browser",
  sourcemap: production ? false : "inline",
  target: "es2018",
  treeShaking: true,
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
