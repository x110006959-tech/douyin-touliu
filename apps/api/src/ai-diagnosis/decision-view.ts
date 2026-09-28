import { buildDiagnosisEvidenceCatalog, isFormalDiagnosisEvidenceLayer } from "@douyin-local-life/diagnosis-skills";
import {
  decisionEngineInputSchema,
  type ActionProposalStatus,
  type ActionType,
  type DecisionEngineInput,
  type DiagnosisRecentTrend,
  type RiskLevel
} from "@douyin-local-life/shared";
import {
  diagnosisActionTypes,
  diagnosisFinalResultSchema,
  type DiagnosisExperiment,
  type DiagnosisFinalResult,
  type DiagnosisTrustedFactMetric,
  type DiagnosisTrustedFactsView
} from "@douyin-local-life/shared/diagnosis";
import {
  buildDecisionRunDeterministicReview,
  buildDeterministicDiagnosticSignals,
  determineMainProblemTag,
  isUsefulDiagnosisHypothesis
} from "./orchestrator.js";
import { changedExperimentVariables } from "./experiment-variables.js";
import { hasUnsupportedBenchmark, hasUnsupportedQualitativeComparison } from "./comparison-language.js";
import { buildServerDiagnosisInsights } from "./server-insights.js";

type ProposalForDecisionView = {
  id: string;
  actionType: ActionType;
  title: string;
  reason: string;
  riskLevel: RiskLevel;
  status: ActionProposalStatus;
  manualExecutedAt: Date | null;
  expiresAt?: Date | null;
  outcomes?: Array<{ id: string }>;
};

const actionTypeSet = new Set<string>(diagnosisActionTypes);

export type DiagnosisDecisionView = {
  mainProblemTag: DiagnosisFinalResult["mainProblemTag"];
  headline: string;
  conclusion: string;
  conclusionSource: "AI_EXPLANATION" | "SERVER_DETERMINISTIC" | "SERVER_REVIEW";
  conclusionConfidence: number;
  problemSeverity: "UNASSESSED";
  problemSeverityReason: string;
  actionRisk: RiskLevel | null;
  targetComparison: {
    metricLabel: "全域支付 ROI";
    status: "MET" | "BELOW_TARGET";
    actual: number;
    target: number;
    absoluteGap: number;
    achievementRate: number;
    relativeShortfall: number;
  } | null;
  facts: DiagnosisFinalResult["factSnapshot"];
  analysis: Array<{
    title: string;
    conclusion: string;
    supportingFacts: string[];
    conflictingFacts: string[];
    missingEvidence: string[];
  }>;
  openQuestions: string[];
  nextStep: {
    kind: "APPROVAL" | "MANUAL_EXECUTION" | "OBSERVATION" | "OUTCOME_REVIEW" | "COMPLETED" | "COLLECT_EVIDENCE" | "NONE";
    title: string;
    reason: string;
    proposalId: string | null;
    actionType: ActionType | null;
    status: ActionProposalStatus | null;
  };
  primaryExperiment: DiagnosisExperiment | null;
  blockedActions: Array<{
    actionType: ActionType;
    title: string;
    reason: string;
    source: "POLICY" | "LIFECYCLE";
  }>;
};

