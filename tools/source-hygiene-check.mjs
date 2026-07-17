import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const roots = ["apps", "packages", "tools", "docs", ".github"];
const ignored = new Set(["node_modules", "dist", ".next", "release"]);
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".yml", ".yaml"]);

async function authoredFiles(relative) {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    if (ignored.has(entry.name)) return [];
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) return authoredFiles(child);
    return extensions.has(path.extname(entry.name)) ? [child] : [];
  }));
  return nested.flat();
}

const failures = [];
for (const file of (await Promise.all(roots.map(authoredFiles))).flat()) {
  const source = await readFile(path.join(root, file), "utf8");
  if (source.length > 0 && !source.endsWith("\n")) failures.push(`${file}: missing final newline`);
  source.split(/\r?\n/).forEach((line, index) => {
    if (/[ \t]+$/.test(line)) failures.push(`${file}:${index + 1}: trailing whitespace`);
  });
}

if (failures.length) {
  console.error(failures.slice(0, 100).map((failure) => `- ${failure}`).join("\n"));
  if (failures.length > 100) console.error(`...and ${failures.length - 100} more`);
  process.exit(1);
}
console.log("Source formatting hygiene verified.");
