import { readFile, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const releaseDir = resolve(root, "release");
const dist = resolve(root, "dist");

await import("./build.mjs");

const manifest = JSON.parse(await readFile(resolve(dist, "manifest.json"), "utf8"));
const archiveName = `douyin-local-life-diagnosis-collector-v${manifest.version}.zip`;
for (const name of await readdir(releaseDir)) {
  if (/^douyin-local-life-diagnosis-collector-v.*\.zip$/i.test(name)) {
    await rm(resolve(releaseDir, name), { force: true });
  }
}

const archivePath = resolve(releaseDir, archiveName);
const result =
  process.platform === "win32"
    ? spawnSync(
        "powershell.exe",
        ["-NoProfile", "-Command", `Compress-Archive -Path '${dist.replaceAll("'", "''")}\\*' -DestinationPath '${archivePath.replaceAll("'", "''")}' -Force`],
        { stdio: "inherit" }
      )
    : spawnSync("zip", ["-qr", archivePath, "."], { cwd: dist, stdio: "inherit" });

if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Extension archive command exited with status ${result.status}`);
console.log(`Created ${archivePath}`);