export function buildDiagnosisDecisionView(
  inputValue: unknown,
  finalResultValue: unknown,
  proposals: ProposalForDecisionView[]
): DiagnosisDecisionView | null {
  const input = decisionEngineInputSchema.safeParse(inputValue);
  const result = diagnosisFinalResultSchema.safeParse(finalResultValue);
  if (!input.success || !result.success) return null;

  const decisionInput = input.data as DecisionEngineInput;
  const evidenceCatalog = buildDiagnosisEvidenceCatalog(decisionInput);
  const signals = buildDeterministicDiagnosticSignals(evidenceCatalog, decisionInput);
  const review = buildDecisionRunDeterministicReview(inputValue, finalResultValue);
  const mainProblemTag = review?.expectedMainProblemTag || determineMainProblemTag(signals);
  const actionableProposals = review ? [] : proposals.map(withReadableStatus);
  const nextProposal = selectNextProposal(actionableProposals);
  const pendingManualOutcome = decisionInput.diagnosisContext?.manualActions.find((item) => item.outcome === null) || null;
  const nextStep = pendingManualOutcome
    ? buildStoredManualOutcomeStep(pendingManualOutcome)
    : buildNextStep(nextProposal, result.data.missingEvidence, buildTrustedDiagnosisFactsView(decisionInput)?.nextCheck);
  const targetComparison = buildTargetComparison(signals);
  const primaryExperiment = review || pendingManualOutcome ? null : findProposalExperiment(result.data, nextProposal);
  const blockedActions = review ? [] : readBlockedActions(finalResultValue, result.data);
  const conclusion = review?.conclusion
    || buildDeterministicConclusion(mainProblemTag, targetComparison, nextProposal, result.data.coreConclusion);
  const modelAnalysis = review || !isFormalDiagnosisEvidenceLayer(decisionInput)
    ? []
    : buildGroundedAnalysis(result.data, evidenceCatalog);
  const analysis = modelAnalysis.length
    ? modelAnalysis
    : buildServerDiagnosisInsights(decisionInput, evidenceCatalog);

  return {
    mainProblemTag,
    headline: problemLabel(mainProblemTag),
    conclusion,
    conclusionSource: review ? "SERVER_REVIEW" : targetComparison ? "SERVER_DETERMINISTIC" : "AI_EXPLANATION",
    conclusionConfidence: result.data.confidence,
    problemSeverity: "UNASSESSED",
    problemSeverityReason: "目标差距已确认；业务影响仍需结合历史趋势、投放规模和同口径拆解判断。",
    actionRisk: nextProposal?.riskLevel || null,
    targetComparison,
    facts: result.data.factSnapshot,
    analysis,
    openQuestions: unique([
      ...result.data.missingEvidence,
      ...result.data.hypotheses.flatMap((item) => item.missingEvidence),
      ...signals.comparisonGaps
    ]).slice(0, 3),
    nextStep,
    primaryExperiment,
    blockedActions
  };
}

function buildGroundedAnalysis(result: DiagnosisFinalResult, evidence: ReturnType<typeof buildDiagnosisEvidenceCatalog>): DiagnosisDecisionView["analysis"] {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const describeEvidence = (ids: string[]) => ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [`${item.label}：${item.value ?? "未知"}`] : [];
  });
  return result.hypotheses.filter((hypothesis) => {
    const text = [hypothesis.title, hypothesis.conclusion, ...hypothesis.missingEvidence].join("。 ");
    const references = [...hypothesis.supportingEvidenceIds, ...hypothesis.conflictingEvidenceIds];
    // Historical output may contain instructions that were never approved.
    // Only evidence-linked interpretations belong here; actions keep their lifecycle gate.
    return isUsefulDiagnosisHypothesis(hypothesis, byId)
      && hypothesis.supportingEvidenceIds.length > 0
      && hypothesis.supportingEvidenceIds.some((id) => byId.get(id)?.kind === "METRIC" || byId.get(id)?.kind === "TABLE_ROW" || id.startsWith("history:") || id.startsWith("manual-action:"))
      && references.every((id) => byId.has(id))
      && changedExperimentVariables([text], { includeImplicitChanges: false }).length === 0
      && !hasUnsupportedBenchmark(text)
      && !hasUnsupportedQualitativeComparison(text);
  }).slice(0, 3).map((hypothesis) => ({
    title: hypothesis.title,
    conclusion: hypothesis.conclusion,
    supportingFacts: describeEvidence(hypothesis.supportingEvidenceIds),
    conflictingFacts: describeEvidence(hypothesis.conflictingEvidenceIds),
    missingEvidence: hypothesis.missingEvidence
  }));
}

/**
 * Facts are calculated independently from the model result so that failed
 * synthesis never hides already reviewed inputs or looks like a successful AI
 * diagnosis. This view intentionally contains no proposed action.
 */
