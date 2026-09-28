import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const codeRoots = [
  "apps/api/src",
  "apps/web/src",
  "apps/extension/src",
  "packages/shared/src",
  "packages/llm/src",
  "packages/decision-engine/src",
  "packages/diagnosis-skills/src",
  "prisma",
  "tools",
  "scripts"
];
const ignoredDirectories = new Set(["node_modules", "dist", ".next", "release", "coverage"]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".prisma", ".sql", ".ps1", ".sh"]);

const domainOrder = [
  "authAndCredits",
  "captureAndEvidence",
  "reviewAndCalibration",
  "decisionOrchestration",
  "aiWorker",
  "projectHistory",
  "webDisplay",
  "extensionCapture",
  "dataAndInfrastructure"
];
const domainOwners = {
  authAndCredits: "服务端 - 认证与积分",
  captureAndEvidence: "服务端 - 采集与证据",
  reviewAndCalibration: "服务端 - 复核校准",
  decisionOrchestration: "服务端 - 决策编排",
  aiWorker: "服务端 - AI Worker",
  projectHistory: "服务端 - 项目历史",
  webDisplay: "Web - 展示",
  extensionCapture: "Extension - 插件采集",
  dataAndInfrastructure: "工程 - 数据与基础设施"
};

export async function computeCodeIndex() {
  const files = [];
  for (const rootPath of codeRoots) {
    const absolute = path.join(root, rootPath);
    try {
      await collectFiles(absolute, rootPath.replaceAll("\\", "/"), files);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  files.sort((a, b) => a.relative.localeCompare(b.relative));

  const modules = [];
  for (const file of files) {
    const source = await readFile(file.absolute, "utf8");
    const domain = classifyDomain(file.relative);
    const localDeps = extractLocalDependencies(source, file.relative);
    modules.push({
      path: file.relative,
      domain,
      owner: domainOwners[domain],
      exports: extractExports(source),
      localDeps,
      externalDeps: extractExternalDependencies(source)
    });
  }

  const manifest = {
    generatedAt: new Date(0).toISOString(),
    roots: codeRoots,
    modules: modules.map(({ path, domain, owner, exports, localDeps }) => ({
      path,
      domain,
      owner,
      exports,
      localDeps
    }))
  };

  return {
    modules,
    manifest,
    codeIndexMarkdown: renderCodeIndex(modules),
    architectureMarkdown: renderArchitecture(modules),
    ownershipMarkdown: renderOwnership(modules)
  };
}

export async function writeCodeIndex() {
  const index = await computeCodeIndex();
  const docsDirectory = path.join(root, "docs");
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(path.join(docsDirectory, "CODE_INDEX.md"), index.codeIndexMarkdown, "utf8");
  await writeFile(path.join(docsDirectory, "ARCHITECTURE.md"), index.architectureMarkdown, "utf8");
  await writeFile(path.join(docsDirectory, "CODE_OWNERSHIP.md"), index.ownershipMarkdown, "utf8");
  await writeFile(path.join(docsDirectory, ".code-index-manifest.json"), `${JSON.stringify(index.manifest, null, 2)}\n`, "utf8");
  console.log("Code index generated: CODE_INDEX.md, ARCHITECTURE.md, CODE_OWNERSHIP.md");
}

async function collectFiles(absolute, relativeRoot, output) {
  const entries = await readdir(absolute, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const childAbsolute = path.join(absolute, entry.name);
    const childRelative = path.posix.join(relativeRoot, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(childAbsolute, childRelative, output);
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      output.push({ absolute: childAbsolute, relative: childRelative });
    }
  }
}

function classifyDomain(relative) {
  const normalized = relative.replaceAll("\\", "/");
  if (normalized.startsWith("apps/web/")) return "webDisplay";
  if (normalized.startsWith("apps/extension/")) return "extensionCapture";
  if (normalized.startsWith("prisma/") || normalized.startsWith("tools/") || normalized.startsWith("scripts/")) {
    return "dataAndInfrastructure";
  }
  if (/auth|credits|csrf|session|email-verification|ownership|rate-limit|persisted-input/i.test(normalized)) {
    return "authAndCredits";
  }
  if (/project-history/i.test(normalized)) return "projectHistory";
  if (/ai-diagnosis|worker-orphan|synthetic-evaluation|diagnosis-eval|diagnosis-skills|worker|evaluation/i.test(normalized)) {
    return "aiWorker";
  }
  if (/review-metric|table-cell|metric-validation|capture-summary|calibration/i.test(normalized)) {
    return "reviewAndCalibration";
  }
  if (/decision|proposal|action-proposals|route|realtime-decision|realtime-signal/i.test(normalized)) {
    return "decisionOrchestration";
  }
  if (/snapshot|normalize|capture|metric|evidence|internal-api|collection|live-screen|local-promotion|source/i.test(normalized)) {
    return "captureAndEvidence";
  }
  return "decisionOrchestration";
}

function extractExports(source) {
  const names = new Set();
  const single = /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of source.matchAll(single)) names.add(match[1]);
  const braces = /export\s+(?:type\s+)?\{([^}]+)\}/g;
  for (const match of source.matchAll(braces)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  const defaultMatch = /export\s+default\s+(?:async\s+)?(?:function|class)?\s*([A-Za-z_$][\w$]*)?/.exec(source);
  if (defaultMatch?.[1]) names.add(defaultMatch[1]);
  return [...names].sort().slice(0, 12);
}

function extractLocalDependencies(source, currentFile) {
  const currentDirectory = path.posix.dirname(currentFile);
  const dependencies = new Set();
  for (const specifier of extractImportSpecifiers(source)) {
    if (specifier.startsWith(".")) {
      const resolved = path.posix.normalize(path.posix.join(currentDirectory, specifier));
      dependencies.add(resolved);
    } else if (specifier.startsWith("@douyin-local-life/")) {
      dependencies.add(specifier);
    }
  }
  return [...dependencies].sort().slice(0, 10);
}

function extractExternalDependencies(source) {
  const dependencies = new Set();
  for (const specifier of extractImportSpecifiers(source)) {
    if (!specifier.startsWith(".") && !specifier.startsWith("@douyin-local-life/")) {
      const scope = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
      dependencies.add(scope);
    }
  }
  return [...dependencies].sort().slice(0, 10);
}

function extractImportSpecifiers(source) {
  const specifiers = new Set();
  for (const line of source.split(/\r?\n/)) {
    const fromMatches = [...line.matchAll(/\bfrom\s+["']([^"']+)["']/g)];
    for (const match of fromMatches) specifiers.add(match[1]);
    const importMatches = [...line.matchAll(/\bimport\s+["']([^"']+)["']/g)];
    for (const match of importMatches) specifiers.add(match[1]);
    const requireMatches = [...line.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)];
    for (const match of requireMatches) specifiers.add(match[1]);
  }
  return specifiers;
}

