import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extensionCollectionProtocolVersion, type BuildMetadata } from "@douyin-local-life/shared";

const repoRoot = resolve(import.meta.dirname, "../../..");
const rootPackage = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as {
  version: string;
  pxxisMetadata: { schemaVersion: string };
};
const processStartedAt = new Date().toISOString();

export function getBuildMetadata(): BuildMetadata {
  return {
    productVersion: rootPackage.version,
    gitSha: process.env.GIT_SHA || readGitSha(),
    buildTime: process.env.BUILD_TIME || processStartedAt,
    schemaVersion: process.env.SCHEMA_VERSION || rootPackage.pxxisMetadata.schemaVersion,
    extensionVersion: rootPackage.version,
    collectionProtocolVersion: extensionCollectionProtocolVersion,
    artifactSha256: process.env.EXTENSION_ARTIFACT_SHA256 || null
  };
}

function readGitSha() {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