export function buildTrustedDiagnosisFactsView(inputValue: unknown): DiagnosisTrustedFactsView | null {
  const parsed = decisionEngineInputSchema.safeParse(inputValue);
  if (!parsed.success) return null;
  const input = parsed.data as DecisionEngineInput;
  if (!isFormalDiagnosisEvidenceLayer(input)) return null;
  const evidence = buildDiagnosisEvidenceCatalog(input);
  const signals = buildDeterministicDiagnosticSignals(evidence, input);
  const fullDomainMetrics = [
    trustedMetric(evidence, "full_domain_gmv", "LOCAL_PROMOTION_DASHBOARD", "全域成交金额", "本地推总览（全域口径）"),
    trustedMetric(evidence, "spend", "LOCAL_PROMOTION_DASHBOARD", "全域消耗", "本地推总览（全域口径）"),
    trustedMetric(evidence, "full_domain_pay_roi", "LOCAL_PROMOTION_DASHBOARD", "全域支付 ROI", "本地推总览（全域口径）")
  ].flatMap((item) => item ? [item] : []);
  const liveMetrics = [
    trustedMetric(evidence, "gmv", "LIVE_DATA_SCREEN", "直播间成交金额", "直播经营数据"),
    trustedMetric(evidence, "orders", "LIVE_DATA_SCREEN", "直播间成交订单数", "直播经营数据"),
    trustedMetric(evidence, "live_viewers", "LIVE_DATA_SCREEN", "累计观看人数", "直播经营数据"),
    trustedMetric(evidence, "current_online_viewers", "LIVE_DATA_SCREEN", "当前在线人数（不代表开播状态）", "直播经营数据")
  ].flatMap((item) => item ? [item] : []);
  const dashboardMetrics = [
    ...(!fullDomainMetrics.some((item) => item.metric.metricKey === "spend") ? [trustedMetric(evidence, "spend", "LOCAL_PROMOTION_DASHBOARD", "消耗（全域口径未确认）", "本地推总览")] : []),
    trustedMetric(evidence, "gmv", "LOCAL_PROMOTION_DASHBOARD", "整体成交金额", "本地推总览"),
    trustedMetric(evidence, "orders", "LOCAL_PROMOTION_DASHBOARD", "整体成交订单数", "本地推总览")
  ].flatMap((item) => item ? [item] : []);
  const metricGroups = [
    fullDomainMetrics.length ? { id: "FULL_DOMAIN" as const, label: "全域投放口径", sourceLabel: "本地推总览（全域口径）", metrics: fullDomainMetrics.map((item) => item.metric) } : null,
    liveMetrics.length ? { id: "LIVE_ROOM" as const, label: "直播间口径", sourceLabel: "直播经营数据", metrics: liveMetrics.map((item) => item.metric) } : null,
    dashboardMetrics.length ? { id: "LOCAL_DASHBOARD" as const, label: "本地推总览口径", sourceLabel: "本地推总览", metrics: dashboardMetrics.map((item) => item.metric) } : null
  ].flatMap((item) => item ? [item] : []);
  const target = buildTrustedTarget(signals, fullDomainMetrics);
  const recentTrend = input.diagnosisContext?.recentTrend || null;
  const trend = recentTrend
    ? {
        status: recentTrend.status,
        summary: recentTrend.reason,
        recentTrend
      }
    : {
        status: "UNKNOWN" as const,
        summary: "旧记录未冻结近期趋势上下文，当前不补写历史结论。",
        recentTrend: null
      };
  const freshness = buildDataFreshness(input);
  const facts = buildTrustedFacts(
    target,
    fullDomainMetrics,
    signals.delivery.targetRoiEvidenceId,
    liveMetrics,
    dashboardMetrics,
    recentTrend
  );

  return {
    version: 1,
    scenario: input.diagnosisContext?.scenario || "UNSPECIFIED",
    dataFreshness: freshness,
    target,
    trend,
    cause: {
      status: "UNCONFIRMED",
      message: "当前可信事实可以确认数据范围、目标结果和近期变化边界；尚不能仅凭这些数据确认具体原因。"
    },
    metricGroups,
    facts,
    boundaries: unique(signals.comparisonGaps).slice(0, 4),
    nextCheck: input.diagnosisContext?.manualActions.some((action) => action.outcome === null)
      ? { title: "先记录已人工执行动作的结果", detail: "核对已执行动作对应的同口径前后指标、观察时间和干扰因素，回答效果是否可判断；尚未复盘前不重复执行该动作。" }
      : buildTrustedNextCheck(input.diagnosisContext?.scenario || "UNSPECIFIED", recentTrend)
  };
}

type TrustedMetricWithEvidence = {
  metric: DiagnosisTrustedFactMetric;
  evidenceId: string;
};

function trustedMetric(
  evidence: ReturnType<typeof buildDiagnosisEvidenceCatalog>,
  metricKey: string,
  routeKey: string,
  metricLabel: string,
  sourceLabel: string
): TrustedMetricWithEvidence | null {
  const item = evidence.find((candidate) => candidate.kind === "METRIC" && candidate.metricKey === metricKey && candidate.routeKey === routeKey);
  const value = metricNumber(item?.value);
  if (!item || value === null) return null;
  if (metricKey === "spend" && metricLabel === "全域消耗" && !/全域|FULL_DOMAIN/.test(`${item.semanticScope || ""} ${item.label}`)) return null;
  return {
    metric: {
      metricKey, metricLabel, value, unit: metricUnit(metricKey), sourceLabel,
      capturedAt: item.capturedAt || null,
      observationPeriod: item.observationPeriod || null,
      semanticScope: item.semanticScope || null
    },
    evidenceId: item.id
  };
}

function metricNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function metricUnit(metricKey: string) {
  if (["full_domain_gmv", "gmv", "spend"].includes(metricKey)) return "元";
  return null;
}

function buildTrustedTarget(
  signals: ReturnType<typeof buildDeterministicDiagnosticSignals>,
  fullDomainMetrics: TrustedMetricWithEvidence[]
): DiagnosisTrustedFactsView["target"] {
  const actual = fullDomainMetrics.find((item) => item.metric.metricKey === "full_domain_pay_roi")?.metric.value ?? null;
  const target = signals.delivery.targetRoi;
  if (actual !== null && target !== null) {
    return actual >= target
      ? { status: "MET", actual, target, message: `全域支付 ROI ${actual} 已达到本次目标 ROI ${target}；这只确认目标结果。` }
      : { status: "BELOW_TARGET", actual, target, message: `全域支付 ROI ${actual} 低于本次目标 ROI ${target}，目标差距已确认。` };
  }
  const fullRoi = fullDomainMetrics.find((item) => item.metric.metricKey === "full_domain_pay_roi");
  if (fullRoi) return { status: "UNAVAILABLE", actual: fullRoi.metric.value, target: null, message: "已确认当前全域支付 ROI，但本次未保存目标 ROI，暂不能判断是否达标。" };
  if (target !== null) return { status: "UNAVAILABLE", actual: null, target, message: "已保存本次目标 ROI，但缺少同口径全域支付 ROI，暂不能判断是否达标。" };
  return { status: "UNAVAILABLE", actual: null, target: null, message: "缺少全域支付 ROI 或本次目标 ROI，暂不能判断目标是否达成。" };
}

function buildDataFreshness(input: DecisionEngineInput): DiagnosisTrustedFactsView["dataFreshness"] {
  const timestamps = (input.collectionQuality?.routes || [])
    .flatMap((route) => route.lastCollectedAt ? [route.lastCollectedAt] : [])
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  const latestCollectedAt = timestamps[0] || null;
  const currentStates = (input.collectionQuality?.routes || []).map((route) => route.state);
  const summary = latestCollectedAt
    ? `最近一次路线采集时间为 ${new Date(latestCollectedAt).toLocaleString("zh-CN", { hour12: false })}；当前路线状态：${currentStates.join("、") || "未知"}。`
    : "本次输入没有可确认的路线采集时间。";
  return { latestCollectedAt, summary };
}

function buildTrustedFacts(
  target: DiagnosisTrustedFactsView["target"],
  fullDomain: TrustedMetricWithEvidence[],
  targetEvidenceId: string | null,
  live: TrustedMetricWithEvidence[],
  dashboard: TrustedMetricWithEvidence[],
  trend: DiagnosisRecentTrend | null
) {
  const facts: DiagnosisFinalResult["factSnapshot"] = [];
  const targetEvidenceIds = [
    fullDomain.find((item) => item.metric.metricKey === "full_domain_pay_roi")?.evidenceId,
    targetEvidenceId
  ].filter((item): item is string => Boolean(item));
  if (targetEvidenceIds.length) facts.push({ statement: target.message, evidenceIds: targetEvidenceIds });
  for (const group of [live, dashboard]) {
    const amount = group.find((item) => item.metric.metricKey === "gmv");
    if (amount) facts.push({ statement: `${amount.metric.metricLabel}为 ${amount.metric.value}${amount.metric.unit || ""}，来源：${amount.metric.sourceLabel}。`, evidenceIds: [amount.evidenceId] });
  }
  if (trend?.status === "AVAILABLE" && trend.metrics.length) {
    const evidenceId = `history:recent-trend:${trend.metrics[0]!.metricKey}`;
    facts.push({ statement: "最近两个完整 15 分钟窗口可比较；该区间结果不表示广告因果增量。", evidenceIds: [evidenceId] });
  }
  return facts.slice(0, 5);
}

