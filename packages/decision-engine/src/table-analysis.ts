import {
  collectionFieldProfiles,
  metricValueToRuleNumber,
  parseDisplayedMetricValue,
  structuredCollectionDataSchema,
  structuredCollectionDataVersion,
  type CollectionRouteKey,
  type DecisionTableInput,
  type MetricValueSemantic,
  type StructuredCollectionData,
  type TaskCollectionRow
} from "@douyin-local-life/shared";

type DecisionTable = { routeKey: string | null; tableIndex: number; headers: string[]; rows: unknown[][] };
type RankedProduct = {
  label: "引流款" | "主推款" | "承接款";
  name: string;
  id: string | null;
  score: number;
  price: number;
  paymentAmount: number;
  orders: number;
  impressions: number;
  clicks: number;
  detailVisits: number;
  submitVisits: number;
};
export type ProductTableAnalysis =
  | { status: "MISSING_COLUMNS"; missingColumns: string[]; productClicks: number | null }
  | { status: "INSUFFICIENT_SAMPLE"; evidence: string[]; productClicks: number | null }
  | { status: "READY"; traffic: RankedProduct; primary: RankedProduct; acceptance: RankedProduct; evidence: string[]; productClicks: number };

const productColumnAliases = tableAliases("LIVE_PRODUCT_TAB") as Record<
  "id" | "name" | "price" | "seckillPrice" | "paymentAmount" | "orders" | "impressions" | "clicks" | "detailVisits" | "submitVisits" | "submitRate" | "conversionRate",
  readonly string[]
>;

const unitColumnAliases = tableAliases("TASK_TABLE") as Record<
  "id" | "name" | "status" | "budget" | "spend" | "roi" | "targetRoi" | "orders" | "impressions" | "clicks" | "ctr",
  readonly string[]
>;

function tableAliases(routeKey: "LIVE_PRODUCT_TAB" | "TASK_TABLE") {
  return Object.fromEntries((collectionFieldProfiles[routeKey]?.tableFields || []).map((field) => [field.key, field.labels]));
}

export function structureTaskCollectionTables(
  tables: DecisionTableInput[],
  context: {
    routeKey: CollectionRouteKey;
    capturedAt: string;
    adapterId?: string | null;
    adapterVersion?: string | null;
  }
): StructuredCollectionData | null {
  const candidates = normalizeDecisionTables(tables).filter((table) => {
    if (table.routeKey && table.routeKey !== "TASK_TABLE") return false;
    const columns = columnIndexes(table.headers, unitColumnAliases);
    return columns.id >= 0 || columns.name >= 0;
  });
  if (!candidates.length) return null;

  const rows: TaskCollectionRow[] = [];
  const warnings: string[] = [];
  let rejectedRowCount = 0;
  for (const table of candidates) {
    const columns = columnIndexes(table.headers, unitColumnAliases);
    table.rows.forEach((row, rowIndex) => {
      const taskId = readTextCell(row, columns.id);
      const taskName = readTextCell(row, columns.name);
      if (!taskId && !taskName) {
        rejectedRowCount += 1;
        if (warnings.length < 20) warnings.push(`表 ${table.tableIndex + 1} 第 ${rowIndex + 1} 行缺少任务 ID 和名称`);
        return;
      }
      const parseNumber = (field: string, columnIndex: number, semantic: MetricValueSemantic) => {
        if (columnIndex < 0) return null;
        const raw = row[columnIndex];
        const text = raw == null ? "" : String(raw).trim();
        if (!text || text === "--" || text === "-") return null;
        const parsed = semantic === "PERCENTAGE"
          ? readRateCell(row, columnIndex, table.headers[columnIndex])
          : readNonNegativeNumberCell(row, columnIndex, semantic, table.headers[columnIndex]);
        if (parsed == null && warnings.length < 20) {
          warnings.push(`表 ${table.tableIndex + 1} 第 ${rowIndex + 1} 行 ${field} 无法解析，已保留为空`);
        }
        return parsed;
      };
      rows.push({
        taskId,
        taskName,
        status: readTextCell(row, columns.status),
        budget: parseNumber("预算", columns.budget, "CURRENCY"),
        spend: parseNumber("消耗", columns.spend, "CURRENCY"),
        roi: parseNumber("ROI", columns.roi, "ROI"),
        targetRoi: parseNumber("目标 ROI", columns.targetRoi, "ROI"),
        orders: parseNumber("订单", columns.orders, "COUNT"),
        impressions: parseNumber("曝光", columns.impressions, "COUNT"),
        clicks: parseNumber("点击", columns.clicks, "COUNT"),
        ctr: parseNumber("CTR", columns.ctr, "PERCENTAGE"),
        provenance: {
          routeKey: context.routeKey,
          capturedAt: context.capturedAt,
          tableIndex: table.tableIndex,
          rowIndex,
          adapterId: context.adapterId?.trim() || null,
          adapterVersion: context.adapterVersion?.trim() || null,
          schemaVersion: structuredCollectionDataVersion
        }
      });
    });
  }

  const result: StructuredCollectionData = {
    kind: "TASK_ROWS",
    routeKey: context.routeKey,
    capturedAt: context.capturedAt,
    schemaVersion: structuredCollectionDataVersion,
    adapterId: context.adapterId?.trim() || null,
    adapterVersion: context.adapterVersion?.trim() || null,
    acceptedRowCount: rows.length,
    rejectedRowCount,
    warnings,
    rows
  };
  return structuredCollectionDataSchema.parse(result);
}

