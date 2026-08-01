import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { assertDirectoryArtifact, extensionSchemaVersion } from "./artifact-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const repoRoot = resolve(root, "../..");
const target = readBuildTarget();
const isLocalBuild = target === "local";
const unpackedRelease = resolve(root, `release/${isLocalBuild ? "local-unpacked-test-extension" : "production-unpacked-extension"}`);
const entries = ["popup", "content", "service-worker", "sidepanel", "web-bridge"];
const rootPackage = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8"));
const gitSha = safeGitSha();
const sourceFingerprint = await fingerprintBuildInputs([
  "apps/extension/popup.html",
  "apps/extension/sidepanel.html",
  "apps/extension/public/manifest.json",
  ...[16, 32, 48, 128].flatMap((size) => [
    `apps/extension/public/icons/icon${size}.png`,
    `apps/extension/public/local-test-icons/icon${size}.png`
  ]),
  ...entries.map((entry) => `apps/extension/src/${entry}.ts`),
  "apps/extension/src/bridge-protocol.ts",
  "apps/extension/src/build-target.ts",
  "apps/extension/src/messages.ts",
  "apps/extension/src/page-adapters.ts",
  "apps/extension/src/safety.ts",
  "apps/extension/src/extension-context.ts",
  "apps/extension/scripts/artifact-policy.mjs",
  "packages/shared/src/index.ts",
  "packages/shared/src/collection-routes.ts",
  "packages/shared/src/safety.ts"
]);
const buildTime = new Date().toISOString();
const localDevelopmentHosts = isLocalBuild ? ["localhost", "127.0.0.1"] : [];
const defaultApiBaseUrl = isLocalBuild ? "http://127.0.0.1:4300" : "https://api.pxxis.cn";
const apiBaseUrlGuidance = isLocalBuild
  ? "服务器地址必须使用 HTTPS，本地开发可以使用 localhost。"
  : "服务器地址必须使用 HTTPS。";

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await Promise.all(entries.map((entry) => buildEntry(entry)));
const manifest = JSON.parse(await readFile(resolve(root, "public/manifest.json"), "utf8"));
manifest.version = rootPackage.version;
if (isLocalBuild) {
  manifest.name = `${manifest.name}（本地测试）`;
  manifest.description = "本地测试包：只用于本机开发验收，不得上传 Chrome 网上应用店。";
  manifest.action.default_title = "PXXIS 智能投流采集（本地测试）";
  manifest.host_permissions.push("http://localhost/*", "http://127.0.0.1/*");
  manifest.content_scripts[1].matches.push("http://localhost/*", "http://127.0.0.1/*");
}
await writeFile(resolve(dist, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await cp(resolve(root, `public/${isLocalBuild ? "local-test-icons" : "icons"}`), resolve(dist, "icons"), { recursive: true });
const popupHtml = await readFile(resolve(root, "popup.html"), "utf8");
await writeFile(
  resolve(dist, "popup.html"),
  popupHtml
    .replace('/src/popup.ts', 'popup.js')
    .replace("{{PXXIS_DEFAULT_API_BASE_URL}}", defaultApiBaseUrl)
);
const sidepanelHtml = await readFile(resolve(root, "sidepanel.html"), "utf8");
await writeFile(resolve(dist, "sidepanel.html"), sidepanelHtml.replace('/src/sidepanel.ts', 'sidepanel.js'));
await writeFile(resolve(dist, "build-metadata.json"), `${JSON.stringify({
  productVersion: rootPackage.version,
  gitSha,
  buildTime,
  schemaVersion: extensionSchemaVersion,
  extensionVersion: rootPackage.version,
  sourceFingerprint,
  buildTarget: target,
  localTestOnly: isLocalBuild
}, null, 2)}\n`);
await assertDirectoryArtifact(dist, target);
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
    logLevel: "silent",
    define: {
      __PXXIS_EXTENSION_BUILD__: JSON.stringify(sourceFingerprint),
      __PXXIS_EXTENSION_TARGET__: JSON.stringify(target),
      __PXXIS_EXTENSION_LOCAL_DEVELOPMENT_HOSTS__: JSON.stringify(localDevelopmentHosts),
      __PXXIS_EXTENSION_DEFAULT_API_BASE_URL__: JSON.stringify(defaultApiBaseUrl),
      __PXXIS_EXTENSION_LOCAL_WEB_PORT__: JSON.stringify(isLocalBuild ? 3300 : 0),
      __PXXIS_EXTENSION_API_BASE_URL_GUIDANCE__: JSON.stringify(apiBaseUrlGuidance)
    }
  });
}

async function fingerprintBuildInputs(paths) {
  const hash = createHash("sha256");
  for (const path of paths.sort()) {
    hash.update(path);
    hash.update("\0");
    hash.update(await readFile(resolve(repoRoot, path)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

function safeGitSha() {
  try {
    return process.env.GIT_SHA || execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function readBuildTarget() {
  const argument = process.argv.find((value) => value.startsWith("--target="));
  const value = (argument?.split("=", 2)[1] || process.env.PXXIS_EXTENSION_BUILD_TARGET || "local").toLowerCase();
  if (value !== "local" && value !== "production") {
    throw new Error("Extension build target must be local or production.");
  }
  return value;
}