function buildTrustedNextCheck(
  scenario: DiagnosisTrustedFactsView["scenario"],
  trend: DiagnosisRecentTrend | null
): DiagnosisTrustedFactsView["nextCheck"] {
  if (scenario === "LIVE_MONITORING") {
    return trend?.status === "AVAILABLE"
      ? { title: "等待下一个完整 15 分钟窗口后复核", detail: "检查全域成交金额、全域消耗和区间全域支付 ROI，回答近期区间产出是否延续上一个完整窗口。" }
      : { title: "先补齐两个连续的完整 15 分钟窗口", detail: "确认每分钟与窗口边界均已采集，再检查全域成交金额、全域消耗和区间产出比。" };
  }
  if (scenario === "POST_LIVE_REVIEW") {
    return { title: "为下一场保留可验证问题", detail: "核对本场可用数据范围和目标结果，并在下一场采集同口径窗口数据，回答产出是否发生变化。" };
  }
  return { title: "先确认本次使用场景与下一次检查条件", detail: "选择直播中或场后复盘，并按同口径补齐趋势或执行结果后再判断是否需要新增调整。" };
}

function buildTargetComparison(signals: ReturnType<typeof buildDeterministicDiagnosticSignals>) {
  const actual = signals.delivery.payRoi;
  const target = signals.delivery.targetRoi;
  if (actual === null || target === null || target <= 0) return null;
  return {
    metricLabel: "全域支付 ROI" as const,
    status: actual >= target ? "MET" as const : "BELOW_TARGET" as const,
    actual,
    target,
    absoluteGap: round(target - actual),
    achievementRate: round(actual / target),
    relativeShortfall: round((target - actual) / target)
  };
}

function buildDeterministicConclusion(
  tag: DiagnosisFinalResult["mainProblemTag"],
  comparison: DiagnosisDecisionView["targetComparison"],
  nextProposal: ProposalForDecisionView | null,
  fallback: string
) {
  if (!comparison) return fallback;
  if (comparison.status === "MET") {
    return `全域支付 ROI 为 ${comparison.actual}，本次目标 ROI ${comparison.target} 已达成。该结果只确认目标结果，订单表现、整体经营状态和具体原因仍需独立证据。`;
  }
  if (tag !== "DELIVERY_ROI") return fallback;
  const base = `全域支付 ROI 为 ${comparison.actual}，低于目标 ROI ${comparison.target}，目标差距已确认。`;
  if (nextProposal) {
    return `${base}现有证据尚不能仅凭整体 ROI 判断具体原因；服务端已将下一步限制为“${nextProposal.title}”，仍需人工确认并按同口径记录结果。`;
  }
  return `${base}现有证据尚不能说明差距由出价、定向、直播承接或商品结构中的哪一项造成，先补齐同口径拆解和历史对比，不直接调整预算或出价。`;
}

function buildStoredManualOutcomeStep(action: NonNullable<DecisionEngineInput["diagnosisContext"]>["manualActions"][number]): DiagnosisDecisionView["nextStep"] {
  return {
    kind: "OUTCOME_REVIEW",
    title: "先补充已执行动作的复盘结果",
    reason: "同一任务中已有人工执行记录，但尚未记录同口径结果；先完成复盘，不能把已执行当作已有效。",
    proposalId: action.actionProposalId,
    actionType: action.actionType,
    status: "MANUAL_EXECUTED"
  };
}

function selectNextProposal(proposals: ProposalForDecisionView[]) {
  const rank: Partial<Record<ActionProposalStatus, number>> = {
    APPROVED: 1,
    PENDING_APPROVAL: 2,
    OBSERVING: 3
  };
  return [...proposals]
    .filter((proposal) => rank[proposal.status] !== undefined || proposal.status === "MANUAL_EXECUTED")
    .sort((left, right) => {
      const leftNeedsOutcome = left.status === "MANUAL_EXECUTED" && !(left.outcomes?.length);
      const rightNeedsOutcome = right.status === "MANUAL_EXECUTED" && !(right.outcomes?.length);
      if (leftNeedsOutcome !== rightNeedsOutcome) return leftNeedsOutcome ? -1 : 1;
      const leftRank = left.status === "MANUAL_EXECUTED" ? 10 : rank[left.status] ?? 99;
      const rightRank = right.status === "MANUAL_EXECUTED" ? 10 : rank[right.status] ?? 99;
      return leftRank - rightRank;
    })[0] || null;
}

function withReadableStatus(proposal: ProposalForDecisionView): ProposalForDecisionView {
  const expirable = ["PENDING_APPROVAL", "APPROVED", "OBSERVING"].includes(proposal.status);
  return expirable && proposal.expiresAt && proposal.expiresAt <= new Date()
    ? { ...proposal, status: "EXPIRED" }
    : proposal;
}

