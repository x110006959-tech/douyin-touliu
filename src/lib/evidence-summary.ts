type JsonRecord = Record<string, unknown>;

export type EvidenceSummaryInput = {
  pageName: string | null;
  source: string;
  rawText: string | null;
  rawPayload: string;
  parsedFields: string;
  screenshotPath: string | null;
};

export type EvidenceSummaryTable = {
  title: string;
  headers: string[];
  rows: string[][];
};

export type EvidenceSummary = {
  title: string;
  badges: string[];
  stats: { label: string; value: string }[];
  tables: EvidenceSummaryTable[];
  notes: string[];
};

function parseJson(value: string | null | undefined): JsonRecord {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonRecord) : {};
  } catch {
    return {};
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item) => Object.keys(item).length > 0) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function text(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function numberText(value: unknown, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return text(value);
  return `${value.toLocaleString("zh-CN")}${suffix}`;
}

function moneyText(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return text(value);
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: value % 1 === 0 ? 0 : 2 })}`;
}

function percentText(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return text(value);
  return `${value.toFixed(2)}%`;
}

function firstValue(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") return record[key];
  }
  return undefined;
}

function inferFields(input: EvidenceSummaryInput) {
  const parsedFields = parseJson(input.parsedFields);
  if (Object.keys(parsedFields).length > 0) return parsedFields;
  return parseJson(input.rawPayload);
}

function getPageType(input: EvidenceSummaryInput, fields: JsonRecord) {
  return [fields.pageType, fields.dataDomain, input.pageName, input.source].filter(Boolean).join(" ");
}

function buildProductSummary(input: EvidenceSummaryInput, fields: JsonRecord): EvidenceSummary {
  const products = asArray(fields.products);
  const topProducts = asArray(fields.topProducts);
  const recommendedReturn = asArray(fields.recommendedReturnProducts);
  const funnel = asArray(fields.productFunnel);
  const audience = asRecord(fields.productAudience);
  const coverage = asRecord(fields.captureCoverage);
  const totalPayAmount = products.reduce((sum, item) => {
    const value = firstValue(item, ["payAmount", "gmv", "productGmv"]);
    return sum + (typeof value === "number" ? value : 0);
  }, 0);

  const badges = ["商品页"];
  if (coverage.hasMoreRows) badges.push("商品列表可继续下拉");
  if (products.length > 0) badges.push(`已采${products.length}行`);

  const stats = [
    { label: "可见商品支付金额", value: moneyText(totalPayAmount) },
    { label: "可见商品数", value: numberText(products.length) },
    { label: "商品画像", value: [audience.gender, audience.age, audience.city, audience.fanStatus].filter(Boolean).join(" / ") || "-" }
  ];

  const tables: EvidenceSummaryTable[] = [];
  if (topProducts.length + recommendedReturn.length > 0) {
    tables.push({
      title: "关注商品 / 推荐返场",
      headers: ["类型", "商品", "售价", "GMV/支付", "订单/点击率"],
      rows: [
        ...topProducts.map((item) => [
          "关注",
          text(firstValue(item, ["name", "productName"])),
          moneyText(firstValue(item, ["price", "salePrice"])),
          moneyText(firstValue(item, ["payAmount", "gmv", "productGmv"])),
          text(firstValue(item, ["payOrders", "clickRate"]))
        ]),
        ...recommendedReturn.map((item) => [
          "返场",
          text(firstValue(item, ["name", "productName"])),
          moneyText(firstValue(item, ["price", "salePrice"])),
          moneyText(firstValue(item, ["productGmv", "gmv", "payAmount"])),
          percentText(firstValue(item, ["exposureClickRate", "clickRate"]))
        ])
      ]
    });
  }

  if (products.length > 0) {
    tables.push({
      title: "商品列表（已采可见行）",
      headers: ["商品", "售价", "秒杀价", "支付金额", "订单", "成功用户", "曝光"],
      rows: products.map((item) => [
        text(firstValue(item, ["name", "productName"])),
        moneyText(firstValue(item, ["price", "salePrice"])),
        moneyText(firstValue(item, ["flashPrice", "seckillPrice"])),
        moneyText(firstValue(item, ["payAmount", "gmv"])),
        numberText(firstValue(item, ["payOrders", "orders"])),
        numberText(firstValue(item, ["paySuccessUsers", "successUsers"])),
        numberText(firstValue(item, ["productExposureCount", "exposureCount"]))
      ])
    });
  }

  if (funnel.length > 0) {
    tables.push({
      title: "商品转化漏斗",
      headers: ["环节", "人数", "转化", "变化"],
      rows: funnel.map((item) => [
        text(item.name),
        numberText(item.value),
        percentText(item.rate),
        text(item.change)
      ])
    });
  }

  const notes = [
    text(coverage.note, ""),
    coverage.hasMoreRows ? "当前证据只覆盖截图可见商品，剩余商品需继续下拉采集或手动校准。" : ""
  ].filter(Boolean);

  return {
    title: input.pageName || "商品页证据",
    badges,
    stats,
    tables,
    notes
  };
}

function buildTrafficSummary(input: EvidenceSummaryInput, fields: JsonRecord): EvidenceSummary {
  const overview = asRecord(fields.trafficOverview);
  const channels = asArray(fields.trafficChannels);
  const notes = asArray(fields.notes).map((item) => text(item.text, "")).filter(Boolean);

  const commercial = overview.hourlyCommercialWatch;
  const totalHourly = overview.hourlyWatchCount;
  const commercialShare =
    typeof commercial === "number" && typeof totalHourly === "number" && totalHourly > 0
      ? `${((commercial / totalHourly) * 100).toFixed(1)}%`
      : "-";

  const tables: EvidenceSummaryTable[] = [];
  if (channels.length > 0) {
    tables.push({
      title: "流量渠道",
      headers: ["渠道", "指标", "状态"],
      rows: channels.map((item) => [text(item.name), text(item.metric), text(item.status)])
    });
  }

  return {
    title: input.pageName || "流量页证据",
    badges: ["流量页", text(fields.selectedMetric, "曝光次数")],
    stats: [
      { label: "整场累计看播人数", value: numberText(overview.totalWatchUsers) },
      { label: "小时看播次数", value: numberText(overview.hourlyWatchCount) },
      { label: "小时自然看播", value: numberText(overview.hourlyNaturalWatch) },
      { label: "小时商业看播", value: numberText(overview.hourlyCommercialWatch) },
      { label: "商业占比", value: commercialShare }
    ],
    tables,
    notes
  };
}

function buildLiveSummary(input: EvidenceSummaryInput, fields: JsonRecord): EvidenceSummary {
  const metrics = asRecord(fields.liveMetrics);
  const runtime = asRecord(fields.liveRuntime);
  const funnel = asArray(fields.conversionFunnel);
  const audience = asRecord(fields.audienceProfile);
  const visual = asRecord(fields.liveVisualRecognition);
  const riskKeywords = asStringArray(visual.riskKeywords);
  const diagnosis = text(fields.platformDiagnosis, "");
  const tables: EvidenceSummaryTable[] = [];

  if (funnel.length > 0) {
    tables.push({
      title: "直播转化漏斗",
      headers: ["环节", "数值", "转化", "变化"],
      rows: funnel.map((item) => [
        text(item.name),
        numberText(item.value),
        percentText(item.rate),
        text(item.change)
      ])
    });
  }

  return {
    title: input.pageName || "直播大屏证据",
    badges: ["直播大屏", text(fields.liveRoomStatus, "已采集")],
    stats: [
      { label: "直播间成交金额", value: moneyText(firstValue(metrics, ["liveGmv", "gmv"])) },
      { label: "累计在线人数", value: numberText(metrics.totalOnlineUsers) },
      { label: "成交订单数", value: numberText(metrics.payOrders) },
      { label: "商品点击率", value: percentText(metrics.productClickRate) },
      { label: "商品转化率", value: percentText(metrics.productConversionRate) },
      { label: "用户画像", value: Object.values(audience).filter(Boolean).slice(0, 4).join(" / ") || "-" },
      { label: "直播日期", value: text(runtime.liveDate) },
      { label: "直播状态", value: text(runtime.liveStatus) },
      { label: "直播画面帧", value: numberText(visual.frameCount) },
      { label: "画面识别", value: text(visual.status) }
    ],
    tables,
    notes: [
      diagnosis,
      visual.primaryFramePath ? `直播画面帧：${visual.primaryFramePath}` : "",
      runtime.sessionFingerprint ? `场次指纹：${runtime.sessionFingerprint}` : "",
      riskKeywords.length > 0 ? `画面风险词：${riskKeywords.join("、")}` : "",
      visual.ocrText ? `画面 OCR：${text(visual.ocrText).slice(0, 120)}` : ""
    ].filter(Boolean)
  };
}

export function buildEvidenceSummary(input: EvidenceSummaryInput): EvidenceSummary | null {
  const fields = inferFields(input);
  const pageType = getPageType(input, fields);
  if (!pageType.trim() && Object.keys(fields).length === 0) return null;
  if (/product|商品/i.test(pageType)) return buildProductSummary(input, fields);
  if (/traffic|流量/i.test(pageType)) return buildTrafficSummary(input, fields);
  if (/live|直播|大屏/i.test(pageType)) return buildLiveSummary(input, fields);
  return null;
}