export function analyzeProductTables(tables: DecisionTableInput[]): ProductTableAnalysis {
  const parsedTables = normalizeDecisionTables(tables);
  const table = findBestTable(parsedTables, productColumnAliases, "LIVE_PRODUCT_TAB");
  if (!table) {
    return { status: "MISSING_COLUMNS", missingColumns: ["LIVE_PRODUCT_TAB 商品表"], productClicks: null };
  }
  const columns = columnIndexes(table.headers, productColumnAliases);
  const missingColumns = [
    columns.id < 0 && columns.name < 0 ? "商品名称或商品 ID" : null,
    columns.price < 0 && columns.seckillPrice < 0 ? "售价或秒杀价" : null,
    columns.paymentAmount < 0 ? "支付金额" : null,
    columns.orders < 0 ? "支付订单" : null,
    columns.impressions < 0 ? "曝光" : null,
    columns.clicks < 0 ? "点击" : null,
    columns.detailVisits < 0 ? "详情访问" : null,
    columns.submitVisits < 0 ? "提单访问" : null
  ].filter((value): value is string => Boolean(value));
  if (missingColumns.length) return { status: "MISSING_COLUMNS", missingColumns, productClicks: null };

  const products = table.rows.flatMap((row, rowIndex) => {
    const id = readTextCell(row, columns.id);
    const name = readTextCell(row, columns.name) || id || `第 ${rowIndex + 1} 行商品`;
    if (!id && !readTextCell(row, columns.name)) return [];
    const price = firstNumberCell(row, [columns.seckillPrice, columns.price], "CURRENCY", table.headers);
    const paymentAmount = readNumberCell(row, columns.paymentAmount, "CURRENCY", table.headers[columns.paymentAmount]);
    const orders = readNumberCell(row, columns.orders, "COUNT", table.headers[columns.orders]);
    const impressions = readNumberCell(row, columns.impressions, "COUNT", table.headers[columns.impressions]);
    const clicks = readNumberCell(row, columns.clicks, "COUNT", table.headers[columns.clicks]);
    const detailVisits = readNumberCell(row, columns.detailVisits, "COUNT", table.headers[columns.detailVisits]);
    const submitVisits = readNumberCell(row, columns.submitVisits, "COUNT", table.headers[columns.submitVisits]);
    if ([price, paymentAmount, orders, impressions, clicks, detailVisits, submitVisits].some((value) => value == null || value < 0)) return [];
    return [{
      id,
      name,
      price: price!,
      paymentAmount: paymentAmount!,
      orders: orders!,
      impressions: impressions!,
      clicks: clicks!,
      detailVisits: detailVisits!,
      submitVisits: submitVisits!,
      invalidSubmitRate: hasInvalidRateCell(row, columns.submitRate, table.headers[columns.submitRate]),
      invalidConversionRate: hasInvalidRateCell(row, columns.conversionRate, table.headers[columns.conversionRate])
    }];
  });
  const productClicks = products.length ? products.reduce((sum, product) => sum + product.clicks, 0) : null;
  if (products.length < 3) {
    return { status: "INSUFFICIENT_SAMPLE", evidence: [`可解析商品=${products.length}，至少需要 3 个商品形成相对角色顺序`], productClicks };
  }

  const totalPayment = products.reduce((sum, product) => sum + product.paymentAmount, 0);
  const totalOrders = products.reduce((sum, product) => sum + product.orders, 0);
  const prices = products.map((product) => product.price).filter((value) => value > 0);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const scored = products.map((product) => {
    const ctr = conservativeRate(product.clicks, product.impressions, 100);
    const detailRate = conservativeRate(product.detailVisits, product.clicks, 30);
    const detailToSubmit = product.invalidSubmitRate ? null : conservativeRate(product.submitVisits, product.detailVisits, 20);
    const submitToPay = product.invalidConversionRate ? null : conservativeRate(product.orders, product.submitVisits, 10);
    const priceScore = product.price > 0 ? maxPrice === minPrice ? 0.5 : (maxPrice - product.price) / (maxPrice - minPrice) : null;
    const trafficScore = ctr && detailRate && priceScore != null ? average([ctr.score, detailRate.score, priceScore]) : null;
    const primaryScore = submitToPay && totalPayment > 0 && totalOrders > 0
      ? average([product.paymentAmount / totalPayment, product.orders / totalOrders, submitToPay.score])
      : null;
    const acceptanceScore = detailToSubmit && submitToPay ? average([detailToSubmit.score, submitToPay.score]) : null;
    return { product, trafficScore, primaryScore, acceptanceScore };
  });

  const traffic = pickRankedProduct(scored, "trafficScore", "引流款", []);
  const primary = pickRankedProduct(scored, "primaryScore", "主推款", traffic ? [traffic.id || traffic.name] : []);
  const acceptance = pickRankedProduct(scored, "acceptanceScore", "承接款", [traffic?.id || traffic?.name || "", primary?.id || primary?.name || ""]);
  if (!traffic || !primary || !acceptance) {
    const insufficient = scored.map(({ product, trafficScore, primaryScore, acceptanceScore }) =>
      `${product.name}：引流${trafficScore == null ? "样本不足" : "可评分"}，主推${primaryScore == null ? "样本不足" : "可评分"}，承接${acceptanceScore == null ? "样本不足" : "可评分"}`
    );
    return { status: "INSUFFICIENT_SAMPLE", evidence: insufficient, productClicks };
  }
  return {
    status: "READY",
    traffic,
    primary,
    acceptance,
    productClicks: productClicks || 0,
    evidence: [formatProductEvidence(traffic), formatProductEvidence(primary), formatProductEvidence(acceptance)]
  };
}

