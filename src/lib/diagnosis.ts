import type { ActivitySnapshot, LiveSnapshot, SubjectProfile } from "@prisma/client";
import { diagnosisOperation, type DiagnosisAction } from "./constants";
import { diagnosisPriorityPath, diagnosisRuleVersion, getRulePromptSummary, getSubjectRule, outputContract } from "./diagnosis-rules";

type Confidence = "low" | "medium" | "high";
export type SmoothedRiskMetric = "complaintRate" | "badReviewRate" | "refundRate";

export type MetricSmoothingSignal = {
  field: SmoothedRiskMetric;
  label: string;
  threshold: number;
  values: number[];
  sampleCount: number;
  windowMinutes: number;
  latestValue: number | null;
  trend: "increasing" | "not_increasing" | "insufficient";
  confirmed: boolean;
};

export type MetricSmoothingSignals = Partial<Record<SmoothedRiskMetric, MetricSmoothingSignal>>;

type DiagnosisContext = {
  snapshot: LiveSnapshot;
  activity?: ActivitySnapshot | null;
  subjectProfile?: SubjectProfile | null;
  metricSignals?: MetricSmoothingSignals;
};

type SubjectDecision = {
  subjectType: string;
  accountIdentity: string | null;
  operatorType: string;
  cooperationType: string | null;
  controlLevel: string | null;
  confidence: Confidence;
  source: string;
  algorithm: string;
  missingSubjectFields: string[];
  serviceProviderName: string | null;
  serviceMode: string | null;
  rule: ReturnType<typeof getSubjectRule>;
};

export type DiagnosisOutput = {
  intelligence: string;
  judgement: string;
  operation: string;
  output: string;
  actions: DiagnosisAction[];
  tags: string[];
  confidence: Confidence;
  missingFields: string[];
  evidenceFields: Record<string, unknown>;
};

const riskActions: DiagnosisAction[] = ["暂停跑量", "修复口碑", "降低出价"];
const serviceRiskActions: DiagnosisAction[] = ["暂停跑量", "修复口碑", "调整服务商 SOP"];
const conservativeActions: DiagnosisAction[] = ["稳预算", "检查库存/预约", "强化货架承接"];

function hasNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function currency(value: number | null | undefined) {
  if (!hasNumber(value)) return null;
  return `¥${Math.round(value).toLocaleString("zh-CN")}`;
}

function compactNumber(value: number | null | undefined) {
  if (!hasNumber(value)) return null;
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
  return value.toLocaleString("zh-CN");
}

function cleanString(value: string | null | undefined) {
  const next = value?.trim();
  return next && !["-", "待识别", "主体待识别"].includes(next) ? next : null;
}

function hasAnyText(value: string | null | undefined, words: string[]) {
  const text = value || "";
  return words.some((word) => text.includes(word));
}

function metricRiskConfirmed(
  snapshot: LiveSnapshot,
  metricSignals: MetricSmoothingSignals | undefined,
  field: SmoothedRiskMetric,
  threshold: number
) {
  const value = snapshot[field];
  if (!hasNumber(value) || value <= threshold) return false;
  const signal = metricSignals?.[field];
  return signal ? signal.confirmed : true;
}

function getUnconfirmedRiskFields(snapshot: LiveSnapshot, metricSignals: MetricSmoothingSignals | undefined) {
  if (!metricSignals) return [];
  return (Object.keys(metricSignals) as SmoothedRiskMetric[]).filter((field) => {
    const signal = metricSignals[field];
    const value = snapshot[field];
    return Boolean(signal && hasNumber(value) && value > signal.threshold && !signal.confirmed);
  });
}

