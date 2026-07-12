import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const unpackedRelease = resolve(root, "release/local-unpacked-test-extension");
const repoRoot = resolve(root, "../..");
const entries = ["popup", "content", "service-worker", "sidepanel"];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await Promise.all(entries.map((entry) => buildEntry(entry)));
const rootPackage = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(resolve(root, "public/manifest.json"), "utf8"));
manifest.version = rootPackage.version;
await writeFile(resolve(dist, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await cp(resolve(root, "public/icons"), resolve(dist, "icons"), { recursive: true });
const popupHtml = await readFile(resolve(root, "popup.html"), "utf8");
await writeFile(resolve(dist, "popup.html"), popupHtml.replace('/src/popup.ts', 'popup.js'));
const sidepanelHtml = await readFile(resolve(root, "sidepanel.html"), "utf8");
await writeFile(resolve(dist, "sidepanel.html"), sidepanelHtml.replace('/src/sidepanel.ts', 'sidepanel.js'));
const gitSha = safeGitSha();
await writeFile(resolve(dist, "build-metadata.json"), `${JSON.stringify({
  productVersion: rootPackage.version,
  gitSha,
  buildTime: new Date().toISOString(),
  schemaVersion: "20260712_v021_realtime_safety",
  extensionVersion: rootPackage.version
}, null, 2)}\n`);
await rm(unpackedRelease, { recursive: true, force: true });
await mkdir(unpackedRelease, { recursive: true });
await cp(dist, unpackedRelease, { recursive: true });

async function buildEntry(entry) {
  const file = resolve(root, `src/${entry}.ts`);
  await build({
    entryPoints: [file],
    outfile: resolve(dist, `${entry}.js`),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    treeShaking: true,
    minify: false,
    sourcemap: false,
    legalComments: "none",
    logLevel: "silent"
  });
}

function safeGitSha() {
  try {
    return process.env.GIT_SHA || execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
