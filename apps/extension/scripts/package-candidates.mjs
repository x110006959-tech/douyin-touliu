import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
import { createZipFromDirectory } from "./archive.mjs";
import { assertExtensionArtifact } from "./artifact-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const releaseDir = resolve(root, "release");
const rootPackage = JSON.parse(await readFile(resolve(root, "../../package.json"), "utf8"));

for (const name of await readdir(releaseDir)) {
  if (/^collector-(?:local-test|production-candidate)-v.*\.zip(?:\.sha256)?$/i.test(name)) {
    await rm(resolve(releaseDir, name), { force: true });
  }
}

const results = [];
for (const target of ["production", "local"]) {
  execFileSync(process.execPath, [resolve(root, "scripts/build.mjs"), `--target=${target}`], {
    cwd: root,
    stdio: "inherit"
  });
  const directoryName = target === "local" ? "local-unpacked-test-extension" : "production-unpacked-extension";
  const directory = resolve(releaseDir, directoryName);
  const metadata = JSON.parse(await readFile(resolve(directory, "build-metadata.json"), "utf8"));
  const archiveName = target === "local"
    ? `collector-local-test-v${rootPackage.version}-${metadata.sourceFingerprint}.zip`
    : `collector-production-candidate-v${rootPackage.version}-${metadata.sourceFingerprint}.zip`;
  const archive = await createZipFromDirectory(directory, resolve(releaseDir, archiveName));
  assertExtensionArtifact(unzipSync(archive), target);
  const sha256 = createHash("sha256").update(archive).digest("hex");
  await writeFile(resolve(releaseDir, `${archiveName}.sha256`), `${sha256}  ${archiveName}\n`);
  results.push({ target, archive: archiveName, sha256, sourceFingerprint: metadata.sourceFingerprint });
}

console.log(JSON.stringify(results, null, 2));
