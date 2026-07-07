import {
  budgetActionTypes,
  decisionEngineActionTypes,
  strongActionTypes,
  subjectLabel,
  standardizeMetricKey,
  type ActionProposalDTO,
  type ActionType,
  type DecisionDataQuality,
  type DecisionEngineInput,
  type DecisionEngineOutput,
  type ManualCheckItem,
  type MetricKey,
  type RiskLevel,
  type VisibleMetric
} from "@douyin-local-life/shared";

export const decisionEngineVersion = "decision-engine-v0.1.0";
export const decisionRuleVersion = "local-life-rules-v0.1.0";

const allowedActionTypes = new Set<ActionType>(decisionEngineActionTypes);
const budgetActions = new Set<ActionType>(budgetActionTypes);
const strongActions = new Set<ActionType>(strongActionTypes);
const safeFallbackActions = new Set<ActionType>(["OBSERVE", "REQUEST_MANUAL_REVIEW"]);
const riskRank: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export function runDecisionRules(input: DecisionEngineInput): DecisionEngineOutput {
  const metrics = metricReader(input.metrics);
  const manualCheckItems: ManualCheckItem[] = [];
  const proposals: ActionProposalDTO[] = [];
  const dataQuality = assessDataQuality(input, metrics);
  let riskLevel: RiskLevel = dataQuality.blocksStrongActions ? "MEDIUM" : "LOW";

  const roi = metrics.firstNumber(["verify_roi", "gross_profit_roi", "pay_roi"]);
  const targetRoi = input.targetRoi ?? metrics.number("target_roi") ?? 1;
  const spend = metrics.number("spend");
  const dailyBudget = metrics.number("daily_budget");
  const orders = metrics.number("orders");
  const impressions = metrics.number("impressions");
  const clicks = metrics.number("clicks");
  const ctr = normalizeRate(metrics.number("ctr"));
  const cpa = metrics.number("cpa");
  const targetCpa = input.targetCpa ?? metrics.number("target_cpa");
  const viewers = metrics.number("live_viewers");
  const gpm = metrics.number("gpm");

  addSubjectChecks(input, manualCheckItems, proposals);
  if (input.dataReviewStatus === "UNREVIEWED") {
    addManualCheck(manualCheckItems, "数据未人工复核", "当前数据未经过人工复核，请确认关键指标后再进行投流决策。");
  }

  if (roi == null) {
    addManualCheck(manualCheckItems, "ROI 缺失", "缺少核销 ROI、毛利 ROI 或支付 ROI 时，不输出确定性放量结论。");
    addProposal(proposals, {
      actionType: "REQUEST_MANUAL_REVIEW",
      title: "补齐 ROI 后再决策",
      reason: "ROI 缺失，当前只能进入人工复核。",
      riskLevel: "MEDIUM",
      confidence: 0.62
    });
    riskLevel = maxRisk(riskLevel, "MEDIUM");
  } else if (roi < 1) {
    riskLevel = maxRisk(riskLevel, "HIGH");
    addProposal(proposals, {
      actionType: "PAUSE_TASK",
      title: "ROI 低于 1，暂停跑量待复核",
      reason: `当前 ROI=${formatNumber(roi)}，低于盈亏线 1。`,
      expectedImpact: "阻止亏损继续扩大，等待人工核对成本与核销链路。",
      riskLevel: "HIGH",
      confidence: 0.86
    });
  } else if (roi < targetRoi) {
    const severe = roi < targetRoi * 0.7;
    riskLevel = maxRisk(riskLevel, severe ? "HIGH" : "MEDIUM");
    addProposal(proposals, {
      actionType: severe ? "DECREASE_BUDGET" : "OBSERVE",
      title: severe ? "ROI 明显低于目标，降低预算待审批" : "ROI 低于目标，继续观察并复核",
      reason: `当前 ROI=${formatNumber(roi)}，目标 ROI=${formatNumber(targetRoi)}。`,
      expectedImpact: severe ? "减少无效消耗，避免目标偏离扩大。" : "保留观察窗口，避免过早误停。",
      riskLevel: severe ? "HIGH" : "MEDIUM",
      confidence: severe ? 0.78 : 0.72
    });
    addProposal(proposals, {
      actionType: "ADJUST_ROI_TARGET",
      title: "复核 ROI 目标",
      reason: "ROI 低于目标时，应检查目标 ROI 是否与毛利、补贴和服务费后一致。",
      riskLevel: "MEDIUM",
      confidence: 0.72
    });
  }

  if (spend != null && orders != null) {
    if (spend > 0 && orders === 0) {
      riskLevel = maxRisk(riskLevel, "HIGH");
      addProposal(proposals, {
        actionType: "PAUSE_TASK",
        title: "有消耗但订单为 0",
        reason: `当前消耗=${formatNumber(spend)}，订单数=0。`,
        expectedImpact: "先阻断空耗，再人工核对直播间承接和商品链路。",
        riskLevel: "HIGH",
        confidence: 0.88
      });
      addProposal(proposals, {
        actionType: "CHECK_LIVE_ROOM",
        title: "检查直播间承接",
        reason: "有消耗无订单时，优先检查讲解、商品点击、下单链路和库存预约。",
        riskLevel: "HIGH",
        confidence: 0.8
      });
    } else if (dailyBudget != null && dailyBudget > 0) {
      const spendRatio = spend / dailyBudget;
      if (spendRatio >= 0.8 && orders <= 1) {
        riskLevel = maxRisk(riskLevel, "MEDIUM");
        addProposal(proposals, {
          actionType: "OBSERVE",
          title: "消耗偏快但转化不足",
          reason: `消耗已达预算 ${formatPercent(spendRatio)}，订单数=${formatNumber(orders)}。`,
          expectedImpact: "进入观察，等待人工确认是否降预算。",
          riskLevel: "MEDIUM",
          confidence: 0.72
        });
        addProposal(proposals, {
          actionType: "DECREASE_BUDGET",
          title: "转化不足时降低预算待审批",
          reason: "消耗过快且订单不足，建议人工审批后控制预算。",
          riskLevel: "MEDIUM",
          confidence: 0.7
        });
      }

      if (spendRatio <= 0.1 && (impressions == null || impressions < 1000)) {
        riskLevel = maxRisk(riskLevel, "MEDIUM");
        addProposal(proposals, {
          actionType: "CHECK_AUDIENCE",
          title: "消耗过慢，检查流量获取",
          reason: `消耗仅达预算 ${formatPercent(spendRatio)}，曝光不足。`,
          expectedImpact: "检查人群、出价、定向和账户流量资格。",
          riskLevel: "MEDIUM",
          confidence: 0.7
        });
      }
    }
  }

  if (ctr == null) {
    addManualCheck(manualCheckItems, "点击率缺失", "缺少点击率时，无法判断曝光到点击的素材/定向效率。");
  } else if (impressions != null && impressions >= 10000 && ctr < 0.01) {
    riskLevel = maxRisk(riskLevel, "MEDIUM");
    addProposal(proposals, {
      actionType: "CHECK_CREATIVE",
      title: "曝光高但点击率低",
      reason: `曝光=${formatNumber(impressions)}，点击率=${formatPercent(ctr)}。`,
      expectedImpact: "检查素材、标题、福利表达和首屏卖点。",
      riskLevel: "MEDIUM",
      confidence: 0.76
    });
    addProposal(proposals, {
      actionType: "CHECK_AUDIENCE",
      title: "复核人群定向",
      reason: "曝光高但点击率低，可能存在人群不匹配或流量质量偏差。",
      riskLevel: "MEDIUM",
      confidence: 0.7
    });
  }

  if (cpa != null && targetCpa != null && targetCpa > 0 && cpa > targetCpa * 1.5) {
    const severe = cpa > targetCpa * 2.5;
    riskLevel = maxRisk(riskLevel, severe ? "HIGH" : "MEDIUM");
    addProposal(proposals, {
      actionType: "CHECK_AUDIENCE",
      title: "订单成本高于目标",
      reason: `当前订单成本=${formatNumber(cpa)}，目标成本=${formatNumber(targetCpa)}。`,
      expectedImpact: "复核人群、出价和流量来源，降低无效点击。",
      riskLevel: severe ? "HIGH" : "MEDIUM",
      confidence: 0.76
    });
    addProposal(proposals, {
      actionType: "CHECK_LIVE_ROOM",
      title: "检查直播间成交承接",
      reason: "订单成本偏高时，需要同步检查讲解节奏、商品利益点和下单链路。",
      riskLevel: "MEDIUM",
      confidence: 0.72
    });
  }

  if (orders != null && orders <= 1 && ((clicks != null && clicks >= 500) || (viewers != null && viewers >= 5000))) {
    riskLevel = maxRisk(riskLevel, orders === 0 ? "HIGH" : "MEDIUM");
    addProposal(proposals, {
      actionType: "CHECK_LIVE_ROOM",
      title: "点击/观看高但订单低",
      reason: `点击=${formatNullable(clicks)}，观看=${formatNullable(viewers)}，订单=${formatNumber(orders)}。`,
      expectedImpact: "检查直播间讲解、商品承接、价格权益和预约库存。",
      riskLevel: orders === 0 ? "HIGH" : "MEDIUM",
      confidence: 0.78
    });
  }

  if (gpm == null) {
    addManualCheck(manualCheckItems, "GPM 缺失", "缺少 GPM 时，无法判断直播内容单位流量变现效率。");
  }

  if (dataQuality.blocksStrongActions) {
    riskLevel = maxRisk(riskLevel, "MEDIUM");
    addProposal(proposals, {
      actionType: "REQUEST_MANUAL_REVIEW",
      title: "关键数据缺失，进入人工复核",
      reason: `缺失项：${dataQuality.missingFields.join("、") || "关键指标待校准"}。`,
      riskLevel: "MEDIUM",
      confidence: 0.64,
      blockedReason: "关键指标缺失过多，禁止生成强动作。"
    });
    addProposal(proposals, {
      actionType: "OBSERVE",
      title: "数据待校准，继续观察",
      reason: "缺失数据未补齐前，仅允许观察或人工复核。",
      riskLevel: "MEDIUM",
      confidence: 0.64
    });
  }

  if (proposals.length === 0) {
    addProposal(proposals, {
      actionType: "OBSERVE",
      title: "暂未触发强风险规则",
      reason: "当前数据未触发明确降停或专项检查条件，建议继续观察。",
      riskLevel: "LOW",
      confidence: 0.76
    });
  }

  const confidence = computeConfidence(input, dataQuality);
  const rawOutput: DecisionEngineOutput = {
    riskLevel: confidence < 0.7 ? maxRisk(riskLevel, "MEDIUM") : riskLevel,
    confidence,
    diagnosis: buildDiagnosis(input, riskLevel, dataQuality, proposals),
    actionProposals: proposals,
    manualCheckItems,
    dataQuality
  };

  return applyApprovalGuard(rawOutput);
}