function normalizeSubjectType(value: string | null | undefined) {
  const text = cleanString(value);
  if (!text || text === "主体待校准") return null;
  if (text.includes("服务商")) return "服务商代播/代运营";
  if (text.includes("职人") || text.includes("店长")) return "职人/店长直播";
  if (text.includes("矩阵") && (text.includes("达人") || text.includes("团长") || text.includes("机构"))) {
    return "达人矩阵/机构团长直播";
  }
  if (text.includes("达人")) return "外部达人直播";
  if (text.includes("平台活动") || text.includes("官方会场") || text.includes("会场")) return "平台活动/官方会场";
  if (text.includes("区域") || text.includes("总部") || text.includes("多门店") || text.includes("品牌矩阵")) {
    return "品牌/区域矩阵直播";
  }
  if (text.includes("官方") || text.includes("自播") || text.includes("门店号")) {
    return "商家官方自播";
  }
  return null;
}

function confidenceFromScore(value: number | null | undefined): Confidence | null {
  if (!hasNumber(value)) return null;
  if (value >= 0.8) return "high";
  if (value >= 0.55) return "medium";
  return "low";
}

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const next = cleanString(value);
    if (next) return next;
  }
  return null;
}

function defaultOperatorType(subjectType: string) {
  if (subjectType === "商家官方自播") return "商家自播";
  if (subjectType === "职人/店长直播") return "商家职人/店长";
  if (subjectType === "外部达人直播") return "达人本人";
  if (subjectType === "达人矩阵/机构团长直播") return "机构团长";
  if (subjectType === "服务商代播/代运营") return "服务商代播/代运营";
  if (subjectType === "平台活动/官方会场") return "平台招商活动";
  if (subjectType === "品牌/区域矩阵直播") return "品牌区域运营";
  return "待校准";
}

function defaultCooperationType(subjectType: string) {
  if (subjectType === "商家官方自播") return "无";
  if (subjectType === "职人/店长直播") return "职人绑定";
  if (subjectType === "外部达人直播") return "达人合作";
  if (subjectType === "达人矩阵/机构团长直播") return "机构团长";
  if (subjectType === "服务商代播/代运营") return "服务商合同";
  if (subjectType === "平台活动/官方会场") return "平台招商";
  if (subjectType === "品牌/区域矩阵直播") return "品牌矩阵";
  return null;
}

function identifySubject(snapshot: LiveSnapshot, subjectProfile?: SubjectProfile | null): SubjectDecision {
  const snapshotSubject = normalizeSubjectType(snapshot.subjectType);
  const profileSubject = normalizeSubjectType(subjectProfile?.subjectType);
  const subjectType = snapshotSubject || profileSubject || "主体待校准";
  const source = snapshotSubject ? snapshot.subjectSource || snapshot.sourceQuality : profileSubject ? "account_profile" : "missing";
  const scoreConfidence = confidenceFromScore(snapshot.subjectConfidence);
  const confidence: Confidence =
    scoreConfidence || (source.includes("manual") || source === "account_profile" ? "high" : "medium");

  const accountIdentity = firstText(snapshot.accountIdentity, subjectProfile?.accountIdentity);
  const operatorType = firstText(snapshot.operatorType, subjectProfile?.operatorType) || defaultOperatorType(subjectType);
  const cooperationType = firstText(snapshot.cooperationType, subjectProfile?.cooperationType) || defaultCooperationType(subjectType);
  const controlLevel = firstText(snapshot.controlLevel, subjectProfile?.controlLevel);
  const serviceProviderName = firstText(snapshot.serviceProviderName, subjectProfile?.serviceProviderName);
  const serviceMode = firstText(snapshot.serviceMode, subjectProfile?.serviceMode);

  const missingSubjectFields: string[] = [];
  if (subjectType === "主体待校准") missingSubjectFields.push("直播主体待校准");
  if (operatorType === "待校准") missingSubjectFields.push("操盘主体待校准");
  if (!cooperationType && subjectType !== "主体待校准") missingSubjectFields.push("合作关系待校准");
  if (subjectType === "服务商代播/代运营") {
    if (!serviceProviderName) missingSubjectFields.push("服务商名称待校准");
    if (!serviceMode) missingSubjectFields.push("服务类型待校准");
    if (!hasNumber(snapshot.serviceFee) && !hasNumber(subjectProfile?.serviceFee)) missingSubjectFields.push("服务费待校准");
  }
  const rule = getSubjectRule(subjectType);

  return {
    subjectType,
    accountIdentity,
    operatorType,
    cooperationType,
    controlLevel,
    confidence: subjectType === "主体待校准" ? "low" : confidence,
    source,
    algorithm: rule.algorithm,
    missingSubjectFields,
    serviceProviderName,
    serviceMode,
    rule
  };
}

