import {
  budgetActionTypes,
  decisionEngineActionTypes,
  strongActionTypes,
  subjectLabel,
  standardizeMetricKey,
  type ActionProposalDTO,
  type ActionType,
  type DecisionBusinessAnalysis,
  type DecisionDataQuality,
  type DecisionEngineInput,
  type DecisionEngineOutput,
  type ManualCheckItem,
  type MetricKey,
  type RiskLevel,
  type VisibleMetric
} from "@douyin-local-life/shared";
import { analyzeInvestmentUnitTables, analyzeProductTables, buildFunnelEvidence } from "./table-analysis.js";
export { structureTaskCollectionTables } from "./table-analysis.js";

export const decisionEngineVersion = "decision-engine-v0.2.2";
export const decisionRuleVersion = "local-life-rules-v0.2.2";

const allowedActionTypes = new Set<ActionType>(decisionEngineActionTypes);
const budgetActions = new Set<ActionType>(budgetActionTypes);
const strongActions = new Set<ActionType>(strongActionTypes);
const safeFallbackActions = new Set<ActionType>(["OBSERVE", "REQUEST_MANUAL_REVIEW"]);
const riskRank: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function isManagedLiveGrowth(input: DecisionEngineInput) {
  return input.subject.operatorType === "SERVICE_PROVIDER_LIVE" || input.subject.serviceMode?.trim() === "代播";
}

function roiLabel(input: DecisionEngineInput) {
  if (isManagedLiveGrowth(input)) return "账号支付/核销 ROI";
  return input.subject.subjectType === "SERVICE_PROVIDER" ? "服务商后毛利 ROI" : "ROI";
}

function roiMetricKeys(input: DecisionEngineInput): MetricKey[] {
  if (isManagedLiveGrowth(input)) return ["verify_roi", "pay_roi"];
  return input.subject.subjectType === "SERVICE_PROVIDER" ? ["gross_profit_roi"] : ["verify_roi", "gross_profit_roi", "pay_roi"];
}

