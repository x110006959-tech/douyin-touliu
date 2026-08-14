import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const rootPackage = await json("package.json");
if (typeof rootPackage.pxxisMetadata?.schemaVersion !== "string" || !/^\d{8}_[a-z0-9_]+$/.test(rootPackage.pxxisMetadata.schemaVersion)) {
  throw new Error("package.json must define a valid pxxisMetadata.schemaVersion");
}
const packageFiles = [
  "apps/api/package.json",
  "apps/web/package.json",
  "apps/extension/package.json",
  "packages/shared/package.json",
  "packages/llm/package.json",
  "packages/decision-engine/package.json",
  "packages/diagnosis-skills/package.json"
];

const mismatches = [];
for (const file of [".env.example", "docker-compose.yml", "apps/api/Dockerfile"]) {
  const source = await readFile(resolve(root, file), "utf8");
  if (!source.includes(rootPackage.pxxisMetadata.schemaVersion)) {
    mismatches.push(`${file}: missing schema default ${rootPackage.pxxisMetadata.schemaVersion}`);
  }
}
for (const file of packageFiles) {
  const pkg = await json(file);
  if (pkg.version !== rootPackage.version) mismatches.push(`${file}: ${pkg.version}`);
}
const publicManifest = await json("apps/extension/public/manifest.json");
if (publicManifest.version !== "0.0.0") mismatches.push(`public manifest must use generated placeholder 0.0.0, got ${publicManifest.version}`);
const distManifest = await json("apps/extension/dist/manifest.json");
if (distManifest.version !== rootPackage.version) mismatches.push(`extension dist manifest: ${distManifest.version}`);

if (mismatches.length) {
  console.error(`Version consistency check failed for ${rootPackage.version}:\n${mismatches.join("\n")}`);
  process.exit(1);
}
console.log(`Version consistency check passed: ${rootPackage.version}`);

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}