function hasServiceHardRisk(snapshot: LiveSnapshot) {
  return Boolean(
    snapshot.servicePricePromiseRisk ||
      hasAnyText(snapshot.serviceScriptStatus, ["错价", "虚假承诺", "夸大承诺", "客诉", "违规"])
  );
}

function hasOperationalRisk(snapshot: LiveSnapshot, metricSignals?: MetricSmoothingSignals) {
  return Boolean(
    snapshot.scoreDrop ||
      snapshot.fulfillmentAbnormal ||
      snapshot.hostScriptRisk ||
      hasServiceHardRisk(snapshot) ||
      metricRiskConfirmed(snapshot, metricSignals, "complaintRate", 0.02) ||
      metricRiskConfirmed(snapshot, metricSignals, "badReviewRate", 0.03) ||
      metricRiskConfirmed(snapshot, metricSignals, "refundRate", 0.12) ||
      snapshot.inventoryStatus === "不足" ||
      snapshot.reservationStatus === "不足"
  );
}

function getRiskFacts(snapshot: LiveSnapshot, metricSignals?: MetricSmoothingSignals) {
  const facts: string[] = [];
  if (snapshot.scoreDrop) facts.push("评分下滑");
  if (snapshot.fulfillmentAbnormal) facts.push("履约异常");
  if (snapshot.hostScriptRisk) facts.push("话术风险");
  if (snapshot.servicePricePromiseRisk) facts.push("服务商错价/承诺风险");
  if (hasAnyText(snapshot.serviceScriptStatus, ["错价", "虚假承诺", "夸大承诺", "客诉", "违规"])) facts.push("服务商话术违规");
  if (snapshot.inventoryStatus === "不足") facts.push("库存不足");
  if (snapshot.reservationStatus === "不足") facts.push("预约不足");
  if (metricRiskConfirmed(snapshot, metricSignals, "complaintRate", 0.02)) facts.push("投诉升高");
  if (metricRiskConfirmed(snapshot, metricSignals, "badReviewRate", 0.03)) facts.push("差评升高");
  if (metricRiskConfirmed(snapshot, metricSignals, "refundRate", 0.12)) facts.push("退款升高");
  return facts;
}

function calculateNetCost(snapshot: LiveSnapshot, activity?: ActivitySnapshot | null) {
  if (!hasNumber(snapshot.todaySpend)) return null;
  const activityCanCount = activity?.verifiedStatus === "verified" && activity.canCountInRoi;
  const platformSubsidy = activityCanCount
    ? snapshot.platformSubsidyAmount ?? activity?.platformSubsidyAmount ?? 0
    : 0;
  const adCoupon = activityCanCount ? snapshot.adCouponAmount ?? activity?.adCouponAmount ?? 0 : 0;
  const rebateCoupon = activityCanCount ? snapshot.rebateCouponAmount ?? activity?.rebateCouponAmount ?? 0 : 0;
  const merchantSubsidy = snapshot.merchantSubsidyAmount ?? activity?.merchantSubsidyAmount ?? 0;
  return Math.max(snapshot.todaySpend - platformSubsidy - adCoupon - rebateCoupon + merchantSubsidy, 0);
}

