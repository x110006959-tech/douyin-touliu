import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const localTestMarker = Buffer.from("本地测试", "utf8");
const forbiddenProductionMarkers = ["localhost", "127.0.0.1", "本地测试"];
const productionPermissions = ["activeTab", "storage", "sidePanel"];
const productionHostPermissions = [
  "https://eos.douyin.com/dp/liveScreen*",
  "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2*",
  "https://localads.chengzijianzhan.cn/lamp/pc/promotion/roi2*",
  "https://api.pxxis.cn/*",
  "https://www.pxxis.cn/*"
];
const productionContentScriptMatches = [
  [
    "https://eos.douyin.com/dp/liveScreen*",
    "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2*",
    "https://localads.chengzijianzhan.cn/lamp/pc/promotion/roi2*"
  ],
  ["https://www.pxxis.cn/*"]
];

export const extensionSchemaVersion = "20260720_v032_audit_actor_snapshot";

export async function assertDirectoryArtifact(root, target) {
  assertExtensionArtifact(await readDirectoryArtifact(root), target);
}

export function assertExtensionArtifact(files, target) {
  const manifest = readJsonFile(files, "manifest.json");
  const metadata = readJsonFile(files, "build-metadata.json");
  assertExactArray(manifest.permissions, productionPermissions, "manifest permissions");
  assertNoBroadHostPatterns(manifest);

  if (target === "production") {
    assertExactArray(manifest.host_permissions, productionHostPermissions, "production host permissions");
    assertContentScriptMatches(manifest, productionContentScriptMatches);
    if (metadata.buildTarget !== "production" || metadata.localTestOnly !== false) {
      throw new Error("Production artifact metadata does not identify a production build.");
    }
    for (const [path, content] of Object.entries(files)) {
      const searchableContent = Buffer.from(content).toString("utf8").toLocaleLowerCase();
      for (const marker of forbiddenProductionMarkers) {
        if (searchableContent.includes(marker.toLocaleLowerCase())) {
          throw new Error(`Production artifact contains forbidden marker in ${path}: ${marker}`);
        }
      }
    }
    return;
  }

  if (target !== "local") throw new Error(`Unsupported Extension artifact target: ${target}`);
  if (metadata.buildTarget !== "local" || metadata.localTestOnly !== true) {
    throw new Error("Local artifact metadata does not identify a local test build.");
  }
  if (![manifest.name, manifest.description, manifest.action?.default_title].every((value) => String(value || "").includes("本地测试"))) {
    throw new Error("Local artifact must identify itself as a local test build in user-visible metadata.");
  }
  assertExactArray(
    manifest.host_permissions,
    [...productionHostPermissions, "http://localhost/*", "http://127.0.0.1/*"],
    "local host permissions"
  );
  assertContentScriptMatches(manifest, [
    productionContentScriptMatches[0],
    [...productionContentScriptMatches[1], "http://localhost/*", "http://127.0.0.1/*"]
  ]);
  for (const iconPath of Object.values(manifest.icons || {})) {
    const icon = files[String(iconPath)];
    if (!icon || !Buffer.from(icon).includes(localTestMarker)) {
      throw new Error(`Local test icon is missing its visible build marker: ${iconPath}`);
    }
  }
}

async function readDirectoryArtifact(root) {
  const files = {};
  await visit(root);
  return files;

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        files[relative(root, absolutePath).replaceAll("\\", "/")] = await readFile(absolutePath);
      }
    }
  }
}

function readJsonFile(files, path) {
  const content = files[path];
  if (!content) throw new Error(`Extension artifact is missing ${path}.`);
  try {
    return JSON.parse(Buffer.from(content).toString("utf8"));
  } catch {
    throw new Error(`Extension artifact contains invalid JSON in ${path}.`);
  }
}

function assertExactArray(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must match the reviewed allowlist exactly.`);
  }
}

function assertContentScriptMatches(manifest, expectedMatches) {
  const actualMatches = (manifest.content_scripts || []).map((entry) => entry.matches);
  if (JSON.stringify(actualMatches) !== JSON.stringify(expectedMatches)) {
    throw new Error("Content script routes must match the reviewed allowlist exactly.");
  }
}

function assertNoBroadHostPatterns(manifest) {
  const patterns = [
    ...(manifest.host_permissions || []),
    ...(manifest.content_scripts || []).flatMap((entry) => entry.matches || [])
  ];
  if (patterns.some((pattern) => pattern === "<all_urls>" || pattern.includes("://*.") || pattern.startsWith("*://"))) {
    throw new Error("Extension artifact contains a broad host permission.");
  }
}