function renderCodeIndex(modules) {
  const lines = [
    "# 代码索引",
    "",
    "> 由 `tools/build-code-index.mjs` 确定性生成。修改代码后运行 `pnpm code:index` 保持本文件、`ARCHITECTURE.md` 和 `CODE_OWNERSHIP.md` 与源码一致。",
    "",
    "## 业务域",
    ""
  ];
  for (const domain of domainOrder) {
    const domainModules = modules.filter((module) => module.domain === domain);
    if (!domainModules.length) continue;
    lines.push(`### ${domainOwners[domain]}`, "", "| 模块 | 主要导出 | 依赖方向 | 负责人 |", "| --- | --- | --- | --- |");
    for (const module of domainModules) {
      lines.push(`| \`${module.path}\` | ${formatList(module.exports)} | ${formatList(module.localDeps)} | ${module.owner} |`);
    }
    lines.push("");
  }
  lines.push("## 使用说明", "", "1. 查找业务入口时先按业务域定位。", "2. 新模块应落在单一业务域，不得把多个域塞进同一超大文件。", "3. 涉及跨包依赖时先看 `ARCHITECTURE.md` 的禁止边界。", "");
  return `${lines.join("\n")}`;
}

function renderArchitecture(modules) {
  const counts = Object.fromEntries(domainOrder.map((domain) => [domain, modules.filter((module) => module.domain === domain).length]));
  const lines = [
    "# Architecture",
    "",
    "> 由 `tools/build-code-index.mjs` 确定性生成，和 `CODE_INDEX.md`、`CODE_OWNERSHIP.md` 共用同一份源码扫描结果。",
    "",
    "## 分层",
    "",
    "```text",
    "apps/web                 展示与用户交互",
    "apps/extension           浏览器采集与 Bridge",
    "apps/api                 认证、证据、复核、决策编排、Worker",
    "packages/shared          跨端类型与共享契约",
    "packages/llm             LLM Provider 与结构化输出",
    "packages/decision-engine 规则引擎与审批护栏",
    "packages/diagnosis-skills 领域 Skill 注册与评测案例",
    "prisma                   PostgreSQL Schema 与 migration",
    "```",
    "",
    "## 调用方向",
    "",
    "- `apps/*` 可以依赖 `packages/*`。",
    "- `packages/*` 不得依赖任何 `apps/*`。",
    "- `apps/web` 不得直接依赖 `apps/api` 或 `apps/extension`。",
    "- API 是服务端可信边界；浏览器和前端输入只进入 API 后在服务端验证。",
    "",
    "## 模块数量",
    ""
  ];
  for (const domain of domainOrder) {
    lines.push(`- ${domainOwners[domain]}：${counts[domain] ?? 0}`);
  }
  lines.push("", "## 禁止边界", "", "- 插件不执行平台点击、改预算、暂停、创建计划、提交表单、绕过验证码或模拟人工操作。", "- AI 只负责解释、总结、建议、复盘；安全、预算、审批和权限由服务端确定性代码控制。", "- 测试文件不得被生产模块引用。", "- 生成索引、归档和发布产物不得进入代码依赖方向。", "");
  return lines.join("\n");
}