function pickRankedProduct(
  scored: Array<{ product: Omit<RankedProduct, "label" | "score">; trafficScore: number | null; primaryScore: number | null; acceptanceScore: number | null }>,
  scoreKey: "trafficScore" | "primaryScore" | "acceptanceScore",
  label: RankedProduct["label"],
  excluded: string[]
) {
  const eligible = scored.filter((item) => item[scoreKey] != null).sort((left, right) => (right[scoreKey] || 0) - (left[scoreKey] || 0));
  const selected = eligible.find((item) => !excluded.includes(item.product.id || item.product.name));
  return selected ? { ...selected.product, label, score: selected[scoreKey]! } : null;
}

function formatProductEvidence(product: RankedProduct) {
  return `${product.label}：${product.name}${product.id ? `（ID ${product.id}）` : ""}，售价=${formatNumber(product.price)}元，曝光=${formatNumber(product.impressions)}，点击=${formatNumber(product.clicks)}，详情访问=${formatNumber(product.detailVisits)}，提单访问=${formatNumber(product.submitVisits)}，支付订单=${formatNumber(product.orders)}，支付金额=${formatNumber(product.paymentAmount)}元`;
}

type InvestmentUnit = { name: string; spend: number; roi: number | null; orders: number | null; impressions: number | null; clicks: number | null; ctr: number | null; mature: boolean };
export type InvestmentUnitAnalysis =
  | { status: "MISSING_COLUMNS"; missingColumns: string[] }
  | { status: "READY"; candidates: InvestmentUnit[]; belowTarget: InvestmentUnit[]; insufficient: InvestmentUnit[]; movableSpend: number; evidence: string[] };

