import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { createZipFromDirectory } from "../scripts/archive.mjs";

describe("Extension archive", () => {
  it("uses portable forward-slash paths for nested files", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "pxxis-extension-archive-"));
    const source = join(fixture, "source");
    const archivePath = join(fixture, "extension.zip");

    try {
      await mkdir(join(source, "icons"), { recursive: true });
      await writeFile(join(source, "manifest.json"), "{}\n");
      await writeFile(join(source, "icons", "icon16.png"), "local-test-icon");

      await createZipFromDirectory(source, archivePath);
      const files = unzipSync(await readFile(archivePath));

      expect(Object.keys(files).sort()).toEqual(["icons/icon16.png", "manifest.json"]);
      expect(Object.keys(files).every((path) => !path.includes("\\"))).toBe(true);
      expect(strFromU8(files["icons/icon16.png"])).toBe("local-test-icon");
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
});