export function applyApprovalGuard(output: DecisionEngineOutput): DecisionEngineOutput {
  const lowConfidence = output.confidence < 0.7;
  const restrictToSafe = lowConfidence || output.dataQuality.blocksStrongActions;
  const guardReason = lowConfidence
    ? "诊断置信度低于 0.7，只允许人工复核或继续观察。"
    : output.dataQuality.blocksStrongActions
      ? "关键数据缺失，禁止生成强动作。"
      : null;

  let proposals: ActionProposalDTO[] = output.actionProposals
    .filter((proposal) => allowedActionTypes.has(proposal.actionType))
    .filter((proposal) => !restrictToSafe || safeFallbackActions.has(proposal.actionType))
    .map((proposal) => ({
      ...proposal,
      requiresApproval: true,
      status: "PENDING_APPROVAL" as const,
      blockedReason: proposal.blockedReason ?? (restrictToSafe && !safeFallbackActions.has(proposal.actionType) ? guardReason : proposal.blockedReason)
    }));

  if (restrictToSafe && proposals.length === 0) {
    proposals = [
      makeProposal({
        actionType: "REQUEST_MANUAL_REVIEW",
        title: lowConfidence ? "低置信度人工复核" : "数据缺失人工复核",
        reason: guardReason || "需要人工复核后再进入动作审批。",
        riskLevel: "MEDIUM",
        confidence: Math.min(output.confidence, 0.69),
        blockedReason: guardReason
      })
    ];
  }

  proposals = proposals.map((proposal) => {
    const needsExplicitApproval =
      proposal.riskLevel === "HIGH" || budgetActions.has(proposal.actionType) || proposal.actionType === "PAUSE_TASK" || strongActions.has(proposal.actionType);
    return {
      ...proposal,
      requiresApproval: true,
      blockedReason: restrictToSafe ? proposal.blockedReason ?? guardReason : proposal.blockedReason
    };
  });

  return {
    ...output,
    riskLevel: restrictToSafe ? maxRisk(output.riskLevel, "MEDIUM") : output.riskLevel,
    actionProposals: dedupeProposals(proposals)
  };
}

