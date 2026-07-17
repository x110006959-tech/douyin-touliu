import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const lineBudgets = new Map([
  ["apps/api/src/server.ts", 1_950],
  ["packages/shared/src/index.ts", 1_650],
  ["packages/decision-engine/src/index.ts", 1_300],
  ["apps/web/src/app/tasks/[id]/page.tsx", 850]
]);
const requiredSeams = new Map([
  ["apps/api/src/server.ts", "./routes/snapshot-accounts.js"],
  ["packages/decision-engine/src/index.ts", "./table-analysis.js"],
  ["apps/web/src/app/tasks/[id]/page.tsx", "./use-task-data"]
]);
const failures = [];

for (const [file, limit] of lineBudgets) {
  const source = await readFile(path.join(root, file), "utf8");
  const lines = source.split(/\r?\n/).length;
  if (lines > limit) failures.push(`${file} has ${lines} lines; budget is ${limit}. Extract a domain module instead of extending the entry file.`);
}
for (const [file, requiredImport] of requiredSeams) {
  const source = await readFile(path.join(root, file), "utf8");
  if (!source.includes(requiredImport)) failures.push(`${file} must keep the module seam ${requiredImport}.`);
}

async function sourceFiles(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const relative = path.posix.join(directory.replaceAll("\\", "/"), entry.name);
    return entry.isDirectory() ? sourceFiles(relative) : /\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [relative] : [];
  }));
  return nested.flat();
}
for (const file of await sourceFiles("packages")) {
  const source = await readFile(path.join(root, file), "utf8");
  if (/from\s+["'](?:\.\.\/)+apps\//.test(source)) failures.push(`${file} imports an app layer; packages must remain app-independent.`);
}
if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Architecture boundaries verified.");
