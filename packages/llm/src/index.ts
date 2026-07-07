import {
  subjectLabel,
  type AnalyzeInput,
  type AnalyzeOutput,
  type AnalysisProblem,
  type AnalysisSuggestion,
  type DiagnosisAction,
  type ManualCheckItem,
  type RiskLevel,
  type SubjectType,
  type VisibleMetric
} from "@douyin-local-life/shared";

export type LlmProvider = {
  name: string;
  model: string;
  analyze(input: AnalyzeInput): Promise<AnalyzeOutput>;
};

export type LlmProviderName = "mock" | "openai" | "deepseek";

function normalizeMetricKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, "_");
}

function metricNumber(metrics: VisibleMetric[], keys: string[]) {
  const normalized = new Set(keys.map(normalizeMetricKey));
  const found = metrics.find((metric) => normalized.has(normalizeMetricKey(metric.key)) || normalized.has(normalizeMetricKey(metric.name)));
  if (!found) return null;
  if (typeof found.value === "number") return Number.isFinite(found.value) ? found.value : null;
  if (typeof found.value === "string") {
    const parsed = Number(found.value.replace(/[¥￥,%\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function addProblem(problems: AnalysisProblem[], title: string, evidence: string, severity: RiskLevel) {
  problems.push({ title, evidence, severity });
}

function addSuggestion(
  suggestions: AnalysisSuggestion[],
  action: DiagnosisAction,
  title: string,
  reason: string,
  expectedImpact: string,
  priority: RiskLevel
) {
  suggestions.push({ action, title, reason, expectedImpact, priority });
}

function addManualCheck(manualCheckItems: ManualCheckItem[], title: string, reason: string) {
  manualCheckItems.push({ title, reason });
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
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

function frameworkName(subjectType: SubjectType) {
  if (subjectType === "SERVICE_PROVIDER") return "服务商算法";
  if (subjectType === "MERCHANT_OFFICIAL") return "官方自播框架";
  if (subjectType === "PROFESSIONAL") return "职人框架";
  if (subjectType === "EXTERNAL_CREATOR") return "达人框架";
  if (subjectType === "CREATOR_MATRIX") return "达人矩阵框架";
  if (subjectType === "PLATFORM_EVENT") return "活动框架";
  if (subjectType === "BRAND_REGION_MATRIX") return "区域矩阵框架";
  return "保守校准框架";
}

function compactSummary(subject: string, fact: string, judgement: string, action: DiagnosisAction) {
  return `【全域情报】：${subject}，${fact}。【深度研判】：${judgement}。【操作指令】：${action}`;
}

export async function mockAnalyze(input: AnalyzeInput): Promise<AnalyzeOutput> {
  const problems: AnalysisProblem[] = [];
  const suggestions: AnalysisSuggestion[] = [];
  const manualCheckItems: ManualCheckItem[] = [];
  const text = input.visibleText || "";
  const subjectName = subjectLabel(input.subject.subjectType);
  const missingSubjectFields = subjectMissing(input);

  if (missingSubjectFields.length > 0) {
    for (const field of missingSubjectFields) {
      addManualCheck(manualCheckItems, `${field}待校准`, "主体识别字段不足时不得套用服务商、达人或职人专属算法。");
    }
    addSuggestion(suggestions, "主体识别校准", "先确认直播主体", "主体未确认时只能保守诊断。", "避免把服务商/达人/职人算法套错。", "MEDIUM");
    return {
      summary: compactSummary("主体待校准", `缺失${missingSubjectFields.join("、")}`, "不输出专属算法结论", "主体识别校准"),
      riskLevel: "MEDIUM",
      problems,
      suggestions,
      manualCheckItems,
      confidence: 0.45
    };
  }

  const spend = metricNumber(input.metrics, ["spend", "消耗", "广告消耗", "今日消耗"]);
  const verifyRoi = metricNumber(input.metrics, ["verify_roi", "核销 ROI", "核销ROI"]);
  const grossProfitRoi = metricNumber(input.metrics, ["gross_profit_roi", "毛利 ROI", "毛利ROI"]);
  const payRoi = metricNumber(input.metrics, ["pay_roi", "支付 ROI", "支付ROI", "roi", "ROI"]);
  const targetRoi = metricNumber(input.metrics, ["target_roi", "目标 ROI", "目标ROI"]);
  const grossProfit = metricNumber(input.metrics, ["gross_profit", "核销毛利", "毛利"]);
  const merchantSubsidy = metricNumber(input.metrics, ["merchant_subsidy", "商家补贴"]);
  const conversions = metricNumber(input.metrics, ["conversions", "成交人数", "成交订单数", "支付订单"]);
  const refundRate = metricNumber(input.metrics, ["refund_rate", "退款率"]);
  const complaintRate = metricNumber(input.metrics, ["complaint_rate", "投诉率"]);
  const badReviewRate = metricNumber(input.metrics, ["bad_review_rate", "差评率"]);
  const shelfGmv = metricNumber(input.metrics, ["shelf_gmv", "货架成交 GMV", "团购货架"]);
  const searchGmv = metricNumber(input.metrics, ["search_gmv", "搜索成交 GMV", "搜索成交"]);
  const poiVisits = metricNumber(input.metrics, ["poi_visits", "POI 访问量", "门店访问"]);
  const serviceFee = input.subject.serviceFee ?? metricNumber(input.metrics, ["service_fee", "服务费"]);
  const trueCost = (spend ?? 0) + (serviceFee ?? 0) + (merchantSubsidy ?? 0);
  const serviceProviderGrossProfitRoi = grossProfit != null && trueCost > 0 ? grossProfit / trueCost : grossProfitRoi;
  const fullDomainRoi = spend && spend > 0 && ((shelfGmv ?? 0) > 0 || (searchGmv ?? 0) > 0) ? ((shelfGmv ?? 0) + (searchGmv ?? 0)) / spend : null;
  const mainRoi = serviceProviderGrossProfitRoi ?? verifyRoi ?? payRoi;
  const roiTarget = targetRoi ?? 1;

  const riskByMetric = (refundRate != null && refundRate >= 0.08) || (complaintRate != null && complaintRate > 0) || (badReviewRate != null && badReviewRate >= 0.03);
  const riskByText = hasAny(text, ["错价", "虚假承诺", "承诺不清", "客诉", "投诉升高", "退款率升高", "差评率升高", "履约异常", "库存不足"]);
  if (riskByMetric || riskByText) {
    addProblem(problems, "口碑/履约风险优先", "检测到退款、投诉、差评、履约、库存或话术风险信号。", "HIGH");
    addSuggestion(suggestions, "暂停跑量", "先停放量处理风险", "风险未修复前禁止盲目加预算。", "减少客诉和亏损扩大。", "HIGH");
    addSuggestion(suggestions, "修复口碑", "同步处理客诉、库存、预约和主播话术", "恢复门店承接能力。", "降低后续投放熔断和差评扩散风险。", "HIGH");
    if (input.subject.subjectType === "SERVICE_PROVIDER") {
      addSuggestion(suggestions, "调整服务商 SOP", "服务商执行可能引发错价或承诺风险", "重做排班、脚本、场控和禁用承诺。", "减少履约问题。", "HIGH");
    }
    return {
      summary: compactSummary(subjectName, "出现口碑/履约风险", "风险优先，禁止加预算", "暂停跑量"),
      riskLevel: "HIGH",
      problems,
      suggestions,
      manualCheckItems,
      confidence: 0.82
    };
  }

  if (hasAny(text, ["活动未核验", "补贴待核验", "待报名", "未后台核验"])) {
    addManualCheck(manualCheckItems, "活动未核验", "未后台确认的活动不得计入 ROI。");
    addSuggestion(suggestions, "核验活动", "活动状态未确认", "确认后台可报名或已生效后再计算补贴。", "避免虚高 ROI。", "MEDIUM");
    return {
      summary: compactSummary(subjectName, "活动未核验", "不得把补贴计入 ROI", "核验活动"),
      riskLevel: "MEDIUM",
      problems,
      suggestions,
      manualCheckItems,
      confidence: 0.68
    };
  }

  if (verifyRoi == null && grossProfitRoi == null) {
    addManualCheck(manualCheckItems, "核销 ROI 缺失", "缺少核销 ROI 或毛利 ROI 时不得输出加预算。");
    addSuggestion(suggestions, "稳预算", "关键 ROI 数据缺失", "先保守维持预算并补齐核销/毛利字段。", "避免误判盈利能力。", "MEDIUM");
    addSuggestion(suggestions, "强化货架承接", "直播大屏可能缺少后链路成交", "补齐团购货架、POI 和搜索承接数据。", "提升全域承接判断。", "MEDIUM");
    return {
      summary: compactSummary(subjectName, "核销 ROI 缺失", "数据缺失/待校准", "稳预算"),
      riskLevel: "MEDIUM",
      problems,
      suggestions,
      manualCheckItems,
      confidence: 0.58
    };
  }

  if (input.subject.subjectType === "SERVICE_PROVIDER") {
    if (serviceFee == null) {
      addManualCheck(manualCheckItems, "服务费待校准", "服务商后成本必须计入广告消耗、服务商费用和商家补贴。");
    }

    if (hasAny(text, ["排班异常", "脚本偏离", "场控问题", "服务商执行差", "讲解节奏差", "素材未沉淀"])) {
      addSuggestion(suggestions, "调整服务商 SOP", "商家号数据不能直接等于服务商执行合格", "先调整排班、脚本、场控和复盘 SOP。", "保留有效计划同时修复执行。", "MEDIUM");
      addSuggestion(suggestions, "优化讲解", "服务商执行影响直播间转化", "校准卖点、价格、核销规则和禁用承诺。", "提升点击到成交效率。", "MEDIUM");
      return {
        summary: compactSummary(subjectName, `ROI ${mainRoi?.toFixed(2) ?? "待校准"}，执行异常`, "账号可观察，先修服务商执行", "调整服务商 SOP"),
        riskLevel: "MEDIUM",
        problems,
        suggestions,
        manualCheckItems,
        confidence: 0.74
      };
    }

    if (serviceProviderGrossProfitRoi != null && serviceProviderGrossProfitRoi < roiTarget) {
      addProblem(problems, "服务商后毛利 ROI 不达标", `服务商后毛利 ROI=${serviceProviderGrossProfitRoi.toFixed(2)}，目标=${roiTarget.toFixed(2)}。`, "HIGH");
      addSuggestion(suggestions, "重谈服务费用", "账号 ROI 可能被服务费吃掉", "按服务商后成本重算毛利 ROI。", "把真实成本拉回可控范围。", "HIGH");
      addSuggestion(suggestions, "降低出价", "真实 ROI 未达标", "降低无效消耗并等待校准。", "减少亏损扩大。", "HIGH");
      return {
        summary: compactSummary(subjectName, `服务商后毛利ROI ${serviceProviderGrossProfitRoi.toFixed(2)}`, "真实成本后不达标", "重谈服务费用"),
        riskLevel: "HIGH",
        problems,
        suggestions,
        manualCheckItems,
        confidence: 0.82
      };
    }
  }

  if (fullDomainRoi != null && fullDomainRoi >= roiTarget && (payRoi == null || payRoi < roiTarget)) {
    addSuggestion(suggestions, "优化 POI/搜索承接", "直播即时 ROI 弱但全域成交可覆盖成本", "先优化搜索、POI 和团购货架承接。", "避免误关高全域价值计划。", "MEDIUM");
    addSuggestion(suggestions, "稳预算", "全域 ROI 达标", "维持观察并补齐核销链路。", "保留全域种草价值。", "MEDIUM");
    return {
      summary: compactSummary(subjectName, `全域ROI ${fullDomainRoi.toFixed(2)}`, "全域有价值，不直接停投", "优化 POI/搜索承接"),
      riskLevel: "MEDIUM",
      problems,
      suggestions,
      manualCheckItems,
      confidence: 0.76
    };
  }

  if (spend != null && spend > 0 && conversions === 0) {
    addProblem(problems, "有消耗但无成交", `消耗=${spend}，成交=0。`, "HIGH");
    addSuggestion(suggestions, "降低出价", "投放效率异常", "先降低出价并复核商品、讲解和承接。", "减少空耗。", "HIGH");
    addSuggestion(suggestions, input.subject.subjectType === "SERVICE_PROVIDER" ? "调整服务商 SOP" : "强化货架承接", "成交链路弱", "检查讲解节奏、货盘和核销承接。", "提升转化效率。", "HIGH");
    return {
      summary: compactSummary(subjectName, "有消耗无成交", "ROI 亏损风险", "降低出价"),
      riskLevel: "HIGH",
      problems,
      suggestions,
      manualCheckItems,
      confidence: 0.78
    };
  }

  if (mainRoi != null && mainRoi >= roiTarget) {
    const action: DiagnosisAction =
      input.subject.subjectType === "SERVICE_PROVIDER" && hasAny(text, ["素材沉淀", "粉丝沉淀", "素材可复投"]) ? "沉淀素材复投" : "稳预算";
    addSuggestion(suggestions, action, "关键 ROI 达标且未发现风险", "维持当前节奏，继续补齐核销、活动和库存校准。", "稳定放量基础。", "LOW");
    return {
      summary: compactSummary(subjectName, `${frameworkName(input.subject.subjectType)}，ROI ${mainRoi.toFixed(2)}`, "达标但继续校准", action),
      riskLevel: manualCheckItems.length ? "MEDIUM" : "LOW",
      problems,
      suggestions,
      manualCheckItems,
      confidence: manualCheckItems.length ? 0.72 : 0.84
    };
  }

  addSuggestion(suggestions, input.subject.subjectType === "SERVICE_PROVIDER" ? "调整服务商 SOP" : "强化货架承接", "未达到明确放量条件", "先处理讲解、货架、POI、搜索和核销承接。", "提高后续诊断置信度。", "MEDIUM");
  addSuggestion(suggestions, "降低出价", "ROI 未达目标或数据不足", "降低无效消耗并等待补齐字段。", "控制亏损。", "MEDIUM");
  const fallbackAction = suggestions[0]?.action || "稳预算";
  return {
    summary: compactSummary(subjectName, `当前算法=${frameworkName(input.subject.subjectType)}`, "未达到放量条件", fallbackAction),
    riskLevel: "MEDIUM",
    problems,
    suggestions,
    manualCheckItems,
    confidence: 0.66
  };
}

export function createLlmProvider(name: LlmProviderName = "mock"): LlmProvider {
  if (name !== "mock") {
    return {
      name,
      model: `${name}-placeholder`,
      analyze: async () => {
        throw new Error(`${name} provider 尚未配置，当前 MVP 请使用 mock provider`);
      }
    };
  }

  return {
    name: "mock",
    model: "subject-first-local-rules-v1",
    analyze: mockAnalyze
  };
}
