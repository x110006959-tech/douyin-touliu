const historicalComparisonBoundary = /(?:同直播类型|同时段|同口径).*(?:历史|对比)|历史.*(?:观看|点击|成交|订单|转化|投放|产出|趋势)/;

const conciseHistoricalBoundary = "缺少近期历史趋势，暂不能判断当前表现是在改善还是回落。";

const businessTextReplacements: Array<[RegExp, string]> = [
  [/[（(]证据[:：][^）)]*[）)]/g, ""],
  [/同直播类型、?同时段、?同口径的?/g, "近期"],
  [/历史同场景/g, "近期历史"],
  [/同场景/g, "近期"],
  [/full_domain_pay_roi/gi, "全域支付 ROI"],
  [/full_domain_gmv/gi, "全域成交金额"],
  [/full_domain_orders/gi, "全域成交订单数"],
  [/product_conversion_rate/gi, "商品转化率"],
  [/target_roi/gi, "目标 ROI"],
  [/pay_roi/gi, "支付 ROI"],
  [/live_viewers/gi, "累计观看人数"],
  [/impressions/gi, "曝光量"],
  [/\bctr\b/gi, "点击率"],
  [/LOCAL_PROMOTION_DASHBOARD/g, "本地推经营数据"],
  [/LIVE_DATA_SCREEN/g, "直播经营数据"],
  [/LIVE_PRODUCT_TAB/g, "直播商品明细"],
  [/LIVE_TRAFFIC_TAB/g, "直播流量明细"],
  [/TASK_TABLE/g, "投放任务明细"]
];

export function summarizeDecisionBoundaries(items: readonly string[], limit = 3) {
  const summarized: string[] = [];
  for (const rawItem of items) {
    const item = rawItem.trim();
    if (!item) continue;
    const visibleItem = historicalComparisonBoundary.test(item) ? conciseHistoricalBoundary : item;
    if (!summarized.includes(visibleItem)) summarized.push(visibleItem);
    if (summarized.length >= limit) break;
  }
  return summarized;
}

export function humanizeBusinessText(value: string) {
  let readable = value;
  for (const [pattern, replacement] of businessTextReplacements) {
    readable = readable.replace(pattern, replacement);
  }
  return readable.replace(/\s{2,}/g, " ").trim();
}

export function humanizeDiagnosisFailure(errorCode?: string | null, errorMessage?: string | null) {
  const experimentFailure = diagnosisExperimentFailureReason(errorMessage);
  if (experimentFailure) return `${experimentFailure}本次未生成建议，已采集数据仍保留。`;
  if (errorCode === "DIAGNOSIS_BENCHMARK_UNSUPPORTED" || errorMessage?.includes("DIAGNOSIS_BENCHMARK_UNSUPPORTED")) {
    return "AI 使用了当前证据无法支持的好坏评价或行业阈值，自动纠正后仍不符合要求。本次未生成建议，已采集数据仍保留。";
  }
  if (errorMessage?.includes("DIAGNOSIS_DETERMINISTIC_CONFLICT")) {
    return "AI 对指标关系的表述未通过证据一致性检查，本次已安全停止。当前数据没有被改动，请重新运行诊断。";
  }
  if (errorMessage?.includes("DIAGNOSIS_DOMAIN_CONFLICT")) {
    return "AI 把其他领域的判断混入了当前分析，本次已安全停止。当前数据没有被改动，请重新运行诊断。";
  }
  if (errorCode === "DIAGNOSIS_OUTPUT_INVALID") {
    return "AI 输出在自动纠正后仍未满足诊断要求，本次未生成建议，请重新运行。";
  }
  return errorMessage || "诊断未完成，请重新运行。";
}

export function diagnosisExperimentFailureReason(errorMessage?: string | null): string | null {
  if (!errorMessage?.includes("DIAGNOSIS_EXPERIMENT_INVALID")) return null;
  if (/一个经营变量|一个调整变量|singleVariable 只能/.test(errorMessage)) {
    return "验证方案被判定为同时调整多个经营变量，无法单独判断哪项调整有效。";
  }
  if (errorMessage.includes("观察实验")) return "观察方案中包含了经营调整，未通过只读检查。";
  return "验证方案的动作关联、观察条件或停止标准未通过实验设计检查。";
}