function calculateFullDomainRoi(snapshot: LiveSnapshot, netCost: number | null) {
  if (!hasNumber(netCost) || netCost <= 0) return null;
  const verifyGmv = snapshot.attributedVerifyGmv ?? 0;
  const shelfGmv = snapshot.shelfGmv ?? 0;
  const searchGmv = snapshot.searchGmv ?? 0;
  const total = verifyGmv + shelfGmv + searchGmv;
  return total > 0 ? total / netCost : null;
}

function calculateServiceProviderCost(snapshot: LiveSnapshot, subjectProfile?: SubjectProfile | null) {
  const serviceFee = snapshot.serviceFee ?? subjectProfile?.serviceFee;
  if (!hasNumber(snapshot.todaySpend) || !hasNumber(serviceFee)) return null;
  const merchantSubsidy = snapshot.merchantSubsidyAmount ?? 0;
  return Math.max(snapshot.todaySpend + serviceFee + merchantSubsidy, 0);
}

function calculateServiceProviderGrossProfitRoi(snapshot: LiveSnapshot, serviceProviderCost: number | null) {
  if (hasNumber(snapshot.grossProfitRoi)) return snapshot.grossProfitRoi;
  if (!hasNumber(snapshot.grossProfit) || !hasNumber(serviceProviderCost) || serviceProviderCost <= 0) return null;
  return snapshot.grossProfit / serviceProviderCost;
}

function getMissingFields(subject: SubjectDecision, snapshot: LiveSnapshot, activity?: ActivitySnapshot | null) {
  const missing: string[] = [...subject.missingSubjectFields];
  if (!hasNumber(snapshot.verifyRoi)) missing.push("核销 ROI 缺失");
  if (!hasNumber(snapshot.todaySpend)) missing.push("今日消耗缺失");
  if (!hasNumber(snapshot.targetRoi) && !hasNumber(snapshot.targetCpa)) missing.push("目标 ROI/CPA 缺失");
  if (!snapshot.inventoryStatus || snapshot.inventoryStatus === "待校准") missing.push("库存数据待校准");
  if (activity && activity.verifiedStatus !== "verified") missing.push("活动未核验");
  if (subject.subjectType === "服务商代播/代运营" && !hasNumber(snapshot.grossProfit) && !hasNumber(snapshot.grossProfitRoi)) {
    missing.push("核销毛利缺失");
  }
  return [...new Set(missing)];
}

function shortJoin(values: string[], fallback: string) {
  return values.length > 0 ? values.slice(0, 3).join("、") : fallback;
}

function getLiveFacts(snapshot: LiveSnapshot) {
  const facts: string[] = [];
  const liveGmv = currency(snapshot.liveGmv);
  if (liveGmv) facts.push(`直播GMV${liveGmv}`);
  const shelf = currency(snapshot.shelfGmv);
  if (shelf) facts.push(`货架GMV${shelf}`);
  const search = currency(snapshot.searchGmv);
  if (search) facts.push(`搜索GMV${search}`);
  const poi = compactNumber(snapshot.poiVisits);
  if (poi) facts.push(`POI访问${poi}`);
  return facts;
}

function buildSubjectFact(subject: SubjectDecision, extra: string) {
  const operator = subject.operatorType && subject.operatorType !== "待校准" ? `操盘${subject.operatorType}` : "操盘待校准";
  return `${subject.subjectType}，${operator}${extra ? `，${extra}` : ""}`;
}

function buildOutput(intelligence: string, judgement: string, operation: string) {
  const full = `【全域情报】：${intelligence}。【深度研判】：${judgement}。【操作指令】：${operation}。`;
  if ([...full].length <= outputContract.maxChars) return full;

  const compact = `【全域情报】：${[...intelligence].slice(0, 24).join("")}。【深度研判】：${[
    ...judgement
  ]
    .slice(0, 18)
    .join("")}。【操作指令】：${[...operation].slice(0, 22).join("")}。`;
  if ([...compact].length <= outputContract.maxChars) return compact;
  return [...compact].slice(0, outputContract.maxChars - 1).join("") + "。";
}

