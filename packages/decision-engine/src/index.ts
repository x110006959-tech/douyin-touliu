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
  const serviceProviderFinancials = calculateServiceProviderFinancials(input, metrics);
  const roi =
    input.subject.subjectType === "SERVICE_PROVIDER"
      ? serviceProviderFinancials.grossProfitRoi ?? metrics.number("gross_profit_roi")
      : metrics.firstNumber(["verify_roi", "gross_profit_roi", "pay_roi"]);
  const dataQuality = assessDataQuality(input, metrics, roi);
  let riskLevel: RiskLevel = dataQuality.blocksStrongActions ? "MEDIUM" : "LOW";
  const targetRoi = input.targetRoi ?? metrics.number("target_roi") ?? 1;
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
      addManualCheck(manualCheckItems, "活动未核验", "平台补贴、投放券或消返券尚未后台核验，不计入真实成本抵扣。");
      addProposal(proposals, {
        actionType: "VERIFY_ACTIVITY",
        title: "核验活动权益后再计入成本",
        reason: `检测到待核验权益 ${formatNumber(serviceProviderFinancials.unverifiedBenefits)} 元，当前未从成本中抵扣。`,
        riskLevel: "MEDIUM",
        confidence: 0.78
      });
    }
    if (serviceProviderFinancials.grossProfitRoi == null) {
      addManualCheck(manualCheckItems, "服务商后毛利 ROI 缺失", "需补齐核销毛利、广告消耗、服务费和商家补贴后再判断真实盈利。");
    } else {
      const accountRoi = metrics.firstNumber(["verify_roi", "pay_roi"]);
      if (accountRoi != null && accountRoi >= targetRoi && serviceProviderFinancials.grossProfitRoi < targetRoi) {
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
      "ROI 缺失",
      input.subject.subjectType === "SERVICE_PROVIDER"
        ? "服务商场景缺少服务费后毛利 ROI，不输出确定性放量结论。"
        : "缺少核销 ROI、毛利 ROI 或支付 ROI 时，不输出确定性放量结论。"
    );
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
      reason: `当前${input.subject.subjectType === "SERVICE_PROVIDER" ? "服务商后毛利 " : ""}ROI=${formatNumber(roi)}，低于盈亏线 1。`,
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
    calculatedMetrics:
      input.subject.subjectType === "SERVICE_PROVIDER"
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
  const required = [
    { label: "ROI", value: selectedRoi },
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
  const roiMetric = metrics.firstMetric(
    input.subject.subjectType === "SERVICE_PROVIDER" ? ["gross_profit_roi"] : ["verify_roi", "gross_profit_roi", "pay_roi"]
  );
  const serviceGrossProfitMetric = input.subject.subjectType === "SERVICE_PROVIDER" ? metrics.metric("gross_profit") : null;
  const lowConfidenceFields = [
    ...(roiMetric && metricConfidence(roiMetric) < 0.7 ? ["ROI"] : []),
    ...(serviceGrossProfitMetric && metricConfidence(serviceGrossProfitMetric) < 0.7 ? ["核销毛利"] : []),
    ...criticalMetricKeys.flatMap(({ key, label }) => {
      const metric = metrics.metric(key);
      return metric && metricConfidence(metric) < 0.7 ? [label] : [];
    })
  ];
  const subject = assessSubjectReadiness(input);
  const reviewReady = input.dataReviewStatus === "REVIEWED";
  const blockingReasons = [
    ...(missingFields.includes("ROI") ? ["ROI 缺失"] : []),
    ...(missingFields.length >= 3 ? ["关键指标缺失过多"] : []),
    ...(!subject.ready ? ["主体识别未完成"] : []),
    ...(!reviewReady ? ["数据未人工复核"] : []),
    ...(lowConfidenceFields.length ? ["关键指标置信度不足"] : [])
  ];
  const completeness = round((required.length - missingFields.length) / required.length, 2);
  return {
    missingFields,
    lowConfidenceFields,
    blockingReasons,
    subjectReady: subject.ready,
    reviewReady,
    completeness,
    blocksStrongActions: blockingReasons.length > 0
  };
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
  if (subject.controlLevel === "PENDING") issues.push("可控程度");
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
    if (!subject.serviceMode?.trim()) issues.push("服务模式");
    if (subject.serviceFee == null) issues.push("服务费");
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
    input.subject.subjectType === "SERVICE_PROVIDER" && serviceProviderFinancials?.afterCost != null
      ? `，服务商后成本=${formatNumber(serviceProviderFinancials.afterCost)}，毛利ROI=${formatNullable(serviceProviderFinancials.grossProfitRoi)}`
      : "";
  return `${subject}，风险=${riskLevel}${serviceCost}${missing}。建议：${topAction}。`;
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
