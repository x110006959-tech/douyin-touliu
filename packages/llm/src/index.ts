import {
  metricValueSemantic,
  metricValueToRuleNumber,
  subjectLabel,
  type AnalyzeInput,
  type AnalyzeOutput,
  type AnalysisProblem,
  type AnalysisSuggestion,
  type ManualCheckItem,
  type RiskLevel,
  standardizeMetricKey
} from "@douyin-local-life/shared";
import {
  buildDecisionReferenceBundle,
  type DecisionReferenceBundle
} from "./reference-playbooks.js";

export * from "./deepseek.js";
export * from "./tool-loop.js";

export type LlmProvider = {
  name: string;
  model: string;
  analyze(input: AnalyzeInput): Promise<ExplanationOutput>;
};

export type LlmProviderName = "mock" | "openai" | "deepseek";
export type ExplanationOutput = AnalyzeOutput & {
  decisionReference: DecisionReferenceBundle;
};

export const EXPLANATION_PROMPT_VERSION = "explanation-only-agency-reference-v0.2.0";

export {
  AGENCY_AGENTS_REVISION,
  DECISION_REFERENCE_POLICY_VERSION,
  agencyAgentSources,
  buildDecisionReferenceBundle,
  buildDecisionReferenceInstructions,
  type DecisionReferenceBundle,
  type DecisionReferenceInsight,
  type DecisionReferenceSource
} from "./reference-playbooks.js";

export async function mockAnalyze(input: AnalyzeInput): Promise<ExplanationOutput> {
  const problems: AnalysisProblem[] = [];
  const suggestions: AnalysisSuggestion[] = [];
  const manualCheckItems: ManualCheckItem[] = [];
  const missingSubjectFields = subjectMissing(input);
  const metrics = readMetrics(input.metrics);
  const spend = metrics.get("spend");
  const orders = metrics.get("orders");
  const impressions = metrics.get("impressions");
  const ctr = normalizeRate(metrics.get("ctr"));
  const viewers = metrics.get("live_viewers");
  const gpm = metrics.get("gpm");

  if (missingSubjectFields.length > 0) {
    manualCheckItems.push({
      title: "主体识别待校准",
      reason: `缺失或低置信字段：${missingSubjectFields.join("、")}。最终动作请运行 decision-engine。`
    });
    problems.push({
      title: "主体识别不足",
      evidence: "LLM 解释层不生成主体专属动作，需先完成主体校准。",
      severity: "MEDIUM"
    });
  }

  if (spend != null && spend > 0 && orders === 0) {
    problems.push({ title: "有消耗但尚未形成订单", evidence: `广告消耗=${formatNumber(spend)}，订单=0。需要结合样本量判断是流量质量、直播承接还是商品问题。`, severity: "HIGH" });
    suggestions.push({ action: "优化讲解", title: "先验证直播间承接，不直接追加流量", reason: "有消耗无订单时继续加量可能放大空耗。", expectedImpact: "通过固定投流变量、调整一轮真实讲解，观察商品点击、订单与 GPM 是否改善。", priority: "HIGH" });
  }
  if (impressions != null && impressions >= 10_000 && ctr != null && ctr < 0.01) {
    problems.push({ title: "曝光到点击转化偏弱", evidence: `曝光=${formatNumber(impressions)}，点击率=${formatPercent(ctr)}。`, severity: "MEDIUM" });
    suggestions.push({ action: "微调定向", title: "拆分验证素材卖点与人群", reason: "高曝光低点击更像进房动机或人群匹配问题。", expectedImpact: "一次只改变一个变量，降低把素材、人群和预算同时调整导致的误判。", priority: "MEDIUM" });
  }
  if (orders != null && orders <= 1 && (viewers ?? 0) >= 5_000) {
    problems.push({ title: "观看已有规模但成交承接不足", evidence: `观看=${formatNumber(viewers || 0)}，订单=${formatNumber(orders)}。`, severity: orders === 0 ? "HIGH" : "MEDIUM" });
    suggestions.push({ action: "强化货架承接", title: "重排主推商品与下单路径", reason: "流量进入后成交偏弱，需要同时检查商品利益点、库存预约和下单链路。", expectedImpact: "减少进房后的流失，并把问题定位到商品或讲解环节。", priority: "HIGH" });
  }
  if (gpm == null) {
    manualCheckItems.push({ title: "GPM 待补齐", reason: "缺少 GPM 时无法判断直播内容单位流量的变现效率。" });
  }

  if (suggestions.length === 0) {
    suggestions.push({ action: "稳预算", title: "保持变量稳定，建立可对比样本", reason: "当前快照没有形成足够证据支持明确的专项优化结论。", expectedImpact: "为下一轮诊断保留可比较的基线，避免多变量同时变化。", priority: "LOW" });
  }

  const riskLevel: RiskLevel = problems.some((problem) => problem.severity === "HIGH") ? "HIGH" : problems.length || missingSubjectFields.length ? "MEDIUM" : "LOW";
  const facts = [
    spend == null ? null : `消耗=${formatNumber(spend)}`,
    orders == null ? null : `订单=${formatNumber(orders)}`,
    impressions == null ? null : `曝光=${formatNumber(impressions)}`,
    ctr == null ? null : `点击率=${formatPercent(ctr)}`,
    viewers == null ? null : `观看=${formatNumber(viewers)}`,
    gpm == null ? null : `GPM=${formatNumber(gpm)}`
  ].filter(Boolean);
  return {
    summary: `${subjectLabel(input.subject.subjectType)}的本轮数据解读：${facts.length ? facts.join("，") : "关键经营指标不足"}。识别到 ${problems.length} 个问题、${suggestions.length} 个验证方向；建议按单变量、小样本、人工执行方式验证。最终投流动作仍以 decision-engine 的 DecisionRun 和 ActionProposal 为准。`,
    riskLevel,
    problems,
    suggestions,
    manualCheckItems,
    confidence: Math.min(input.subject.confidence, missingSubjectFields.length > 0 ? 0.55 : 0.7),
    decisionReference: buildDecisionReferenceBundle(input)
  };
}