function renderOwnership(modules) {
  const lines = [
    "# 代码所有权",
    "",
    "> 由 `tools/build-code-index.mjs` 确定性生成。所有权表示业务域和负责层级，不替代具体人员的维护责任。",
    "",
    "| 业务域 | 负责层级 | 文件数 | 入口示例 |",
    "| --- | --- | --- | --- |"
  ];
  for (const domain of domainOrder) {
    const domainModules = modules.filter((module) => module.domain === domain);
    if (!domainModules.length) continue;
    const entry = domainModules
      .filter((module) => !module.path.includes(".test."))
      .sort((a, b) => a.path.length - b.path.length)[0]?.path;
    lines.push(`| ${domainOwners[domain]} | ${ownershipLayer(domain)} | ${domainModules.length} | \`${entry ?? "-"}\` |`);
  }
  lines.push("", "## 变更规则", "", "1. 跨域修改必须说明为什么不能把功能放到已有业务域。", "2. 新增公开契约必须同步更新 `API_REFERENCE.md` 或共享包索引。", "3. 超大文件不得继续按功能追加，应先提取单一职责模块。", "");
  return lines.join("\n");
}

function ownershipLayer(domain) {
  if (domain === "webDisplay") return "Web 前端";
  if (domain === "extensionCapture") return "Chrome Extension";
  if (domain === "dataAndInfrastructure") return "工程基础设施";
  return "服务端 API/Worker";
}

function formatList(values) {
  if (!values?.length) return "无";
  return values.map((value) => `\`${value.replaceAll("|", "\\|")}\``).join("、");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeCodeIndex();
}
