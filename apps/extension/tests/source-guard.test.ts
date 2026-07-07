import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const guardedFiles = ["src/content.ts", "src/injected.ts", "src/service-worker.ts"];

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
});