function readMetrics(metrics: AnalyzeInput["metrics"]) {
  const values = new Map<string, number>();
  for (const metric of metrics) {
    const key = standardizeMetricKey(metric);
    const value = key === "unknown" ? null : metricValueToRuleNumber(metric, metricValueSemantic(key));
    if (key !== "unknown" && value != null && !values.has(key)) values.set(key, value);
  }
  return values;
}

function normalizeRate(value: number | undefined) {
  if (value == null) return null;
  return value > 1 ? value / 100 : value;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function createLlmProvider(name: LlmProviderName = "mock"): LlmProvider {
  const runtimeEnvironment = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV;
  if (name === "mock" && runtimeEnvironment === "production") {
    throw new Error("生产环境禁止使用 mock LLM provider");
  }
  if (name !== "mock") {
    return {
      name,
      model: `${name}-${EXPLANATION_PROMPT_VERSION}-placeholder`,
      analyze: async () => {
        throw new Error(`${name} provider 尚未配置，当前 MVP 请使用 mock provider`);
      }
    };
  }

  return {
    name: "mock",
    model: EXPLANATION_PROMPT_VERSION,
    analyze: mockAnalyze
  };
}

function subjectMissing(input: AnalyzeInput) {
  const missing: string[] = [];
  if (input.subject.subjectType === "SUBJECT_PENDING") missing.push("主体类型");
  if (input.subject.operatorType === "OPERATOR_PENDING") missing.push("操盘主体");
  if (input.subject.cooperationType === "COOPERATION_PENDING") missing.push("合作关系");
  if (input.subject.controlLevel === "PENDING") missing.push("可控程度");
  if (input.subject.confidence < 0.7) missing.push("主体置信度");
  return missing;
}