export function analyzeInvestmentUnitTables(
  tables: DecisionTableInput[],
  targetRoi: number | null,
  structuredData: StructuredCollectionData[] = []
): InvestmentUnitAnalysis {
  const structuredTaskData = structuredData.filter((data) => data.kind === "TASK_ROWS");
  if (structuredTaskData.length) {
    const units = structuredTaskData.flatMap((data) => data.rows).flatMap((row) => {
      if (row.spend == null || row.spend < 0) return [];
      const ctr = row.ctr ?? (
        row.clicks != null
        && row.impressions != null
        && row.impressions > 0
        && row.clicks <= row.impressions
          ? row.clicks / row.impressions
          : null
      );
      return [{
        name: row.taskName || row.taskId!,
        spend: row.spend,
        roi: row.roi,
        orders: row.orders,
        impressions: row.impressions,
        clicks: row.clicks,
        ctr,
        mature: row.spend > 0 && ((row.orders ?? 0) >= 3 || (row.impressions ?? 0) >= 1000 || (row.clicks ?? 0) >= 100)
      }];
    });
    return summarizeInvestmentUnits(units, targetRoi);
  }

  const table = findBestTable(normalizeDecisionTables(tables), unitColumnAliases, "TASK_TABLE");
  if (!table) return { status: "MISSING_COLUMNS", missingColumns: ["任务列表/本地推投流单元表"] };
  const columns = columnIndexes(table.headers, unitColumnAliases);
  const missingColumns = [
    columns.id < 0 && columns.name < 0 ? "投流单元名称或 ID" : null,
    columns.spend < 0 ? "消耗" : null,
    columns.roi < 0 ? "ROI" : null
  ].filter((value): value is string => Boolean(value));
  if (missingColumns.length) return { status: "MISSING_COLUMNS", missingColumns };
  const units = table.rows.flatMap((row, rowIndex) => {
    const name = readTextCell(row, columns.name) || readTextCell(row, columns.id) || `第 ${rowIndex + 1} 个投流单元`;
    const spend = readNumberCell(row, columns.spend, "CURRENCY", table.headers[columns.spend]);
    if (spend == null || spend < 0) return [];
    const roi = readNumberCell(row, columns.roi, "ROI", table.headers[columns.roi]);
    const orders = readNumberCell(row, columns.orders, "COUNT", table.headers[columns.orders]);
    const impressions = readNumberCell(row, columns.impressions, "COUNT", table.headers[columns.impressions]);
    const clicks = readNumberCell(row, columns.clicks, "COUNT", table.headers[columns.clicks]);
    const parsedCtr = readRateCell(row, columns.ctr, table.headers[columns.ctr]);
    const ctr = parsedCtr ?? (clicks != null && impressions != null && impressions > 0 && clicks <= impressions ? clicks / impressions : null);
    const mature = spend > 0 && ((orders ?? 0) >= 3 || (impressions ?? 0) >= 1000 || (clicks ?? 0) >= 100);
    return [{ name, spend, roi, orders, impressions, clicks, ctr, mature }];
  });
  return summarizeInvestmentUnits(units, targetRoi);
}