function hasServiceExecutionIssue(snapshot: LiveSnapshot) {
  return Boolean(
    snapshot.serviceFieldControlIssue ||
      hasAnyText(snapshot.serviceScheduleStatus, ["缺班", "异常", "待调整", "执行差"]) ||
      hasAnyText(snapshot.serviceScriptStatus, ["待调整", "不一致", "执行差", "讲解弱", "场控弱"])
  );
}

function hasDepositedServiceAsset(snapshot: LiveSnapshot) {
  return hasAnyText(snapshot.materialAssetStatus, ["已沉淀", "可复投", "良好"]) || hasAnyText(snapshot.fanAssetStatus, ["已沉淀", "增长", "良好"]);
}

function subjectFrameworkTag(subjectType: string) {
  return getSubjectRule(subjectType).tag;
}

export function runDiagnosis({ snapshot, activity, subjectProfile, metricSignals }: DiagnosisContext): DiagnosisOutput {
  const subject = identifySubject(snapshot, subjectProfile);
  const netCost = calculateNetCost(snapshot, activity);
  const fullDomainRoi = calculateFullDomainRoi(snapshot, netCost);
  const serviceProviderCost = calculateServiceProviderCost(snapshot, subjectProfile);
  const serviceProviderGrossProfitRoi = calculateServiceProviderGrossProfitRoi(snapshot, serviceProviderCost);
  const targetRoi = snapshot.targetRoi ?? 1;
  const risk = hasOperationalRisk(snapshot, metricSignals);
  const riskFacts = getRiskFacts(snapshot, metricSignals);
  const activityUnverified = Boolean(activity && activity.verifiedStatus !== "verified");
  const fullDomainGood = hasNumber(fullDomainRoi) && fullDomainRoi >= targetRoi;
  const accountRoiGood = fullDomainGood || (hasNumber(snapshot.verifyRoi) && snapshot.verifyRoi >= targetRoi);
  const liveWeak = hasNumber(snapshot.payRoi) && snapshot.payRoi < targetRoi;
  const liveFacts = getLiveFacts(snapshot);
  const missingFields = getMissingFields(subject, snapshot, activity);

  const evidenceFields = {
    ruleVersion: diagnosisRuleVersion,
    priorityPath: [...diagnosisPriorityPath],
    subjectType: subject.subjectType,
    accountIdentity: subject.accountIdentity,
    operatorType: subject.operatorType,
    cooperationType: subject.cooperationType,
    controlLevel: subject.controlLevel,
    subjectConfidence: subject.confidence,
    subjectSource: subject.source,
    missingSubjectFields: subject.missingSubjectFields,
    algorithm: subject.algorithm,
    ruleFocusSignals: subject.rule.focusSignals,
    ruleCostSignals: subject.rule.costSignals,
    ruleOverflowSignals: subject.rule.overflowSignals,
    outputContract,
    promptSummary: getRulePromptSummary(subject.subjectType),
    serviceProviderName: subject.serviceProviderName,
    serviceMode: subject.serviceMode,
    serviceProviderCost,
    serviceProviderGrossProfitRoi,
    netCost,
    fullDomainRoi,
    targetRoi,
    payRoi: snapshot.payRoi,
    verifyRoi: snapshot.verifyRoi,
    liveGmv: snapshot.liveGmv,
    shelfGmv: snapshot.shelfGmv,
    searchGmv: snapshot.searchGmv,
    poiVisits: snapshot.poiVisits,
    storeSearches: snapshot.storeSearches,
    sourceQuality: snapshot.sourceQuality,
    activityStatus: activity?.verifiedStatus ?? null,
    metricSmoothing: metricSignals ?? null,
    unconfirmedRiskFields: getUnconfirmedRiskFields(snapshot, metricSignals)
  };

  if (risk) {
    const actions = subject.subjectType === "服务商代播/代运营" && hasServiceHardRisk(snapshot) ? serviceRiskActions : riskActions;
    const intelligence = buildSubjectFact(subject, shortJoin(riskFacts, "口碑履约异常"));
    const judgement = subject.subjectType === "服务商代播/代运营" ? "服务商执行风险优先" : "口碑/履约风险优先";
    const operation = diagnosisOperation(actions);
    return {
      intelligence,
      judgement,
      operation,
      output: buildOutput(intelligence, judgement, operation),
      actions,
      tags: ["risk", "fulfillment", subjectFrameworkTag(subject.subjectType)],
      confidence: "high",
      missingFields,
      evidenceFields
    };
  }

  if (subject.subjectType === "主体待校准") {
    const intelligence = buildSubjectFact(subject, shortJoin(subject.missingSubjectFields, "主体信息缺失"));
    const judgement = "主体未确认，不套专属算法";
    const operation = diagnosisOperation(conservativeActions);
    return {
      intelligence,
      judgement,
      operation,
      output: buildOutput(intelligence, judgement, operation),
      actions: conservativeActions,
      tags: ["subject_missing", "conservative"],
      confidence: "low",
      missingFields,
      evidenceFields
    };
  }

  if (activityUnverified) {
    const actions: DiagnosisAction[] = ["核验活动", "稳预算"];
    const facts = liveFacts.length > 0 ? `活动未核验，${liveFacts.slice(0, 1).join("、")}` : "活动未核验";
    const intelligence = buildSubjectFact(subject, facts);
    const judgement = "补贴不得计入 ROI";
    const operation = diagnosisOperation(actions);
    return {
      intelligence,
      judgement,
      operation,
      output: buildOutput(intelligence, judgement, operation),
      actions,
      tags: ["activity_unverified", subjectFrameworkTag(subject.subjectType)],
      confidence: subject.confidence === "low" ? "low" : "medium",
      missingFields,
      evidenceFields
    };
  }

  if (subject.subjectType === "服务商代播/代运营" && accountRoiGood && hasServiceExecutionIssue(snapshot)) {
    const actions: DiagnosisAction[] = ["调整服务商 SOP", "优化讲解", "稳预算"];
    const roiFact = hasNumber(snapshot.verifyRoi) ? `核销ROI ${snapshot.verifyRoi.toFixed(2)}` : `全域ROI ${fullDomainRoi?.toFixed(2)}`;
    const intelligence = buildSubjectFact(subject, `${roiFact}，执行待调整`);
    const judgement = "账号 ROI 可保留，先修服务商执行";
    const operation = diagnosisOperation(actions);
    return {
      intelligence,
      judgement,
      operation,
      output: buildOutput(intelligence, judgement, operation),
      actions,
      tags: ["service_provider", "execution_issue"],
      confidence: "high",
      missingFields,
      evidenceFields
    };
  }

  if (missingFields.length > 0) {
    const actions: DiagnosisAction[] = ["稳预算"];
    if (missingFields.some((field) => field.includes("库存"))) actions.push("检查库存/预约");
    if (missingFields.some((field) => field.includes("活动"))) actions.push("核验活动");
    if (subject.subjectType === "服务商代播/代运营" && hasServiceExecutionIssue(snapshot)) actions.push("调整服务商 SOP");
    if (!actions.includes("强化货架承接")) actions.push("强化货架承接");
    const facts = liveFacts.length > 0 ? `${liveFacts.slice(0, 1).join("、")}；` : "";
    const intelligence = buildSubjectFact(subject, `${facts}${shortJoin(missingFields, "数据缺失")}`);
    const judgement = "数据缺失/待校准，不做放量判断";
    const operation = diagnosisOperation(actions);
    return {
      intelligence,
      judgement,
      operation,
      output: buildOutput(intelligence, judgement, operation),
      actions,
      tags: ["missing_data", subjectFrameworkTag(subject.subjectType)],
      confidence: "low",
      missingFields,
      evidenceFields
    };
  }

  if (
    subject.subjectType === "服务商代播/代运营" &&
    hasNumber(serviceProviderGrossProfitRoi) &&
    serviceProviderGrossProfitRoi < targetRoi
  ) {
    const actions: DiagnosisAction[] = ["重谈服务费用", "降低出价"];
    const intelligence = buildSubjectFact(subject, `服务商后毛利ROI ${serviceProviderGrossProfitRoi.toFixed(2)}`);
    const judgement = "服务费后真实 ROI 不达标";
    const operation = diagnosisOperation(actions);
    return {
      intelligence,
      judgement,
      operation,
      output: buildOutput(intelligence, judgement, operation),
      actions,
      tags: ["service_provider", "cost_roi_loss"],
      confidence: "high",
      missingFields,
      evidenceFields
    };
  }

  if (fullDomainGood && liveWeak) {
    const actions: DiagnosisAction[] =
      subject.subjectType === "服务商代播/代运营" && hasDepositedServiceAsset(snapshot)
        ? ["稳预算", "沉淀素材复投", "强化货架承接"]
        : ["稳预算", "强化货架承接", "优化 POI/搜索承接"];
    const intelligence = buildSubjectFact(subject, `全域ROI ${fullDomainRoi?.toFixed(2)}`);
    const judgement = "直播弱但全域种草有效";
    const operation = diagnosisOperation(actions);
    return {
      intelligence,
      judgement,
      operation,
      output: buildOutput(intelligence, judgement, operation),
      actions,
      tags: ["full_domain_value", subjectFrameworkTag(subject.subjectType)],
      confidence: "high",
      missingFields,
      evidenceFields
    };
  }

  if (accountRoiGood) {
    const budgetTight =
      hasNumber(snapshot.dailyBudget) &&
      hasNumber(snapshot.remainingBudget) &&
      snapshot.dailyBudget > 0 &&
      snapshot.remainingBudget / snapshot.dailyBudget < 0.2;
    const actions: DiagnosisAction[] =
      subject.subjectType === "服务商代播/代运营" && hasDepositedServiceAsset(snapshot)
        ? ["稳预算", "沉淀素材复投"]
        : budgetTight
          ? ["加预算", "微调定向"]
          : ["稳预算", "微调定向"];
    const roiFact = fullDomainRoi ? `全域ROI ${fullDomainRoi.toFixed(2)}` : `核销ROI ${snapshot.verifyRoi?.toFixed(2)}`;
    const intelligence = buildSubjectFact(subject, roiFact);
    const judgement = subject.rule.goodJudgement;
    const operation = diagnosisOperation(actions);
    return {
      intelligence,
      judgement,
      operation,
      output: buildOutput(intelligence, judgement, operation),
      actions,
      tags: ["roi_good", subjectFrameworkTag(subject.subjectType)],
      confidence: "high",
      missingFields,
      evidenceFields
    };
  }

  const actions: DiagnosisAction[] = subject.subjectType === "服务商代播/代运营" ? ["降低出价", "调整服务商 SOP"] : ["降低出价", "强化货架承接"];
  const facts = liveFacts.length > 0 ? `ROI未达，${liveFacts.slice(0, 1).join("、")}` : "ROI 未达标";
  const intelligence = buildSubjectFact(subject, facts);
  const judgement = subject.rule.weakJudgement;
  const operation = diagnosisOperation(actions);
  return {
    intelligence,
    judgement,
    operation,
    output: buildOutput(intelligence, judgement, operation),
    actions,
    tags: ["roi_loss", subjectFrameworkTag(subject.subjectType)],
    confidence: "medium",
    missingFields,
    evidenceFields
  };
}
