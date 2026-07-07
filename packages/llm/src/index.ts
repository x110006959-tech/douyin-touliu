import {
  subjectLabel,
  type AnalyzeInput,
  type AnalyzeOutput,
  type AnalysisProblem,
  type ManualCheckItem,
  type RiskLevel
} from "@douyin-local-life/shared";

export type LlmProvider = {
  name: string;
  model: string;
  analyze(input: AnalyzeInput): Promise<AnalyzeOutput>;
};

export type LlmProviderName = "mock" | "openai" | "deepseek";

export async function mockAnalyze(input: AnalyzeInput): Promise<AnalyzeOutput> {
  const problems: AnalysisProblem[] = [];
  const manualCheckItems: ManualCheckItem[] = [];
  const missingSubjectFields = subjectMissing(input);

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

  const riskLevel: RiskLevel = missingSubjectFields.length > 0 ? "MEDIUM" : "LOW";
  return {
    summary: `解释层：${subjectLabel(input.subject.subjectType)}，${frameworkName(input.subject.subjectType)}。最终投流动作以 decision-engine 的 DecisionRun 和 ActionProposal 为准。`,
    riskLevel,
    problems,
    suggestions: [],
    manualCheckItems,
    confidence: Math.min(input.subject.confidence, missingSubjectFields.length > 0 ? 0.55 : 0.7)
  };
}

export function createLlmProvider(name: LlmProviderName = "mock"): LlmProvider {
  if (name !== "mock") {
    return {
      name,
      model: `${name}-explanation-placeholder`,
      analyze: async () => {
        throw new Error(`${name} provider 尚未配置，当前 MVP 请使用 mock provider`);
      }
    };
  }

  return {
    name: "mock",
    model: "explanation-only-v0.1.2",
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

function frameworkName(subjectType: AnalyzeInput["subject"]["subjectType"]) {
  if (subjectType === "SERVICE_PROVIDER") return "服务商框架";
  if (subjectType === "MERCHANT_OFFICIAL") return "官方自播框架";
  if (subjectType === "PROFESSIONAL") return "职人框架";
  if (subjectType === "EXTERNAL_CREATOR") return "达人框架";
  if (subjectType === "CREATOR_MATRIX") return "达人矩阵框架";
  if (subjectType === "PLATFORM_EVENT") return "活动框架";
  if (subjectType === "BRAND_REGION_MATRIX") return "区域矩阵框架";
  return "保守校准框架";
}
