import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";

const root = resolve(import.meta.dirname, "..");
const guardedFiles = [
  "src/content.ts",
  "src/injected.ts",
  "src/service-worker.ts",
  "release/local-unpacked-test-extension/content.js",
  "release/local-unpacked-test-extension/injected.js",
  "release/local-unpacked-test-extension/service-worker.js"
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
    ];

    for (const file of guardedFiles) {
      const source = readFileSync(resolve(root, file), "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(source, `${file} should not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("keeps network capture opt-in and preserves the native XHR constructor", () => {
    for (const file of ["src/injected.ts", "release/local-unpacked-test-extension/injected.js"]) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source).toContain("captureEnabled = false");
      expect(source).toContain("window.XMLHttpRequest.prototype");
      expect(source).not.toMatch(/window\.XMLHttpRequest\s*=/);
    }
  });

  it("keeps the tracked unpacked release on the current manifest version", () => {
    const sourceManifest = JSON.parse(readFileSync(resolve(root, "public/manifest.json"), "utf8"));
    const releaseManifest = JSON.parse(readFileSync(resolve(root, "release/local-unpacked-test-extension/manifest.json"), "utf8"));
    expect(releaseManifest.version).toBe(sourceManifest.version);
  });

  it("ships exactly one safe ZIP matching the current manifest", () => {
    const sourceManifest = JSON.parse(readFileSync(resolve(root, "public/manifest.json"), "utf8"));
    const archives = readdirSync(resolve(root, "release")).filter((name) => /^douyin-local-life-diagnosis-collector-v.*\.zip$/i.test(name));
    expect(archives).toEqual([`douyin-local-life-diagnosis-collector-v${sourceManifest.version}.zip`]);

    const files = unzipSync(readFileSync(resolve(root, "release", archives[0]!)));
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!));
    const injected = strFromU8(files["injected.js"]!);
    expect(manifest.version).toBe(sourceManifest.version);
    expect(injected).toContain("captureEnabled = false");
    expect(injected).toContain("window.XMLHttpRequest.prototype");
    expect(injected).not.toMatch(/window\.XMLHttpRequest\s*=/);
  });
});