function buildNextStep(proposal: ProposalForDecisionView | null, missingEvidence: string[], nextCheck?: DiagnosisTrustedFactsView["nextCheck"]): DiagnosisDecisionView["nextStep"] {
  if (!proposal) {
    const reason = missingEvidence[0] || "本轮没有通过服务端规则且仍需推进的动作。";
    return {
      kind: missingEvidence.length ? "COLLECT_EVIDENCE" : "NONE",
      title: missingEvidence.length ? nextCheck?.title || "核对本次缺失数据的范围和口径" : "本次无需新增调整",
      reason: missingEvidence.length && nextCheck ? `${reason}。${nextCheck.detail}` : reason,
      proposalId: null,
      actionType: null,
      status: null
    };
  }
  const base = {
    title: proposal.title,
    reason: stripTechnicalEvidence(proposal.reason),
    proposalId: proposal.id,
    actionType: proposal.actionType,
    status: proposal.status
  };
  if (proposal.status === "MANUAL_EXECUTED") {
    return proposal.outcomes?.length
      ? { ...base, kind: "COMPLETED" as const, reason: "人工执行与结果复盘均已记录，可用于后续离线评估。" }
      : { ...base, kind: "OUTCOME_REVIEW" as const, reason: "人工执行已经记录，下一步是补充同口径执行结果，完成本轮复盘。" };
  }
  if (proposal.status === "APPROVED") return { ...base, kind: "MANUAL_EXECUTION" as const };
  if (proposal.status === "OBSERVING") return { ...base, kind: "OBSERVATION" as const };
  return { ...base, kind: "APPROVAL" as const };
}

function findProposalExperiment(result: DiagnosisFinalResult, proposal: ProposalForDecisionView | null) {
  if (!proposal) return null;
  const candidate = result.candidateActions.find((item) => item.actionType === proposal.actionType);
  if (!candidate?.experimentId) return null;
  return result.experiments.find((item) => item.id === candidate.experimentId) || null;
}

function readBlockedActions(value: unknown, result: DiagnosisFinalResult): DiagnosisDecisionView["blockedActions"] {
  const adjudication = readRecord(readRecord(value)?.ruleAdjudication);
  if (!adjudication) return [];
  const blocked: DiagnosisDecisionView["blockedActions"] = [];
  if (Array.isArray(adjudication.rejected)) {
    for (const itemValue of adjudication.rejected) {
      const item = readRecord(itemValue);
      const candidate = readRecord(item?.candidate);
      const actionType = readActionType(candidate?.actionType);
      if (!item || !candidate || !actionType) continue;
      blocked.push({
        actionType,
        title: typeof candidate.title === "string" ? candidate.title : actionType,
        reason: typeof item.reason === "string" ? item.reason : "未通过服务端证据与安全规则。",
        source: "POLICY"
      });
    }
  }
  if (Array.isArray(adjudication.lifecycleSuppressed)) {
    for (const itemValue of adjudication.lifecycleSuppressed) {
      const item = readRecord(itemValue);
      const actionType = readActionType(item?.actionType);
      if (!item || !actionType) continue;
      const candidate = result.candidateActions.find((entry) => entry.actionType === actionType);
      blocked.push({
        actionType,
        title: candidate?.title || actionType,
        reason: item.reason === "FREQUENCY_LIMIT" ? "当前项目一小时内可处理动作已达到上限。" : "同类动作仍在冷却期，避免重复调整。",
        source: "LIFECYCLE"
      });
    }
  }
  return blocked;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readActionType(value: unknown): ActionType | null {
  return typeof value === "string" && actionTypeSet.has(value) ? value as ActionType : null;
}

function stripTechnicalEvidence(value: string) {
  return value.replace(/[（(]证据[:：][^）)]*[）)]/g, "").trim();
}

function problemLabel(tag: DiagnosisFinalResult["mainProblemTag"]) {
  return {
    HEALTHY: "当前未发现明确异常",
    DATA_READINESS: "判断条件不足",
    TRAFFIC: "优先检查流量进入",
    LIVE_ROOM: "优先检查直播承接",
    PRODUCT: "优先检查商品与优惠",
    DELIVERY_ROI: "投放产出未达到本次目标",
    ACTIVITY_COMPLIANCE: "优先处理活动、履约或合规风险",
    MULTI_FACTOR: "需要分两步验证"
  }[tag];
}

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