export function runDecisionRules(input: DecisionEngineInput): DecisionEngineOutput {
  const metrics = metricReader(input.metrics);
  const manualCheckItems: ManualCheckItem[] = [];
  const proposals: ActionProposalDTO[] = [];
  const managedLiveGrowth = isManagedLiveGrowth(input);
  const serviceProviderFinanceEnabled = input.subject.subjectType === "SERVICE_PROVIDER" && !managedLiveGrowth;
  const serviceProviderFinancials = calculateServiceProviderFinancials(input, metrics);
  const accountRoi = metrics.firstNumber(["verify_roi", "pay_roi"]);
  const roi =
    managedLiveGrowth
      ? accountRoi
      : input.subject.subjectType === "SERVICE_PROVIDER"
      ? serviceProviderFinancials.grossProfitRoi ?? metrics.number("gross_profit_roi")
      : metrics.firstNumber(["verify_roi", "gross_profit_roi", "pay_roi"]);
  const dataQuality = assessDataQuality(input, metrics, roi);
  let riskLevel: RiskLevel = dataQuality.blocksStrongActions ? "MEDIUM" : "LOW";
  const targetRoi = input.dataReviewStatus === "REVIEWED" && input.metricLayer === "REVIEWED_METRIC"
    ? input.targetRoi ?? metrics.number("target_roi") ?? null
    : null;
  const spend = metrics.number("spend");
  const dailyBudget = metrics.number("daily_budget");
  const recentSpend = metrics.number("recent_30m_spend");
  const orders = metrics.number("orders");
  const impressions = metrics.number("impressions");
  const clicks = metrics.number("clicks");
  const ctr = normalizeRate(metrics.number("ctr"));
  const cpa = metrics.number("cpa");
  const targetCpa = input.targetCpa ?? metrics.number("target_cpa");
  const viewers = metrics.number("live_viewers");
  const gpm = metrics.number("gpm");
  const liveDuration = metrics.number("live_duration_minutes");
  const minutesSinceAdjustment = metrics.number("minutes_since_last_adjustment");

  addSubjectChecks(input, manualCheckItems, proposals);
  if (input.dataReviewStatus !== "REVIEWED") {
    addManualCheck(manualCheckItems, "数据未人工复核", "当前数据未经过人工复核，请确认关键指标后再进行投流决策。");
  }

  riskLevel = maxRisk(riskLevel, addOperationalRiskRules(metrics, proposals));

  if (input.subject.subjectType === "SERVICE_PROVIDER") {
    if (serviceProviderFinancials.unverifiedBenefits > 0) {
      addManualCheck(manualCheckItems, "活动权益未核验", "平台代金券、补贴、投放券或消返券尚未在后台核验，不能作为直播间真实可用优惠宣传。");
      addProposal(proposals, {
        actionType: "VERIFY_ACTIVITY",
        title: "核验平台活动权益后再用于直播转化",
        reason: `检测到待核验权益 ${formatNumber(serviceProviderFinancials.unverifiedBenefits)} 元，需先确认适用商品、门店、时段和到账状态。`,
        riskLevel: "MEDIUM",
        confidence: 0.78
      });
    }
  }
  if (serviceProviderFinanceEnabled) {
    if (serviceProviderFinancials.grossProfitRoi == null) {
      addManualCheck(
        manualCheckItems,
        "服务商后毛利 ROI 缺失",
        `${accountRoi == null ? "账号支付/核销 ROI 也未采集。" : `账号支付/核销 ROI=${formatNumber(accountRoi)} 已采集，但不能代替服务商后毛利 ROI。`} 需补齐核销毛利、广告消耗、服务费和商家补贴后再判断真实盈利。`
      );
    } else {
      if (targetRoi != null && accountRoi != null && accountRoi >= targetRoi && serviceProviderFinancials.grossProfitRoi < targetRoi) {
        addProposal(proposals, {
          actionType: "RENEGOTIATE_SERVICE_FEE",
          title: "账号 ROI 达标但服务费后毛利不足",
          reason: `账号 ROI=${formatNumber(accountRoi)}，服务商后毛利 ROI=${formatNumber(serviceProviderFinancials.grossProfitRoi)}。`,
          expectedImpact: "通过复核服务费、补贴和结算方式改善真实毛利。",
          riskLevel: "MEDIUM",
          confidence: 0.82
        });
      }
    }
  }

  if (roi == null) {
    addManualCheck(
      manualCheckItems,
      managedLiveGrowth ? "账号支付/核销 ROI 缺失" : input.subject.subjectType === "SERVICE_PROVIDER" ? "服务商后毛利 ROI 缺失" : "ROI 缺失",
      managedLiveGrowth
        ? "代直播模式只用账号支付/核销 ROI 辅助判断投流成交效率；缺失时仍可分析直播承接和商品，但不下预算强结论。"
        : input.subject.subjectType === "SERVICE_PROVIDER"
        ? `${accountRoi == null ? "账号支付/核销 ROI 也未采集。" : `账号支付/核销 ROI=${formatNumber(accountRoi)} 已采集，但不能代替服务商后毛利 ROI。`} 请补齐核销毛利、服务费和商家补贴。`
        : "缺少核销 ROI、毛利 ROI 或支付 ROI 时，不输出确定性放量结论。"
    );
    addProposal(proposals, {
      actionType: "REQUEST_MANUAL_REVIEW",
      title: managedLiveGrowth ? "补齐账号支付/核销 ROI 后判断投流效率" : input.subject.subjectType === "SERVICE_PROVIDER" ? "补齐服务商后毛利 ROI" : "补齐 ROI 后再决策",
      reason: managedLiveGrowth
        ? "当前仍可输出直播流量、承接和商品建议，但缺少账号成交 ROI 时不生成依赖投流回报的预算动作。"
        : input.subject.subjectType === "SERVICE_PROVIDER"
        ? "支付 ROI 只能反映账号投放表现；缺少服务费后真实毛利，当前不生成依赖盈利判断的强动作。"
        : "ROI 缺失，当前只能进入人工复核。",
      riskLevel: "MEDIUM",
      confidence: 0.62
    });
    riskLevel = maxRisk(riskLevel, "MEDIUM");
  } else if (roi < 1) {
    riskLevel = maxRisk(riskLevel, "HIGH");
    addProposal(proposals, {
      actionType: "PAUSE_TASK",
      title: "ROI 低于 1，暂停跑量待复核",
      reason: `当前${managedLiveGrowth ? "账号支付/核销 " : input.subject.subjectType === "SERVICE_PROVIDER" ? "服务商后毛利 " : ""}ROI=${formatNumber(roi)}，低于 1。`,
      expectedImpact: managedLiveGrowth ? "先控制无效消耗，人工核对流量、商品和直播间成交链路。" : "阻止亏损继续扩大，等待人工核对成本与核销链路。",
      riskLevel: "HIGH",
      confidence: 0.86
    });
  } else if (targetRoi != null && roi < targetRoi) {
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
      reason: managedLiveGrowth ? "账号成交 ROI 低于目标时，应核对目标值、流量质量、商品权益和直播间承接是否匹配。" : "ROI 低于目标时，应检查目标 ROI 是否与毛利、补贴和服务费后一致。",
      riskLevel: "MEDIUM",
      confidence: 0.72
    });
  }

  if (spend != null && orders != null) {
    if (spend > 0 && orders === 0) {
      const minimumSpend = Math.max(100, targetCpa ?? 0, dailyBudget ? dailyBudget * 0.05 : 0);
      const matureSample = spend >= minimumSpend && ((liveDuration ?? 0) >= 30 || (clicks ?? 0) >= 100 || (viewers ?? 0) >= 1000);
      if (matureSample) {
        riskLevel = maxRisk(riskLevel, "HIGH");
        addProposal(proposals, {
          actionType: "PAUSE_TASK",
          title: "有效样本下有消耗但订单为 0",
          reason: `当前消耗=${formatNumber(spend)}，最低判断消耗=${formatNumber(minimumSpend)}，订单数=0。`,
          expectedImpact: "先阻断成熟样本下的持续空耗，再人工核对直播间承接和商品链路。",
          riskLevel: "HIGH",
          confidence: 0.88
        });
      } else {
        riskLevel = maxRisk(riskLevel, "MEDIUM");
        addManualCheck(manualCheckItems, "零订单样本不足", "当前消耗、开播时长、点击或观看样本不足，不能直接建议暂停跑量。");
        addProposal(proposals, {
          actionType: "OBSERVE",
          title: "零订单但样本不足，继续观察",
          reason: `当前消耗=${formatNumber(spend)}，尚未达到最低判断消耗 ${formatNumber(minimumSpend)}。`,
          riskLevel: "MEDIUM",
          confidence: 0.66
        });
      }
      addProposal(proposals, {
        actionType: "CHECK_LIVE_ROOM",
        title: "检查直播间承接",
        reason: "有消耗无订单时，优先检查讲解、商品点击、下单链路和库存预约。",
        riskLevel: "HIGH",
        confidence: 0.8
      });
    } else if (dailyBudget != null && dailyBudget > 0) {
      const spendRatio = spend / dailyBudget;
      const fastSpend = recentSpend != null ? recentSpend / dailyBudget >= 0.2 : spendRatio >= 0.8 && liveDuration != null && liveDuration <= 120;
      if (fastSpend && orders <= 1) {
        riskLevel = maxRisk(riskLevel, "MEDIUM");
        addProposal(proposals, {
          actionType: "OBSERVE",
          title: "消耗偏快但转化不足",
          reason: `消耗已达预算 ${formatPercent(spendRatio)}，订单数=${formatNumber(orders)}。`,
          expectedImpact: "进入观察，等待人工确认是否降预算。",
          riskLevel: "MEDIUM",
          confidence: 0.72
        });
        if (minutesSinceAdjustment == null || minutesSinceAdjustment >= 30) {
          addProposal(proposals, {
            actionType: "DECREASE_BUDGET",
            title: "转化不足时降低预算待审批",
            reason: "消耗过快且订单不足，建议人工审批后控制预算。",
            riskLevel: "MEDIUM",
            confidence: 0.7
          });
        } else {
          addManualCheck(manualCheckItems, "调价冷却中", `距上次调价仅 ${formatNumber(minutesSinceAdjustment)} 分钟，暂不重复调整预算。`);
        }
      }

      if (spendRatio <= 0.1 && (impressions == null || impressions < 1000) && (liveDuration ?? 0) >= 60) {
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
  const finalRiskLevel = confidence < 0.7 ? maxRisk(riskLevel, "MEDIUM") : riskLevel;
  const rawOutput: DecisionEngineOutput = {
    riskLevel: finalRiskLevel,
    confidence,
    diagnosis: buildDiagnosis(input, finalRiskLevel, dataQuality, proposals, serviceProviderFinancials),
    actionProposals: proposals,
    manualCheckItems,
    dataQuality,
    businessAnalysis: buildBusinessAnalysis(input, metrics, dataQuality, serviceProviderFinancials, accountRoi, targetRoi),
    calculatedMetrics:
      serviceProviderFinanceEnabled
        ? {
            serviceProviderAfterCost: serviceProviderFinancials.afterCost,
            serviceProviderGrossProfitRoi: serviceProviderFinancials.grossProfitRoi,
            verifiedPlatformBenefits: serviceProviderFinancials.verifiedBenefits,
            evidence: serviceProviderFinancials.evidence
          }
        : undefined
  };

  const guarded = applyApprovalGuard(rawOutput);
  return {
    ...guarded,
    diagnosis: buildDiagnosis(input, guarded.riskLevel, dataQuality, guarded.actionProposals, serviceProviderFinancials)
  };
}

export function applyApprovalGuard(output: DecisionEngineOutput): DecisionEngineOutput {
  const lowConfidence = output.confidence < 0.7;
  const restrictToSafe = lowConfidence || output.dataQuality.globalSafetyBlock === true;
  const guardReason = lowConfidence
    ? "诊断置信度低于 0.7，只允许人工复核或继续观察。"
    : output.dataQuality.globalSafetyBlock
      ? "全局安全证据不足，禁止生成强动作。"
      : null;
  const blockedByEvidence: string[] = [];

  let proposals: ActionProposalDTO[] = output.actionProposals
    .filter((proposal) => allowedActionTypes.has(proposal.actionType))
    .filter((proposal) => !restrictToSafe || safeFallbackActions.has(proposal.actionType))
    .filter((proposal) => {
      if (safeFallbackActions.has(proposal.actionType)) return true;
      const eligibility = output.dataQuality.actionEligibility?.[proposal.actionType];
      if (!eligibility || eligibility.eligible) return true;
      blockedByEvidence.push(...eligibility.blockingEvidence, ...eligibility.missingEvidence);
      return false;
    })
    .map((proposal) => ({
      ...proposal,
      requiresApproval: true,
      status: "PENDING_APPROVAL" as const,
      blockedReason: proposal.blockedReason ?? (restrictToSafe && !safeFallbackActions.has(proposal.actionType) ? guardReason : proposal.blockedReason)
    }));

  if ((restrictToSafe || blockedByEvidence.length > 0) && !proposals.some((proposal) => proposal.actionType === "REQUEST_MANUAL_REVIEW")) {
    proposals = [
      ...proposals,
      makeProposal({
        actionType: "REQUEST_MANUAL_REVIEW",
        title: lowConfidence ? "低置信度人工复核" : "动作证据待补齐",
        reason: guardReason || [...new Set(blockedByEvidence)].join("；") || "需要人工复核后再进入动作审批。",
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
  const missing = assessSubjectReadiness(input).issues;

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

function calculateServiceProviderFinancials(input: DecisionEngineInput, metrics: MetricReader) {
  if (input.subject.subjectType !== "SERVICE_PROVIDER") {
    return { afterCost: null, grossProfitRoi: null, verifiedBenefits: 0, unverifiedBenefits: 0, evidence: [] as string[] };
  }
  const spend = metrics.number("spend");
  const serviceFee = metrics.number("service_fee") ?? input.subject.serviceFee;
  const merchantSubsidy = metrics.number("merchant_subsidy") ?? 0;
  const grossProfit = metrics.number("gross_profit");
  const benefits = (metrics.number("platform_subsidy") ?? 0) + (metrics.number("ad_coupon") ?? 0) + (metrics.number("rebate_coupon") ?? 0);
  const activityVerified = parseBooleanMetric(metrics.metric("activity_verified"));
  const verifiedBenefits = activityVerified === true ? benefits : 0;
  const unverifiedBenefits = benefits - verifiedBenefits;
  const afterCost = spend != null && serviceFee != null ? Math.max(0, spend + serviceFee + merchantSubsidy - verifiedBenefits) : null;
  const grossProfitRoi = afterCost != null && afterCost > 0 && grossProfit != null ? grossProfit / afterCost : null;
  const evidence = [
    `广告消耗=${formatNullable(spend)}`,
    `服务费=${formatNullable(serviceFee ?? null)}`,
    `商家补贴=${formatNumber(merchantSubsidy)}`,
    `已核验平台权益=${formatNumber(verifiedBenefits)}`,
    `核销毛利=${formatNullable(grossProfit)}`
  ];
  return { afterCost, grossProfitRoi, verifiedBenefits, unverifiedBenefits, evidence };
}

function addOperationalRiskRules(metrics: MetricReader, proposals: ActionProposalDTO[]): RiskLevel {
  const rating = metrics.number("store_rating");
  const complaintRate = normalizeRate(metrics.number("complaint_rate"));
  const refundRate = normalizeRate(metrics.number("refund_rate"));
  const fulfillmentRate = normalizeRate(metrics.number("fulfillment_exception_rate"));
  const inventory = metrics.number("inventory_capacity");
  const promiseRisk = parseBooleanMetric(metrics.metric("wrong_price_promise_risk"));
  const severeFacts = [
    ...(promiseRisk === true ? ["存在错价、虚假承诺或承诺不清风险"] : []),
    ...(rating != null && rating < 4 ? [`门店评分=${formatNumber(rating)}`] : []),
    ...(complaintRate != null && complaintRate >= 0.03 ? [`投诉率=${formatPercent(complaintRate)}`] : []),
    ...(refundRate != null && refundRate >= 0.15 ? [`退款率=${formatPercent(refundRate)}`] : []),
    ...(fulfillmentRate != null && fulfillmentRate >= 0.05 ? [`履约异常率=${formatPercent(fulfillmentRate)}`] : []),
    ...(inventory != null && inventory <= 0 ? ["库存/预约承接不足"] : [])
  ];
  const moderateFacts = [
    ...(complaintRate != null && complaintRate >= 0.01 && complaintRate < 0.03 ? [`投诉率=${formatPercent(complaintRate)}`] : []),
    ...(refundRate != null && refundRate >= 0.08 && refundRate < 0.15 ? [`退款率=${formatPercent(refundRate)}`] : []),
    ...(fulfillmentRate != null && fulfillmentRate >= 0.02 && fulfillmentRate < 0.05 ? [`履约异常率=${formatPercent(fulfillmentRate)}`] : [])
  ];

  if (severeFacts.length > 0) {
    addProposal(proposals, {
      actionType: "PAUSE_TASK",
      title: "口碑/履约高风险，暂停跑量待整改",
      reason: severeFacts.join("；"),
      expectedImpact: "避免在客诉、履约或承接异常期间继续放大风险。",
      riskLevel: "HIGH",
      confidence: 0.9
    });
    addProposal(proposals, {
      actionType: "REPAIR_REPUTATION",
      title: "优先修复口碑与履约",
      reason: severeFacts.join("；"),
      riskLevel: "HIGH",
      confidence: 0.88
    });
    addProposal(proposals, {
      actionType: "ADJUST_SERVICE_PROVIDER_SOP",
      title: "整改服务商话术与场控 SOP",
      reason: "检查错价、承诺、库存预约、客诉处理和场控执行记录。",
      riskLevel: "HIGH",
      confidence: 0.84
    });
    if (inventory != null && inventory <= 0) {
      addProposal(proposals, {
        actionType: "CHECK_INVENTORY_BOOKING",
        title: "检查库存与预约承接",
        reason: "当前库存或预约承接量不足。",
        riskLevel: "HIGH",
        confidence: 0.9
      });
    }
    return "HIGH";
  }

  if (moderateFacts.length > 0) {
    addProposal(proposals, {
      actionType: "REPAIR_REPUTATION",
      title: "口碑履约指标上升，先整改再扩量",
      reason: moderateFacts.join("；"),
      riskLevel: "MEDIUM",
      confidence: 0.78
    });
    addProposal(proposals, {
      actionType: "ADJUST_SERVICE_PROVIDER_SOP",
      title: "复核服务商执行 SOP",
      reason: "检查讲解、核销说明、预约承接和客诉处理流程。",
      riskLevel: "MEDIUM",
      confidence: 0.75
    });
    return "MEDIUM";
  }
  return "LOW";
}

function assessDataQuality(input: DecisionEngineInput, metrics: MetricReader, selectedRoi: number | null): DecisionDataQuality {
  const selectedRoiLabel = roiLabel(input);
  const required = [
    { label: selectedRoiLabel, value: selectedRoi },
    { label: "消耗", value: metrics.number("spend") },
    { label: "订单数", value: metrics.number("orders") },
    { label: "曝光量", value: metrics.number("impressions") },
    { label: "点击率", value: normalizeRate(metrics.number("ctr")) },
    { label: "GPM", value: metrics.number("gpm") }
  ];
  const missingFields = required.flatMap((field) => (field.value == null ? [field.label] : []));
  const criticalMetricKeys: Array<{ key: MetricKey; label: string }> = [
    { key: "spend", label: "消耗" },
    { key: "orders", label: "订单数" },
    { key: "impressions", label: "曝光量" },
    { key: "ctr", label: "点击率" },
    { key: "gpm", label: "GPM" }
  ];
  const roiMetric = metrics.firstMetric(roiMetricKeys(input));
  const serviceGrossProfitMetric = input.subject.subjectType === "SERVICE_PROVIDER" && !isManagedLiveGrowth(input) ? metrics.metric("gross_profit") : null;
  const lowConfidenceFields = [
    ...(roiMetric && metricConfidence(roiMetric) < 0.7 ? [selectedRoiLabel] : []),
    ...(serviceGrossProfitMetric && metricConfidence(serviceGrossProfitMetric) < 0.7 ? ["核销毛利"] : []),
    ...criticalMetricKeys.flatMap(({ key, label }) => {
      const metric = metrics.metric(key);
      return metric && metricConfidence(metric) < 0.7 ? [label] : [];
    })
  ];
  const subject = assessSubjectReadiness(input);
  const reviewReady = input.dataReviewStatus === "REVIEWED";
  const globalBlockingReasons = [
    ...(!subject.ready ? ["主体识别未完成"] : []),
    ...(!reviewReady ? ["数据未人工复核"] : []),
    ...(input.collectionQuality?.missingRoutes.length ? [`采集路线缺失：${input.collectionQuality.missingRoutes.join("、")}`] : []),
    ...(input.collectionQuality?.staleRoutes.length ? [`采集路线已过期：${input.collectionQuality.staleRoutes.join("、")}`] : [])
  ];
  const actionEligibility = Object.fromEntries(
    decisionEngineActionTypes.map((actionType) => [actionType, assessActionEligibility(actionType, input, metrics, selectedRoi, globalBlockingReasons)])
  ) as NonNullable<DecisionDataQuality["actionEligibility"]>;
  const blockingReasons = [
    ...globalBlockingReasons,
    ...(missingFields.includes(selectedRoiLabel)
      ? [`${selectedRoiLabel} 缺失，仅阻断依赖${isManagedLiveGrowth(input) ? "投流成交效率" : "真实盈利"}判断的动作`]
      : []),
    ...(missingFields.length >= 3 ? ["关键指标缺失较多，按动作证据降级"] : []),
    ...(lowConfidenceFields.length ? [`低置信字段：${lowConfidenceFields.join("、")}`] : [])
  ];
  const completeness = round((required.length - missingFields.length) / required.length, 2);
  return {
    missingFields,
    lowConfidenceFields,
    blockingReasons,
    subjectReady: subject.ready,
    reviewReady,
    completeness,
    blocksStrongActions: globalBlockingReasons.length > 0,
    globalSafetyBlock: globalBlockingReasons.length > 0,
    actionEligibility,
    blockingEvidence: globalBlockingReasons,
    missingEvidence: missingFields,
    collectionQuality: input.collectionQuality
  };
}

function assessActionEligibility(
  actionType: ActionType,
  input: DecisionEngineInput,
  metrics: MetricReader,
  selectedRoi: number | null,
  globalBlockingReasons: string[]
) {
  const selectedRoiLabel = roiLabel(input);
  const safe = safeFallbackActions.has(actionType) || ["KEEP_BUDGET", "CHECK_LIVE_ROOM", "CHECK_CREATIVE", "CHECK_AUDIENCE", "VERIFY_ACTIVITY", "CALIBRATE_SUBJECT"].includes(actionType);
  const requirements: Partial<Record<ActionType, Array<{ key: MetricKey | "roi"; label: string }>>> = {
    INCREASE_BUDGET: [{ key: "roi", label: selectedRoiLabel }, { key: "spend", label: "消耗" }, { key: "orders", label: "订单数" }, { key: "impressions", label: "曝光量" }, { key: "ctr", label: "点击率" }],
    DECREASE_BUDGET: [{ key: "roi", label: selectedRoiLabel }, { key: "spend", label: "消耗" }, { key: "orders", label: "订单数" }],
    DECREASE_BID: [{ key: "roi", label: selectedRoiLabel }, { key: "spend", label: "消耗" }],
    ADJUST_ROI_TARGET: [{ key: "roi", label: selectedRoiLabel }, { key: "target_roi", label: "目标ROI" }],
    PAUSE_TASK: [{ key: "roi", label: selectedRoiLabel }, { key: "spend", label: "消耗" }, { key: "orders", label: "订单数" }],
    FINE_TUNE_TARGETING: [{ key: "impressions", label: "曝光量" }, { key: "clicks", label: "点击量" }, { key: "orders", label: "订单数" }]
  };
  const required = requirements[actionType] || [];
  const missingEvidence = required.flatMap((requirement) => {
    const metric = requirement.key === "roi" ? selectedRoi : metrics.number(requirement.key);
    return metric == null ? [requirement.label] : [];
  });
  const lowConfidenceEvidence = required.flatMap((requirement) => {
    if (requirement.key === "roi") {
      const metric = metrics.firstMetric(roiMetricKeys(input));
      return metric && metricConfidence(metric) < 0.7 ? ["ROI置信度不足"] : [];
    }
    const metric = metrics.metric(requirement.key);
    return metric && metricConfidence(metric) < 0.7 ? [`${requirement.label}置信度不足`] : [];
  });
  const maxDataAgeMs = volatileAction(actionType) ? 90_000 : structuralAction(actionType) ? 30 * 60_000 : 5 * 60_000;
  const oldestAgeMs = input.collectionQuality?.routes.reduce((max, route) => Math.max(max, route.ageMs || 0), 0) || 0;
  const staleEvidence = oldestAgeMs > maxDataAgeMs ? [`数据年龄 ${oldestAgeMs}ms 超过动作上限 ${maxDataAgeMs}ms`] : [];
  const blockingEvidence = [...(!safe ? globalBlockingReasons : []), ...lowConfidenceEvidence, ...staleEvidence];
  return { eligible: safe || (blockingEvidence.length === 0 && missingEvidence.length === 0), blockingEvidence, missingEvidence, maxDataAgeMs };
}

function volatileAction(actionType: ActionType) {
  return ["INCREASE_BUDGET", "DECREASE_BUDGET", "DECREASE_BID", "PAUSE_TASK", "ADJUST_ROI_TARGET"].includes(actionType);
}

function structuralAction(actionType: ActionType) {
  return ["ADJUST_SERVICE_PROVIDER_SOP", "RENEGOTIATE_SERVICE_FEE", "REPAIR_REPUTATION", "CHECK_INVENTORY_BOOKING"].includes(actionType);
}

function parseBooleanMetric(metric: VisibleMetric | null) {
  if (!metric || metric.value == null) return null;
  if (typeof metric.value === "number") return metric.value > 0;
  const normalized = metric.value.trim().toLowerCase();
  if (["1", "true", "yes", "是", "有", "已核验", "存在", "高风险"].includes(normalized)) return true;
  if (["0", "false", "no", "否", "无", "未核验", "不存在", "正常"].includes(normalized)) return false;
  return null;
}

function assessSubjectReadiness(input: DecisionEngineInput) {
  const issues: string[] = [];
  const subject = input.subject;
  if (subject.subjectType === "SUBJECT_PENDING") issues.push("主体类型");
  if (subject.operatorType === "OPERATOR_PENDING") issues.push("操盘主体");
  if (subject.cooperationType === "COOPERATION_PENDING") issues.push("合作关系");
  if (subject.confidence < 0.7) issues.push("主体置信度");

  const compatibleOperators: Partial<Record<
    DecisionEngineInput["subject"]["subjectType"],
    DecisionEngineInput["subject"]["operatorType"][]
  >> = {
    MERCHANT_OFFICIAL: ["MERCHANT_SELF"],
    PROFESSIONAL: ["MERCHANT_SELF"],
    EXTERNAL_CREATOR: ["CREATOR_SELF"],
    CREATOR_MATRIX: ["AGENCY_LEADER"],
    SERVICE_PROVIDER: ["SERVICE_PROVIDER_LIVE", "SERVICE_PROVIDER_OPERATION"],
    PLATFORM_EVENT: ["PLATFORM_OPERATION"],
    BRAND_REGION_MATRIX: ["BRAND_REGION"]
  };
  const compatibleCooperations: Partial<Record<
    DecisionEngineInput["subject"]["subjectType"],
    DecisionEngineInput["subject"]["cooperationType"][]
  >> = {
    MERCHANT_OFFICIAL: ["NONE"],
    PROFESSIONAL: ["PROFESSIONAL_BINDING"],
    EXTERNAL_CREATOR: ["CREATOR_COOPERATION"],
    CREATOR_MATRIX: ["CREATOR_COOPERATION"],
    SERVICE_PROVIDER: ["SERVICE_PROVIDER_CONTRACT"],
    PLATFORM_EVENT: ["PLATFORM_INVITATION"],
    BRAND_REGION_MATRIX: ["BRAND_MATRIX"]
  };
  const operators = compatibleOperators[subject.subjectType];
  if (operators && !operators.includes(subject.operatorType)) issues.push("主体与操盘主体不一致");
  const cooperations = compatibleCooperations[subject.subjectType];
  if (cooperations && !cooperations.includes(subject.cooperationType)) issues.push("主体与合作关系不一致");
  if (subject.subjectType === "SERVICE_PROVIDER") {
    if (!subject.serviceProviderName?.trim()) issues.push("服务商名称");
  }
  return { ready: issues.length === 0, issues: [...new Set(issues)] };
}

function computeConfidence(input: DecisionEngineInput, dataQuality: DecisionDataQuality) {
  const reviewMultiplier = input.dataReviewStatus === "UNREVIEWED" ? 0.8 : 1;
  return round(clamp(Math.min(input.subject.confidence, 0.4 + dataQuality.completeness * 0.5) * reviewMultiplier), 2);
}

function buildDiagnosis(
  input: DecisionEngineInput,
  riskLevel: RiskLevel,
  dataQuality: DecisionDataQuality,
  proposals: ActionProposalDTO[],
  serviceProviderFinancials?: { afterCost: number | null; grossProfitRoi: number | null }
) {
  const subject = subjectLabel(input.subject.subjectType);
  const topAction = proposals[0]?.title || "继续观察";
  const missing = dataQuality.missingFields.length ? `，缺失${dataQuality.missingFields.join("、")}` : "";
  const serviceCost =
    input.subject.subjectType === "SERVICE_PROVIDER" && !isManagedLiveGrowth(input) && serviceProviderFinancials?.afterCost != null
      ? `，服务商后成本=${formatNumber(serviceProviderFinancials.afterCost)}，毛利ROI=${formatNullable(serviceProviderFinancials.grossProfitRoi)}`
      : "";
  return `${subject}，风险=${riskLevel}${serviceCost}${missing}。建议：${topAction}。`;
}

function buildBusinessAnalysis(
  input: DecisionEngineInput,
  metrics: MetricReader,
  dataQuality: DecisionDataQuality,
  serviceProviderFinancials: ReturnType<typeof calculateServiceProviderFinancials>,
  accountRoi: number | null,
  targetRoi: number | null
): DecisionBusinessAnalysis {
  const managedLiveGrowth = isManagedLiveGrowth(input);
  const spend = metrics.number("spend");
  const orders = metrics.number("orders");
  const impressions = metrics.number("impressions");
  const clicks = metrics.number("clicks");
  const ctr = normalizeRate(metrics.number("ctr"));
  const viewers = metrics.number("live_viewers");
  const gpm = metrics.number("gpm");
  const gmv = metrics.number("gmv");
  const naturalViews = metrics.number("hourly_natural_live_views");
  const commercialViews = metrics.number("hourly_commercial_live_views");
  const promiseRisk = parseBooleanMetric(metrics.metric("wrong_price_promise_risk"));
  const refundRate = normalizeRate(metrics.number("refund_rate"));
  const complaintRate = normalizeRate(metrics.number("complaint_rate"));
  const performanceSnapshot = [
    ...fact("广告消耗", spend, "元"),
    ...fact("成交订单", orders),
    ...fact("账号支付/核销 ROI", accountRoi),
    ...fact("曝光", impressions),
    ...fact("点击", clicks),
    ...(ctr == null ? [] : [`点击率=${formatPercent(ctr)}`]),
    ...fact("直播观看", viewers),
    ...fact("GPM", gpm),
    ...fact("成交金额", gmv, "元"),
    ...(serviceProviderFinancials.verifiedBenefits > 0 || serviceProviderFinancials.unverifiedBenefits > 0
      ? [`平台活动权益：已核验=${formatNumber(serviceProviderFinancials.verifiedBenefits)}元，待核验=${formatNumber(serviceProviderFinancials.unverifiedBenefits)}元`]
      : []),
    ...(naturalViews == null && commercialViews == null
      ? []
      : [`小时流量：自然=${formatNullable(naturalViews)}，商业=${formatNullable(commercialViews)}`])
  ];
  const findings: DecisionBusinessAnalysis["findings"] = [];
  const recommendations: DecisionBusinessAnalysis["recommendations"] = [];

  if (dataQuality.missingFields.length > 0) {
    findings.push({
      dimension: "DATA_QUALITY",
      title: "部分关键证据缺失",
      conclusion: "可以做方向性诊断，但缺失字段对应的放量、降量或盈利结论不能下死判断。",
      evidence: dataQuality.missingFields.map((field) => `${field}未采集或未形成可信指标`),
      riskLevel: "MEDIUM"
    });
    addBusinessRecommendation(recommendations, {
      priority: "P0",
      dimension: "DATA_QUALITY",
      title: "先补齐影响判断的关键指标",
      reason: `当前缺少${dataQuality.missingFields.join("、")}，继续凭单一指标调整会把流量获取、直播承接和商品成交问题混在一起。`,
      evidence: dataQuality.missingFields.map((field) => `${field}未采集或未形成可信指标`),
      steps: ["回到对应数据大屏重新采集缺失分栏", "人工复核字段口径和统计时间窗", "补齐后重新运行诊断并与本次结果对比"],
      verifyMetrics: dataQuality.missingFields,
      ruleBoundary: "只补采可见页面和白名单指标，不读取认证信息，不自动操作平台。"
    });
  }

  if (input.subject.subjectType === "SERVICE_PROVIDER" && !managedLiveGrowth) {
    if (serviceProviderFinancials.grossProfitRoi == null) {
      findings.push({
        dimension: "PROFITABILITY",
        title: "账号投放表现不能代表服务商真实盈利",
        conclusion: "当前无法判断这场直播对服务商是否赚钱；支付/核销 ROI 只能说明账号侧成交效率。",
        evidence: [
          accountRoi == null ? "账号支付/核销 ROI 也缺失" : `账号支付/核销 ROI=${formatNumber(accountRoi)}`,
          ...serviceProviderFinancials.evidence
        ],
        riskLevel: "MEDIUM"
      });
      addBusinessRecommendation(recommendations, {
        priority: "P0",
        dimension: "PROFITABILITY",
        title: "建立服务商盈利底线后再决定是否放量",
        reason: "服务商后毛利 ROI 用核销毛利除以广告消耗、分摊服务费和商家补贴扣除已核验平台补贴后的真实投入，能识别“账号 ROI 好看但服务商亏钱”。",
        evidence: [accountRoi == null ? "账号支付/核销 ROI 缺失" : `账号支付/核销 ROI=${formatNumber(accountRoi)}`, ...serviceProviderFinancials.evidence],
        steps: ["录入本次统计窗口的核销毛利", "核对广告消耗、分摊服务费和商家补贴", "只把后台已核验的平台补贴/投放券计入抵扣", "重新计算后再人工审批预算动作"],
        verifyMetrics: ["服务商后毛利 ROI", "本次真实投入", "核销毛利"],
        ruleBoundary: "未核验补贴不抵扣成本；系统不自动改预算，最终由人工审批和执行。"
      });
    } else {
      const belowTarget = targetRoi != null && serviceProviderFinancials.grossProfitRoi < targetRoi;
      findings.push({
        dimension: "PROFITABILITY",
        title: belowTarget ? "服务商真实毛利低于目标" : "服务商真实毛利达到当前目标",
        conclusion: belowTarget ? "优先优化成本、商品毛利或核销质量，再讨论扩大消耗。" : "盈利底线暂时成立，但仍需结合流量和直播承接判断能否扩量。",
        evidence: [
          `服务商后毛利 ROI=${formatNumber(serviceProviderFinancials.grossProfitRoi)}`,
          targetRoi == null ? "目标 ROI 缺失" : `目标 ROI=${formatNumber(targetRoi)}`
        ],
        riskLevel: belowTarget ? "HIGH" : "LOW"
      });
    }
  }

  if (impressions != null && ctr != null) {
    const lowCtr = impressions >= 10_000 && ctr < 0.01;
    findings.push({
      dimension: "TRAFFIC",
      title: lowCtr ? "有曝光但点击承接偏弱" : "流量入口已有可分析样本",
      conclusion: lowCtr ? "优先检查素材首屏、利益点表达和人群匹配，不应直接把问题归因于预算不足。" : "暂未触发高曝光低点击规则，继续结合商业/自然流量结构观察。",
      evidence: [`曝光=${formatNumber(impressions)}`, `点击率=${formatPercent(ctr)}`],
      riskLevel: lowCtr ? "MEDIUM" : "LOW"
    });
    if (lowCtr) {
      addBusinessRecommendation(recommendations, {
        priority: "P1",
        dimension: "TRAFFIC",
        title: "拆分测试素材卖点与人群，不先粗暴加预算",
        reason: "曝光已形成但点击率偏低，瓶颈更可能在进房动机或人群匹配。",
        evidence: [`曝光=${formatNumber(impressions)}`, `点击率=${formatPercent(ctr)}`],
        steps: ["保留当前预算作为对照", "一次只替换一个首屏卖点或素材变量", "同步记录同时间窗曝光、点击率、进房成本和订单", "样本稳定后人工决定保留或回退"],
        verifyMetrics: ["曝光", "点击率", "进房/点击成本", "订单"],
        ruleBoundary: "素材、标题和利益点必须与真实商品及履约条件一致，不使用无法兑现的承诺。"
      });
    }
  } else {
    findings.push({
      dimension: "TRAFFIC",
      title: "流量获取链路证据不足",
      conclusion: "缺少曝光或点击率，当前不能区分“没拿到流量”和“拿到流量但没人进房”。",
      evidence: [impressions == null ? "曝光缺失" : `曝光=${formatNumber(impressions)}`, ctr == null ? "点击率缺失" : `点击率=${formatPercent(ctr)}`],
      riskLevel: "MEDIUM"
    });
  }

  const conversionWeak = orders != null && orders <= 1 && ((clicks ?? 0) >= 500 || (viewers ?? 0) >= 5000);
  if (conversionWeak || gpm == null) {
    findings.push({
      dimension: "LIVE_ROOM",
      title: conversionWeak ? "观看/点击已有量，但成交承接偏弱" : "直播间单位流量变现效率待补证",
      conclusion: conversionWeak ? "先检查讲解节奏、商品点击、价格权益、库存预约和下单链路，再调整投流。" : "缺少 GPM，无法判断相同流量进入直播间后能产生多少成交金额。",
      evidence: [`观看=${formatNullable(viewers)}`, `点击=${formatNullable(clicks)}`, `订单=${formatNullable(orders)}`, `GPM=${formatNullable(gpm)}`],
      riskLevel: conversionWeak ? "HIGH" : "MEDIUM"
    });
    if (conversionWeak) {
      addBusinessRecommendation(recommendations, {
        priority: "P0",
        dimension: "LIVE_ROOM",
        title: "用一轮讲解闭环验证直播间承接",
        reason: "流量已经进入但订单不足，继续加流量可能只会放大空耗。",
        evidence: [`观看=${formatNullable(viewers)}`, `点击=${formatNullable(clicks)}`, `订单=${formatNullable(orders)}`, `GPM=${formatNullable(gpm)}`],
        steps: ["选定一个已采集的主推商品，核对页面已披露的价格和适用范围", "按痛点—权益—凭证—下单路径完成一轮真实讲解", "保持投流变量稳定，记录讲解前后商品点击、订单和 GPM", "若指标无改善，再分别测试商品、人群或素材变量"],
        verifyMetrics: ["商品点击", "订单", "GPM"],
        ruleBoundary: "口播与商品页面必须一致；只引用已核验的价格、适用范围和履约限制。"
      });
    }
  } else {
    findings.push({
      dimension: "LIVE_ROOM",
      title: "直播间已有成交与 GPM 证据",
      conclusion: "可继续观察同一统计窗口下的 GPM、订单成本和核销质量，避免只看瞬时成交。",
      evidence: [`订单=${formatNullable(orders)}`, `GPM=${formatNullable(gpm)}`],
      riskLevel: "LOW"
    });
  }

  const productAnalysis = analyzeProductTables(input.tables);
  if (productAnalysis.status === "MISSING_COLUMNS") {
    findings.push({
      dimension: "PRODUCT",
      title: "商品表缺少可用于单品诊断的列",
      conclusion: "当前不生成商品角色模板，也不对商品做虚假排名；补齐缺列后再重新诊断。",
      evidence: productAnalysis.missingColumns.map((column) => `缺少列：${column}`),
      riskLevel: "MEDIUM"
    });
  } else if (productAnalysis.status === "INSUFFICIENT_SAMPLE") {
    findings.push({
      dimension: "PRODUCT",
      title: "商品表样本不足，暂不做角色排名",
      conclusion: "极小样本、分母为零或异常比例已从排名中排除。",
      evidence: productAnalysis.evidence,
      riskLevel: "MEDIUM"
    });
  } else if (productAnalysis.status === "READY") {
    addBusinessRecommendation(recommendations, {
      priority: conversionWeak ? "P0" : "P1",
      dimension: "PRODUCT",
      title: `商品验证顺序：${productAnalysis.traffic.name} → ${productAnalysis.primary.name} → ${productAnalysis.acceptance.name}（引流款 → 主推款 → 承接款）`,
      reason: `先测试引流款“${productAnalysis.traffic.name}”，再验证主推款“${productAnalysis.primary.name}”和承接款“${productAnalysis.acceptance.name}”；角色来自当前商品全集的保守相对评分。`,
      evidence: productAnalysis.evidence,
      steps: [
        `第一轮先测试引流款“${productAnalysis.traffic.name}”，保持总投流与其他商品不变`,
        `第二轮把主推款“${productAnalysis.primary.name}”接在引流款后，观察支付订单和成交金额`,
        `第三轮用承接款“${productAnalysis.acceptance.name}”承接详情访问与提单流量`,
        "每轮只改变商品顺序、权益或讲解中的一个变量；任一轮样本不足或关键效率下降即停止并回退"
      ],
      verifyMetrics: ["单品曝光", "单品点击", "详情访问", "提单访问", "支付订单", "成交金额"],
      ruleBoundary: "只使用当前已采集商品表；不推断库存、退款、核销或未采集的履约信息，所有调整由人工完成。"
    });
  }

  if (serviceProviderFinancials.verifiedBenefits > 0 || serviceProviderFinancials.unverifiedBenefits > 0) {
    addBusinessRecommendation(recommendations, {
      priority: serviceProviderFinancials.unverifiedBenefits > 0 ? "P0" : "P1",
      dimension: "PRODUCT",
      title: serviceProviderFinancials.unverifiedBenefits > 0 ? "先核验代金券等平台权益，再进入直播口播" : "把已核验平台权益用于主推商品转化",
      reason: serviceProviderFinancials.unverifiedBenefits > 0
        ? `存在 ${formatNumber(serviceProviderFinancials.unverifiedBenefits)} 元待核验权益，未确认适用范围前宣传会造成价格或履约风险。`
        : `已有 ${formatNumber(serviceProviderFinancials.verifiedBenefits)} 元平台活动权益，可作为真实到手价和下单理由的一部分。`,
      evidence: [`已核验平台权益=${formatNumber(serviceProviderFinancials.verifiedBenefits)}元`, `待核验平台权益=${formatNumber(serviceProviderFinancials.unverifiedBenefits)}元`],
      steps: ["在后台核对权益到账状态、有效期、适用商品、门店、时段和用户门槛", "只对已核验权益计算并展示真实到手价", "将权益放进主推商品讲解和商品卡，但保留完整使用限制", "对比使用权益前后的商品点击、支付订单、GPM和退款"],
      verifyMetrics: ["权益核验状态", "商品点击率", "支付订单", "GPM", "退款率"],
      ruleBoundary: "代金券、补贴或投放券必须真实可用，口播、商品卡与后台适用条件保持一致；不自动领取或配置活动。"
    });
  }

  const complianceEvidence = [
    ...(promiseRisk === true ? ["存在错价、虚假承诺或承诺不清风险"] : []),
    ...(refundRate != null && refundRate >= 0.08 ? [`退款率=${formatPercent(refundRate)}`] : []),
    ...(complaintRate != null && complaintRate >= 0.01 ? [`投诉率=${formatPercent(complaintRate)}`] : [])
  ];
  if (complianceEvidence.length > 0) {
    findings.push({
      dimension: "COMPLIANCE",
      title: "先处理商品承诺或履约风险",
      conclusion: "继续放大流量可能同步放大退款、投诉和平台治理风险。",
      evidence: complianceEvidence,
      riskLevel: "HIGH"
    });
    addBusinessRecommendation(recommendations, {
      priority: "P0",
      dimension: "COMPLIANCE",
      title: "暂停扩大流量，人工核对商品与口播一致性",
      reason: complianceEvidence.join("；"),
      evidence: complianceEvidence,
      steps: ["核对商品标题、价格、库存、适用门店/时段和退款规则", "抽查主播承诺与商品详情是否一致", "修正后用小样本观察退款、投诉和核销"],
      verifyMetrics: ["退款率", "投诉率", "履约异常率", "核销率"],
      ruleBoundary: "执行前在抖音生活服务规则中心按当前行业核对最新商品发布、创作者和履约规则。"
    });
  }

  const unitAnalysis = analyzeInvestmentUnitTables(input.tables, targetRoi, input.structuredCollectionData);
  if (targetRoi != null && accountRoi != null && unitAnalysis.status === "READY") {
    const accountBelowTarget = accountRoi < targetRoi;
    if (accountBelowTarget && unitAnalysis.candidates.length > 0) {
      const candidateNames = unitAnalysis.candidates.slice(0, 3).map((unit) => unit.name).join("、");
      const lowNames = unitAnalysis.belowTarget.slice(0, 3).map((unit) => unit.name).join("、") || "无成熟低效单元";
      addBusinessRecommendation(recommendations, {
        priority: "P0",
        dimension: "TRAFFIC",
        title: "总预算不增加，先把低效单元可移动消耗人工转向达标单元",
        reason: `账号 ROI=${formatNumber(accountRoi)} 低于目标 ${formatNumber(targetRoi)}；当前达标候选为 ${candidateNames}，成熟低效单元为 ${lowNames}。`,
        evidence: unitAnalysis.evidence,
        steps: [
          "暂不增加账号总预算，先冻结扩流验证",
          `人工复核低于目标单元，以其当前消耗 ${formatNumber(unitAnalysis.movableSpend)} 元为可移动上限，小步转向 ${candidateNames}`,
          "下一观察窗口保持商品与讲解不变，只观察账号 ROI、单元 ROI、订单和消耗",
          `若账号 ROI 仍低于 ${formatNumber(targetRoi)}，停止扩流验证并回到商品顺序和直播承接优化`
        ],
        verifyMetrics: ["账号 ROI", "单元 ROI", "单元消耗", "单元订单"],
        ruleBoundary: "目标 ROI 只作扩流守门线和停止条件；预算与投流单元调整均由人工审批、人工执行，不承诺必然提升 ROI。"
      });
    } else if (accountBelowTarget) {
      addBusinessRecommendation(recommendations, {
        priority: "P0",
        dimension: "TRAFFIC",
        title: "当前数据中没有可扩流候选",
        reason: `账号 ROI=${formatNumber(accountRoi)} 低于目标 ${formatNumber(targetRoi)}，且没有样本可信、ROI 达标的投流单元。`,
        evidence: unitAnalysis.evidence,
        steps: [
          "暂不增加总预算，也不把样本不足单元当作扩流候选",
          "维持或收敛当前人工验证窗口，先处理商品顺序、权益或直播间承接",
          "下一窗口重新检查账号 ROI、各单元 ROI、订单和消耗",
          `只有出现样本成熟且 ROI 达到 ${formatNumber(targetRoi)} 的单元后，才重新进入人工扩流评估`
        ],
        verifyMetrics: ["账号 ROI", "单元 ROI", "单元订单", "单元消耗"],
        ruleBoundary: "不因没有候选而泛化建议加预算、换流量或自动暂停；所有平台操作由人工完成。"
      });
    }
  } else if (targetRoi != null && unitAnalysis.status === "MISSING_COLUMNS") {
    findings.push({
      dimension: "TRAFFIC",
      title: "投流单元表缺少目标 ROI 分析所需列",
      conclusion: "当前不生成单元扩流或预算重分配方案。",
      evidence: unitAnalysis.missingColumns.map((column) => `缺少列：${column}`),
      riskLevel: "MEDIUM"
    });
  }

  const funnelEvidence = buildFunnelEvidence({ impressions, clicks, productClicks: productAnalysis.productClicks, orders, gmv, gpm });
  if (funnelEvidence.presentCount >= 2) {
    addBusinessRecommendation(recommendations, {
      priority: conversionWeak ? "P0" : "P2",
      dimension: "LIVE_ROOM",
      title: "用当前实测建立进房到成交漏斗基线",
      reason: "只记录当前窗口真实存在的曝光、进房/点击、商品点击、订单、成交金额和 GPM；缺失环节保持缺失，不伪造历史对照。",
      evidence: funnelEvidence.evidence,
      steps: ["固定当前统计窗口和商品顺序", "记录本轮真实漏斗值并标明缺失环节", "下一轮只改变一个素材、商品顺序、权益或讲解变量", "按同一口径回看变化，指标恶化或样本不足时停止并回退"],
      verifyMetrics: ["曝光", "进房/点击", "商品点击", "支付订单", "成交金额", "GPM"],
      ruleBoundary: "只做可见数据对照与人工复盘，不自动操作投流、商品或平台页面。"
    });
  }

  const topFinding = findings.find((finding) => finding.riskLevel === "HIGH") || findings.find((finding) => finding.riskLevel === "MEDIUM") || findings[0];
  return {
    mode: managedLiveGrowth ? "MANAGED_LIVE_GROWTH" : "FULL_BUSINESS",
    headline: topFinding
      ? `${managedLiveGrowth ? "代直播增长目标" : "当前首要问题"}：${topFinding.title}。先完成 P0/P1 验证，再决定是否调整投流。`
      : "当前未发现明确高风险信号，建议保持变量稳定并继续积累可对比样本。",
    performanceSnapshot,
    findings,
    recommendations: recommendations.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)),
    metricExplanations: buildMetricExplanations(input, metrics, accountRoi, serviceProviderFinancials),
    ruleReferences: [
      {
        title: "抖音生活服务学习中心 · 规则中心",
        url: "https://lifexue.com/rule?selected=184320258",
        scope: "商品发布、履约、违规、创作者、推广准入与服务商规则的实时核验入口",
        checkedAt: "2026-07-15"
      },
      {
        title: "抖音生活服务学习中心 · 直播经营知识",
        url: "https://lifexue.com/knowledge/detail/133415?enter_method=search&source=merchant_laike_entry_tour_homepage",
        scope: "直播间搭建、商品组合与运营方法；属于经营知识，不等同于强制规则",
        checkedAt: "2026-07-15"
      },
      {
        title: "抖音开放平台 · 生活服务行业管理规则",
        url: "https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/operation/industry-norm/lifeservice/industry-mgmt-rules",
        scope: "生活服务经营、交易行为和用户权益的一般合规边界",
        checkedAt: "2026-07-15"
      }
    ]
  };
}

function fact(label: string, value: number | null, unit = "") {
  return value == null ? [] : [`${label}=${formatNumber(value)}${unit}`];
}

function addBusinessRecommendation(
  recommendations: DecisionBusinessAnalysis["recommendations"],
  recommendation: DecisionBusinessAnalysis["recommendations"][number] & { evidence: string[] }
) {
  if (!recommendation.evidence.length) throw new Error("RECOMMENDATION_EVIDENCE_REQUIRED");
  if (!recommendations.some((item) => item.title === recommendation.title)) recommendations.push(recommendation);
}

function priorityRank(priority: DecisionBusinessAnalysis["recommendations"][number]["priority"]) {
  return priority === "P0" ? 0 : priority === "P1" ? 1 : 2;
}

function buildMetricExplanations(
  input: DecisionEngineInput,
  metrics: MetricReader,
  accountRoi: number | null,
  serviceProviderFinancials: ReturnType<typeof calculateServiceProviderFinancials>
): DecisionBusinessAnalysis["metricExplanations"] {
  const base: DecisionBusinessAnalysis["metricExplanations"] = [
    {
      title: "账号支付/核销 ROI",
      value: accountRoi,
      meaning: "平台账号侧的成交或核销产出相对广告消耗的效率。",
      use: "判断投流是否带来成交，以及与目标 ROI 的偏差。",
      caveat: "它不包含服务费、商家补贴和真实核销毛利，不能直接代表服务商赚钱。"
    }
  ];
  if (isManagedLiveGrowth(input)) {
    return [
      {
        title: "账号支付/核销 ROI",
        value: accountRoi,
        meaning: "账号成交或核销产出相对广告消耗的效率。",
        use: "判断付费流量是否带来更多成交，辅助比较素材、人群、商品和直播间承接。",
        caveat: "它只用于代直播成交效率分析，不计算服务商利润，也不能单独决定加减预算。"
      },
      {
        title: "GPM",
        value: metrics.number("gpm"),
        meaning: "每千次直播观看产生的成交金额，反映单位观看流量的变现效率。",
        use: "判断进入直播间的流量有没有被讲解、商品和下单路径有效承接。",
        caveat: "必须结合观看量、订单、核销和退款一起看，短时高值不代表稳定。"
      },
      {
        title: "点击率",
        value: normalizeRate(metrics.number("ctr")),
        meaning: "曝光后产生点击或进房行为的比例。",
        use: "定位素材首屏、利益点表达和人群匹配是否能把流量带进直播间。",
        caveat: "点击率高但订单低时，问题通常已转到直播承接或商品。"
      },
      {
        title: "已核验平台活动权益",
        value: serviceProviderFinancials.verifiedBenefits,
        meaning: "已确认可用的代金券、平台补贴、投放券或消返券。",
        use: "作为真实到手价和下单理由，帮助提升商品点击与成交转化。",
        caveat: "它不是平台收益，也不代表服务商利润；必须核对适用商品、门店、时段、用户门槛和有效期。"
      }
    ];
  }
  if (input.subject.subjectType !== "SERVICE_PROVIDER") return base;
  return [
    ...base,
    {
      title: "服务商后毛利 ROI",
      value: serviceProviderFinancials.grossProfitRoi,
      meaning: "核销毛利 ÷（广告消耗 + 本次分摊服务费 + 商家补贴 - 已核验平台补贴）。",
      use: "识别账号 ROI 看起来达标、但服务商扣除真实成本后仍亏损的情况。",
      caveat: "缺少核销毛利或成本字段时不计算，也不用于猜测放量。"
    },
    {
      title: "本次真实投入（服务费后）",
      value: serviceProviderFinancials.afterCost,
      meaning: "把广告消耗、分摊服务费和商家补贴合并，再扣除已核验的可抵扣平台权益。",
      use: "作为服务商后毛利 ROI 的分母，统一本次诊断窗口的成本口径。",
      caveat: "只分摊本次统计窗口的服务成本，不是合同总金额。"
    },
    {
      title: "已核验平台补贴抵扣",
      value: serviceProviderFinancials.verifiedBenefits,
      meaning: "后台已经确认可使用的平台补贴、投放券或消返券。",
      use: "在真实投入中作为成本抵扣，避免漏算已兑现的平台权益。",
      caveat: "这不是“平台收益”；未核验、未到账或不可抵扣的权益一律按 0 处理。"
    }
  ];
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
    const existing = byKey.get(key);
    if (!existing || metricConfidence(metric) > metricConfidence(existing)) byKey.set(key, metric);
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
    metric(key: MetricKey) {
      return key === "unknown" ? null : byKey.get(key) || null;
    },
    firstNumber(keys: MetricKey[]) {
      for (const key of keys) {
        const value = readNumber(key);
        if (value != null) return value;
      }
      return null;
    },
    firstMetric(keys: MetricKey[]) {
      for (const key of keys) {
        const metric = byKey.get(key);
        if (metric && parseMetricNumber(metric.value) != null) return metric;
      }
      return null;
    }
  };
}

function metricConfidence(metric: VisibleMetric) {
  if (metric.confidence != null) return clamp(metric.confidence);
  if (metric.metricSource === "MANUAL_INPUT" || metric.source === "manual") return 1;
  if (metric.metricSource === "XHR_JSON" || metric.source === "network") return 0.85;
  if (metric.metricSource === "TABLE" || metric.source === "table") return 0.75;
  if (metric.metricSource === "SCREENSHOT") return 0.5;
  return 0.6;
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
