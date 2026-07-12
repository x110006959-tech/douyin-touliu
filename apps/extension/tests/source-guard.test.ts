import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";

const root = resolve(import.meta.dirname, "..");
const guardedFiles = [
  "src/content.ts",
  "src/service-worker.ts",
  "src/sidepanel.ts",
  "release/local-unpacked-test-extension/content.js",
  "release/local-unpacked-test-extension/service-worker.js",
  "release/local-unpacked-test-extension/sidepanel.js"
];

describe("extension source safety guard", () => {
  it("does not contain automatic platform operation calls", () => {
    const forbiddenPatterns = [
      /\.click\s*\(/,
      /\.submit\s*\(/,
      /requestSubmit\s*\(/,
      /chrome\.cookies/,
      /chrome\.history/,
      /chrome\.bookmarks/,
      /chrome\.downloads/
      ,/chrome\.tabs\.(create|update|remove)/
      ,/window\.location\s*=/
    ];

    for (const file of guardedFiles) {
      const source = readFileSync(resolve(root, file), "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(source, `${file} should not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("keeps fixed-page patrol user-controlled with only the approved side panel permission", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "public/manifest.json"), "utf8"));
    expect(manifest.permissions).toEqual(["activeTab", "storage", "sidePanel"]);
    const worker = readFileSync(resolve(root, "src/service-worker.ts"), "utf8");
    const content = readFileSync(resolve(root, "src/content.ts"), "utf8");
    expect(worker).toContain("START_PATROL");
    expect(worker).toContain("STOP_PATROL");
    expect(content).toContain("patrol.enabled");
    expect(worker).not.toMatch(/chrome\.tabs\.(create|update)/);
  });

  it("removes all production network interception code", () => {
    expect(existsSync(resolve(root, "src/injected.ts"))).toBe(false);
    expect(existsSync(resolve(root, "dist/injected.js"))).toBe(false);
    expect(existsSync(resolve(root, "release/local-unpacked-test-extension/injected.js"))).toBe(false);
    const manifest = JSON.parse(readFileSync(resolve(root, "release/local-unpacked-test-extension/manifest.json"), "utf8"));
    expect(manifest.web_accessible_resources).toBeUndefined();
    for (const file of guardedFiles) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source).not.toMatch(/window\.fetch\s*=/);
      expect(source).not.toContain("XMLHttpRequest");
      expect(source).not.toContain("PAGE_NETWORK_CAPTURED");
    }
  });

  it("keeps the tracked unpacked release on the current manifest version", () => {
    const rootPackage = JSON.parse(readFileSync(resolve(root, "../../package.json"), "utf8"));
    const releaseManifest = JSON.parse(readFileSync(resolve(root, "release/local-unpacked-test-extension/manifest.json"), "utf8"));
    expect(releaseManifest.version).toBe(rootPackage.version);
  });

  it("validates a generated v0.2.1 ZIP when the release artifact is present", () => {
    const rootPackage = JSON.parse(readFileSync(resolve(root, "../../package.json"), "utf8"));
    const archives = readdirSync(resolve(root, "release")).filter((name) => /^collector-v.*\.zip$/i.test(name));
    if (!archives.length) return;
    expect(archives).toHaveLength(1);
    expect(archives[0]).toMatch(new RegExp(`^collector-v${rootPackage.version}-[a-f0-9]{7,12}\\.zip$`));
    const files = unzipSync(readFileSync(resolve(root, "release", archives[0]!)));
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!));
    expect(manifest.version).toBe(rootPackage.version);
    expect(files["injected.js"]).toBeUndefined();
    expect(strFromU8(files["content.js"]!)).not.toMatch(/window\.fetch\s*=|XMLHttpRequest|PAGE_NETWORK_CAPTURED/);
  });
});
