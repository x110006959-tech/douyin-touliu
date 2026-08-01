import { createHash } from "node:crypto";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
import { createZipFromDirectory } from "./archive.mjs";
import { assertExtensionArtifact } from "./artifact-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const releaseDir = resolve(root, "release");
const dist = resolve(root, "dist");
const repoRoot = resolve(root, "../..");

const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: repoRoot, encoding: "utf8" }).trim();
if (dirty && process.env.ALLOW_DIRTY_RELEASE !== "1") {
  throw new Error("Release requires a clean Git worktree. Commit and verify source changes first.");
}

process.argv.push("--target=production");
await import("./build.mjs");

const manifest = JSON.parse(await readFile(resolve(dist, "manifest.json"), "utf8"));
const metadata = JSON.parse(await readFile(resolve(dist, "build-metadata.json"), "utf8"));
if (metadata.buildTarget !== "production" || metadata.localTestOnly) {
  throw new Error("Release archive must be built from the production extension target.");
}
const archiveName = `collector-v${manifest.version}-${metadata.gitSha}.zip`;
for (const name of await readdir(releaseDir)) {
  if (/^(?:douyin-local-life-diagnosis-collector|collector)-v.*\.zip(?:\.sha256)?$/i.test(name)) {
    await rm(resolve(releaseDir, name), { force: true });
  }
}

const archivePath = resolve(releaseDir, archiveName);
const archive = await createZipFromDirectory(dist, archivePath);
assertExtensionArtifact(unzipSync(archive), "production");
const sha256 = createHash("sha256").update(archive).digest("hex");
await writeFile(resolve(releaseDir, "release-manifest.json"), `${JSON.stringify({ ...metadata, artifact: archiveName, sha256 }, null, 2)}\n`);
await writeFile(`${archivePath}.sha256`, `${sha256}  ${archiveName}\n`);
console.log(`Created ${archivePath}`);
