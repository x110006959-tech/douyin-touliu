import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { zipSync } from "fflate";

export async function createZipFromDirectory(sourceDirectory, archivePath) {
  const files = {};
  await visit(sourceDirectory);
  const archive = zipSync(files, { level: 9 });
  await writeFile(archivePath, archive);
  return archive;

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        const archivePath = relative(sourceDirectory, absolutePath).replaceAll("\\", "/");
        files[archivePath] = new Uint8Array(await readFile(absolutePath));
      }
    }
  }
}
