import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const activeDocs = [
  "README.md",
  "NOW.md",
  "CURRENT_TASK.md",
  "CODEX_HANDOFF.md",
  "PROJECT_STATE.md",
  "DEPLOYMENT_STATE.md",
  "DECISION_LOG.md",
  "SAFETY_BOUNDARY.md",
  "API_REFERENCE.md",
  "AI_DIAGNOSIS.md",
  "MIGRATION_NOTES.md",
  "ROADMAP.md",
  "ARCHITECTURE.md",
  "CODE_INDEX.md",
  "CODE_OWNERSHIP.md"
];
const requiredSections = {
  "NOW.md": ["## 当前事实", "## 本轮最高优先级", "## 历史入口"],
  "CURRENT_TASK.md": ["## 当前阶段", "## 历史入口"],
  "CODEX_HANDOFF.md": ["## 当前关键事实", "## 历史入口"],
  "PROJECT_STATE.md": ["## 当前状态", "## 历史入口"],
  "DEPLOYMENT_STATE.md": ["## 当前运行态", "## 历史入口"],
  "DECISION_LOG.md": ["## 最近决策", "## 历史入口"],
  "README.md": ["## 读者与用途", "## 归档规则"]
};
const failures = [];

for (const file of activeDocs) {
  const absolute = path.join(root, "docs", file);
  if (!(await exists(absolute))) {
    failures.push(`docs/${file}: missing required document`);
    continue;
  }
  const source = await readFile(absolute, "utf8");
  for (const section of requiredSections[file] ?? []) {
    if (!source.includes(section)) failures.push(`docs/${file}: missing required section ${section}`);
  }
  if (/未部署|尚未部署/.test(source)) failures.push(`docs/${file}: stale deployment wording`);
  await verifyMarkdownLinks(file, source, failures);
}

for (const archive of [
  "docs/archive/NOW.legacy.md",
  "docs/archive/CURRENT_TASK.legacy.md",
  "docs/archive/CODEX_HANDOFF.legacy.md",
  "docs/archive/PROJECT_STATE.legacy.md",
  "docs/archive/DEPLOYMENT_STATE.legacy.md",
  "docs/archive/DECISION_LOG.legacy.md"
]) {
  if (!(await exists(path.join(root, archive)))) failures.push(`${archive}: missing archived history`);
}
if (!(await exists(path.join(root, "docs/archive/acceptance")))) failures.push("docs/archive/acceptance: missing acceptance archive");

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Documentation structure verified.");

async function verifyMarkdownLinks(file, source, failures) {
  const directory = path.dirname(path.join(root, "docs", file));
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1]?.trim();
    if (!target || /^(https?:|mailto:|#)/.test(target)) continue;
    const cleanTarget = target.split("#")[0];
    const absolute = path.resolve(directory, cleanTarget);
    if (!(await exists(absolute))) failures.push(`docs/${file}: broken relative link ${target}`);
  }
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
