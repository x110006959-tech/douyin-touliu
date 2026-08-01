import { diagnosisSkillSetVersion, syntheticDiagnosisCases } from "@douyin-local-life/diagnosis-skills";
import type { DiagnosisFinalResult } from "@douyin-local-life/shared/diagnosis";
import { createConfiguredDiagnosisTransport } from "./ai-diagnosis/config.js";
import {
  createSyntheticDiagnosisTransport,
  evaluateSyntheticDiagnosisSuite,
  isDecisionEngineInput,
  type DiagnosisEvaluationCase
} from "./ai-diagnosis/synthetic-evaluation.js";
import { prisma } from "./prisma.js";

const live = process.argv.includes("--live");
const includeEligible = process.argv.includes("--include-eligible");
const limit = readPositiveIntegerArgument("--limit");
const concurrency = readPositiveIntegerArgument("--concurrency") || 1;
if (concurrency > 4) {
  console.error("--concurrency 不能超过 4");
  process.exit(2);
}
const requestedIds = readCsvArgument("--ids");
const filteredSyntheticCases = requestedIds
  ? syntheticDiagnosisCases.filter((testCase) => requestedIds.includes(testCase.id))
  : syntheticDiagnosisCases;
if (requestedIds && filteredSyntheticCases.length !== new Set(requestedIds).size) {
  console.error("--ids 包含不存在或重复的合成案例 ID");
  process.exit(2);
}
const selectedSyntheticCases = limit ? filteredSyntheticCases.slice(0, limit) : filteredSyntheticCases;
if (live && !process.env.DEEPSEEK_API_KEY) {
  console.error("DEEPSEEK_API_KEY 未配置，无法执行真实 DeepSeek 24 例评测。");
  process.exit(2);
}

const report = await evaluateSyntheticDiagnosisSuite(
  (testCase) => live ? createConfiguredDiagnosisTransport() : createSyntheticDiagnosisTransport(testCase),
  selectedSyntheticCases,
  { concurrency }
);
const eligibleCases = includeEligible ? await loadEligibleCases() : [];
const eligibleReport = eligibleCases.length
  ? await evaluateSyntheticDiagnosisSuite(
      (testCase) => live ? createConfiguredDiagnosisTransport() : createSyntheticDiagnosisTransport(testCase),
      eligibleCases,
      { concurrency }
    )
  : null;
console.log(JSON.stringify({
  mode: live ? "deepseek" : "fake",
  skillSetVersion: diagnosisSkillSetVersion,
  synthetic: report,
  eligibleCases: eligibleReport,
  eligibleCaseCount: eligibleCases.length
}, null, 2));

const passed = passesGate(report, selectedSyntheticCases.length)
  && (!eligibleReport || passesGate(eligibleReport, eligibleCases.length));
await prisma.$disconnect();
process.exit(passed ? 0 : 1);

function passesGate(report: Awaited<ReturnType<typeof evaluateSyntheticDiagnosisSuite>>, expectedTotal: number) {
  return report.total === expectedTotal
    && report.structurePassRate === 1
    && report.mainProblemHitRate >= 0.8
    && report.hallucinatedEvidence === 0
    && report.safetyViolations === 0;
}

async function loadEligibleCases(): Promise<DiagnosisEvaluationCase[]> {
  const cases = await prisma.diagnosisCase.findMany({
    where: { status: "ELIGIBLE", decisionRunId: { not: null } },
    include: { decisionRun: { select: { inputJson: true } } },
    orderBy: { updatedAt: "asc" }
  });
  return cases.flatMap((item): DiagnosisEvaluationCase[] => {
    if (!item.mainProblemTag || !diagnosisProblemTags.has(item.mainProblemTag) || !isDecisionEngineInput(item.decisionRun?.inputJson)) return [];
    return [{
      id: `eligible:${item.id}`,
      expectedMainProblemTag: item.mainProblemTag as DiagnosisFinalResult["mainProblemTag"],
      input: item.decisionRun.inputJson
    }];
  });
}

const diagnosisProblemTags = new Set([
  "HEALTHY", "DATA_READINESS", "TRAFFIC", "LIVE_ROOM", "PRODUCT", "DELIVERY_ROI", "ACTIVITY_COMPLIANCE", "MULTI_FACTOR"
]);

function readPositiveIntegerArgument(name: string) {
  const prefix = `${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    console.error(`${name} 必须是正整数`);
    process.exit(2);
  }
  return parsed;
}

function readCsvArgument(name: string) {
  const prefix = `${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (value === undefined) return null;
  const parsed = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!parsed.length) {
    console.error(`${name} 至少包含一个值`);
    process.exit(2);
  }
  return parsed;
}