function addSubjectChecks(input: DecisionEngineInput, manualCheckItems: ManualCheckItem[], proposals: ActionProposalDTO[]) {
  const missing: string[] = [];
  if (input.subject.subjectType === "SUBJECT_PENDING") missing.push("主体类型");
  if (input.subject.operatorType === "OPERATOR_PENDING") missing.push("操盘主体");
  if (input.subject.cooperationType === "COOPERATION_PENDING") missing.push("合作关系");
  if (input.subject.controlLevel === "PENDING") missing.push("可控程度");
  if (input.subject.confidence < 0.7) missing.push("主体置信度");

  if (!missing.length) return;
  addManualCheck(manualCheckItems, "主体识别待校准", `缺失或低置信字段：${missing.join("、")}。`);
  addProposal(proposals, {
    actionType: "REQUEST_MANUAL_REVIEW",
    title: "主体识别人工复核",
    reason: "主体不清时不得套用服务商、达人或职人专属算法。",
    riskLevel: "MEDIUM",
    confidence: 0.55,
    blockedReason: "主体字段待校准。"
  });
}

function assessDataQuality(input: DecisionEngineInput, metrics: MetricReader): DecisionDataQuality {
  const required = [
    { label: "ROI", value: metrics.firstNumber(["verify_roi", "gross_profit_roi", "pay_roi"]) },
    { label: "消耗", value: metrics.number("spend") },
    { label: "订单数", value: metrics.number("orders") },
    { label: "曝光量", value: metrics.number("impressions") },
    { label: "点击率", value: normalizeRate(metrics.number("ctr")) },
    { label: "GPM", value: metrics.number("gpm") }
  ];
  const missingFields = required.flatMap((field) => (field.value == null ? [field.label] : []));
  const lowConfidenceFields = input.subject.confidence < 0.7 ? ["subjectConfidence"] : [];
  const completeness = round((required.length - missingFields.length) / required.length, 2);
  return {
    missingFields,
    lowConfidenceFields,
    completeness,
    blocksStrongActions: missingFields.includes("ROI") || missingFields.length >= 3
  };
}

