import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const unpackedRelease = resolve(root, "release/local-unpacked-test-extension");
const entries = ["popup", "content", "injected", "service-worker"];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const messages = stripExports(await readFile(resolve(root, "src/messages.ts"), "utf8"));
const sharedSafety = stripExports(await readFile(resolve(root, "../../packages/shared/src/safety.ts"), "utf8"));
const safety = `${sharedSafety}\n${stripModuleSyntax(await readFile(resolve(root, "src/safety.ts"), "utf8"))}`;

await Promise.all(entries.map((entry) => buildEntry(entry, `${messages}\n${safety}`)));
await cp(resolve(root, "public/manifest.json"), resolve(dist, "manifest.json"));
await cp(resolve(root, "public/icons"), resolve(dist, "icons"), { recursive: true });
const popupHtml = await readFile(resolve(root, "popup.html"), "utf8");
await writeFile(resolve(dist, "popup.html"), popupHtml.replace('/src/popup.ts', 'popup.js'));
await rm(unpackedRelease, { recursive: true, force: true });
await mkdir(unpackedRelease, { recursive: true });
await cp(dist, unpackedRelease, { recursive: true });

async function buildEntry(entry, messagesSource) {
  const file = resolve(root, `src/${entry}.ts`);
  const source = await readFile(file, "utf8");
  const withoutLocalImports = source
    .replace(/import\s+\{\s*MESSAGE\s*,\s*STORAGE\s*\}\s+from\s+"\.\/messages";\s*/g, "")
    .replace(/import\s+\{\s*MESSAGE\s*\}\s+from\s+"\.\/messages";\s*/g, "")
    .replace(/import\s+\{[^}]+\}\s+from\s+"\.\/safety";\s*/g, "");
  const output = ts.transpileModule(`${messagesSource}\n${withoutLocalImports}`, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2020,
      removeComments: false
    },
    fileName: file
  });
  await writeFile(resolve(dist, `${entry}.js`), output.outputText);
}

function stripExports(source) {
  return source.replace(/^export\s+/gm, "");
}

function stripModuleSyntax(source) {
  return stripExports(source)
    .replace(/import\s+\{[\s\S]*?\}\s+from\s+"@douyin-local-life\/shared";\s*/g, "")
    .replace(/\{[\s\S]*?\}\s+from\s+"@douyin-local-life\/shared";\s*/g, "");
}