function summarizeInvestmentUnits(units: InvestmentUnit[], targetRoi: number | null): InvestmentUnitAnalysis {
  const candidates = targetRoi == null ? [] : units.filter((unit) => unit.mature && unit.roi != null && unit.roi >= targetRoi).sort((a, b) => (b.roi || 0) - (a.roi || 0));
  const belowTarget = targetRoi == null ? [] : units.filter((unit) => unit.mature && unit.roi != null && unit.roi < targetRoi).sort((a, b) => b.spend - a.spend);
  const insufficient = units.filter((unit) => !unit.mature || unit.roi == null);
  const evidence = [
    ...candidates.map((unit) => `达标候选：${formatInvestmentUnit(unit)}`),
    ...belowTarget.map((unit) => `低于目标：${formatInvestmentUnit(unit)}`),
    ...insufficient.map((unit) => `样本不足：${formatInvestmentUnit(unit)}`)
  ];
  if (!evidence.length) evidence.push("投流单元表没有可解析的有效数据行");
  return { status: "READY", candidates, belowTarget, insufficient, movableSpend: belowTarget.reduce((sum, unit) => sum + unit.spend, 0), evidence };
}

function formatInvestmentUnit(unit: InvestmentUnit) {
  return `${unit.name}，消耗=${formatNumber(unit.spend)}元，ROI=${unit.roi == null ? "缺失" : formatNumber(unit.roi)}，订单=${formatNullable(unit.orders)}，曝光=${formatNullable(unit.impressions)}，点击率=${unit.ctr == null ? "缺失" : formatPercent(unit.ctr)}`;
}

export function buildFunnelEvidence(values: { impressions: number | null; clicks: number | null; productClicks: number | null; orders: number | null; gmv: number | null; gpm: number | null }) {
  const entries: Array<[string, number | null, string]> = [
    ["曝光", values.impressions, ""], ["进房/点击", values.clicks, ""], ["商品点击", values.productClicks, ""],
    ["支付订单", values.orders, ""], ["成交金额", values.gmv, "元"], ["GPM", values.gpm, ""]
  ];
  return {
    presentCount: entries.filter(([, value]) => value != null).length,
    evidence: entries.map(([label, value, unit]) => `${label}=${value == null ? "缺失" : `${formatNumber(value)}${unit}`}`)
  };
}

function normalizeDecisionTables(input: DecisionTableInput[]): DecisionTable[] {
  const candidates = isMatrix(input) ? [{ routeKey: null, rows: input }] : input;
  return candidates.flatMap((candidate, tableIndex) => {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const value = candidate as { routeKey?: unknown; rows?: unknown };
      if (Array.isArray(value.rows) && isMatrix(value.rows)) {
        return [toDecisionTable(typeof value.routeKey === "string" ? value.routeKey : null, value.rows, tableIndex)];
      }
    }
    if (Array.isArray(candidate) && isMatrix(candidate)) return [toDecisionTable(null, candidate, tableIndex)];
    return [];
  });
}

function toDecisionTable(routeKey: string | null, matrix: unknown[], tableIndex: number): DecisionTable {
  const rows = matrix.filter((row): row is unknown[] => Array.isArray(row));
  return { routeKey, tableIndex, headers: rows[0]!.map((cell) => String(cell ?? "").trim()), rows: rows.slice(1) };
}

function isMatrix(value: unknown[]): boolean {
  return value.length > 0 && value.every((row) => Array.isArray(row)) && value.some((row) => (row as unknown[]).some((cell) => !Array.isArray(cell)));
}