function computeConfidence(input: DecisionEngineInput, dataQuality: DecisionDataQuality) {
  const reviewMultiplier = input.dataReviewStatus === "UNREVIEWED" ? 0.8 : 1;
  return round(clamp(Math.min(input.subject.confidence, 0.4 + dataQuality.completeness * 0.5) * reviewMultiplier), 2);
}

function buildDiagnosis(
  input: DecisionEngineInput,
  riskLevel: RiskLevel,
  dataQuality: DecisionDataQuality,
  proposals: ActionProposalDTO[]
) {
  const subject = subjectLabel(input.subject.subjectType);
  const topAction = proposals[0]?.title || "继续观察";
  const missing = dataQuality.missingFields.length ? `，缺失${dataQuality.missingFields.join("、")}` : "";
  return `${subject}，风险=${riskLevel}${missing}。建议：${topAction}。`;
}

type ProposalInput = Pick<ActionProposalDTO, "actionType" | "title" | "reason" | "riskLevel" | "confidence"> &
  Partial<Pick<ActionProposalDTO, "summary" | "expectedImpact" | "blockedReason">>;

function addProposal(proposals: ActionProposalDTO[], proposal: ProposalInput) {
  proposals.push(makeProposal(proposal));
}

function makeProposal(proposal: ProposalInput): ActionProposalDTO {
  return {
    actionType: proposal.actionType,
    title: proposal.title,
    summary: proposal.summary ?? null,
    reason: proposal.reason,
    expectedImpact: proposal.expectedImpact ?? null,
    riskLevel: proposal.riskLevel,
    confidence: clamp(proposal.confidence),
    requiresApproval: true,
    status: "PENDING_APPROVAL",
    blockedReason: proposal.blockedReason ?? null
  };
}

function dedupeProposals(proposals: ActionProposalDTO[]) {
  const seen = new Set<string>();
  return proposals.filter((proposal) => {
    const key = `${proposal.actionType}:${proposal.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addManualCheck(items: ManualCheckItem[], title: string, reason: string) {
  if (items.some((item) => item.title === title)) return;
  items.push({ title, reason });
}

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return riskRank[a] >= riskRank[b] ? a : b;
}

type MetricReader = ReturnType<typeof metricReader>;

function metricReader(metrics: VisibleMetric[]) {
  const byKey = new Map<MetricKey, VisibleMetric>();
  for (const metric of metrics) {
    const key = standardizeMetricKey(metric);
    if (key === "unknown") continue;
    if (!byKey.has(key)) byKey.set(key, metric);
  }
  const readNumber = (key: MetricKey) => {
    if (key === "unknown") return null;
    const found = byKey.get(key);
    if (!found) return null;
    return parseMetricNumber(found.value);
  };

  return {
    number(key: MetricKey) {
      return readNumber(key);
    },
    firstNumber(keys: MetricKey[]) {
      for (const key of keys) {
        const value = readNumber(key);
        if (value != null) return value;
      }
      return null;
    }
  };
}

function parseMetricNumber(value: VisibleMetric["value"]) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = value.trim();
  const multiplier = text.includes("万") ? 10_000 : text.includes("千") ? 1_000 : 1;
  const cleaned = text.replace(/[¥￥,%\s,，]/g, "").replace(/[万千]/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return text.includes("%") ? parsed / 100 : parsed * multiplier;
}

function normalizeRate(value: number | null) {
  if (value == null) return null;
  return value > 1 ? value / 100 : value;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatNullable(value: number | null) {
  return value == null ? "缺失" : formatNumber(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