function findBestTable<T extends Record<string, readonly string[]>>(tables: DecisionTable[], aliases: T, preferredRoute: string) {
  return tables
    .map((table) => ({
      table,
      matchedColumns: Object.values(aliases).filter((values) => findColumn(table.headers, values) >= 0).length,
      preferredRoute: table.routeKey === preferredRoute
    }))
    .sort((left, right) => right.matchedColumns - left.matchedColumns || Number(right.preferredRoute) - Number(left.preferredRoute))[0]?.table || null;
}

function columnIndexes<T extends Record<string, readonly string[]>>(headers: string[], aliases: T): Record<keyof T, number> {
  return Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, findColumn(headers, values)])) as Record<keyof T, number>;
}

function findColumn(headers: string[], aliases: readonly string[]) {
  const normalizedHeaders = headers.map(normalizeColumnName);
  const normalizedAliases = aliases.map(normalizeColumnName);
  return normalizedHeaders.findIndex((header) => normalizedAliases.includes(header));
}

function normalizeColumnName(value: string) {
  return value.toLowerCase().replace(/[\s_\-—/（）()：:·]/g, "").replace(/(?:人民币|元|%|倍)$/, "");
}

function readTextCell(row: unknown[], index: number) {
  if (index < 0) return null;
  const value = String(row[index] ?? "").trim();
  return value && value !== "--" ? value.slice(0, 120) : null;
}

function firstNumberCell(row: unknown[], indexes: number[], semantic: MetricValueSemantic, headers: string[]) {
  for (const index of indexes) {
    const value = readNumberCell(row, index, semantic, headers[index]);
    if (value != null && value > 0) return value;
  }
  return null;
}

function readNumberCell(row: unknown[], index: number, semantic: MetricValueSemantic, header?: string) {
  if (index < 0) return null;
  const value = row[index];
  if (typeof value === "number") return metricValueToRuleNumber({ value }, semantic);
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text === "--" || text === "-") return null;
  const parsed = parseDisplayedMetricValue(text, semantic, declaredUnitFromHeader(header, semantic));
  if (parsed.status === "INVALID") return null;
  return metricValueToRuleNumber({ value: parsed.normalizedText }, semantic);
}

function readNonNegativeNumberCell(row: unknown[], index: number, semantic: MetricValueSemantic, header?: string) {
  const value = readNumberCell(row, index, semantic, header);
  return value != null && value >= 0 ? value : null;
}

function readRateCell(row: unknown[], index: number, header?: string) {
  const value = readNumberCell(row, index, "PERCENTAGE", header);
  if (value == null) return null;
  return value >= 0 && value <= 1 ? value : null;
}

function declaredUnitFromHeader(header: string | undefined, semantic: MetricValueSemantic) {
  if (!header) return null;
  if (semantic === "PERCENTAGE" && /%|百分比/.test(header)) return "%";
  if (semantic === "CURRENCY" && /元|人民币|金额|消耗|预算|售价|价格/.test(header)) return "yuan";
  if (semantic === "ROI" && /倍/.test(header)) return "倍";
  return null;
}

function hasInvalidRateCell(row: unknown[], index: number, header?: string) {
  if (index < 0) return false;
  const raw = row[index];
  if (raw == null || String(raw).trim() === "" || String(raw).trim() === "--" || String(raw).trim() === "-") return false;
  return readRateCell(row, index, header) == null;
}

function conservativeRate(numerator: number, denominator: number, minimumDenominator: number) {
  if (denominator < minimumDenominator || numerator < 0 || numerator > denominator || denominator <= 0) return null;
  const rate = numerator / denominator;
  const z = 1.96;
  const denominatorTerm = 1 + z * z / denominator;
  const centre = rate + z * z / (2 * denominator);
  const margin = z * Math.sqrt((rate * (1 - rate) + z * z / (4 * denominator)) / denominator);
  return { raw: rate, score: Math.max(0, (centre - margin) / denominatorTerm) };
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}


function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
function formatNullable(value: number | null) {
  return value == null ? "缺失" : formatNumber(value);
}
function formatPercent(value: number) {
  return `${(value * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}
