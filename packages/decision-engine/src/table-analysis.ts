import {
  structuredCollectionDataSchema,
  structuredCollectionDataVersion,
  type CollectionRouteKey,
  type DecisionTableInput,
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

const productColumnAliases = {
  id: ["商品ID", "商品编号", "SPUID", "商品编码"],
  name: ["商品名称", "商品标题", "商品名"],
  price: ["售价", "商品售价", "原价"],
  seckillPrice: ["秒杀价", "活动价", "到手价"],
  paymentAmount: ["支付金额", "成交金额", "商品成交金额", "GMV"],
  orders: ["支付订单数", "支付订单", "成交订单数", "成交订单", "订单数"],
  impressions: ["商品曝光人数", "商品曝光", "曝光人数", "曝光量", "曝光"],
  clicks: ["商品点击人数", "商品点击", "点击人数", "点击量", "点击"],
  detailVisits: ["商品详情访问人数", "商品详情访问", "详情访问人数", "详情访问"],
  submitVisits: ["提单访问人数", "提单访问", "提交订单人数", "提单人数"],
  submitRate: ["提单率", "提交订单率"],
  conversionRate: ["支付转化率", "成交转化率", "转化率"]
} as const;

const unitColumnAliases = {
  id: ["投流单元ID", "单元ID", "任务ID", "计划ID"],
  name: ["投流单元", "单元名称", "任务名称", "计划名称", "广告组名称"],
  status: ["投放状态", "任务状态", "计划状态", "状态"],
  budget: ["日预算", "每日预算", "预算"],
  spend: ["广告消耗", "总消耗", "消耗"],
  roi: ["支付ROI", "核销ROI", "整体支付ROI", "ROI"],
  targetRoi: ["目标ROI", "目标支付ROI", "ROI目标"],
  orders: ["支付订单数", "支付订单", "成交订单数", "订单数"],
  impressions: ["曝光量", "曝光次数", "曝光"],
  clicks: ["点击量", "点击次数", "点击人数", "点击"],
  ctr: ["点击率", "CTR"]
} as const;

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
      const parseNumber = (field: string, columnIndex: number, rate = false) => {
        if (columnIndex < 0) return null;
        const raw = row[columnIndex];
        const text = raw == null ? "" : String(raw).trim();
        if (!text || text === "--" || text === "-") return null;
        const parsed = rate
          ? readRateCell(row, columnIndex)
          : readNonNegativeNumberCell(row, columnIndex);
        if (parsed == null && warnings.length < 20) {
          warnings.push(`表 ${table.tableIndex + 1} 第 ${rowIndex + 1} 行 ${field} 无法解析，已保留为空`);
        }
        return parsed;
      };
      rows.push({
        taskId,
        taskName,
        status: readTextCell(row, columns.status),
        budget: parseNumber("预算", columns.budget),
        spend: parseNumber("消耗", columns.spend),
        roi: parseNumber("ROI", columns.roi),
        targetRoi: parseNumber("目标 ROI", columns.targetRoi),
        orders: parseNumber("订单", columns.orders),
        impressions: parseNumber("曝光", columns.impressions),
        clicks: parseNumber("点击", columns.clicks),
        ctr: parseNumber("CTR", columns.ctr, true),
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
    const price = firstNumberCell(row, [columns.seckillPrice, columns.price]);
    const paymentAmount = readNumberCell(row, columns.paymentAmount);
    const orders = readNumberCell(row, columns.orders);
    const impressions = readNumberCell(row, columns.impressions);
    const clicks = readNumberCell(row, columns.clicks);
    const detailVisits = readNumberCell(row, columns.detailVisits);
    const submitVisits = readNumberCell(row, columns.submitVisits);
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
      invalidSubmitRate: hasInvalidRateCell(row, columns.submitRate),
      invalidConversionRate: hasInvalidRateCell(row, columns.conversionRate)
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
    const spend = readNumberCell(row, columns.spend);
    if (spend == null || spend < 0) return [];
    const roi = readNumberCell(row, columns.roi);
    const orders = readNumberCell(row, columns.orders);
    const impressions = readNumberCell(row, columns.impressions);
    const clicks = readNumberCell(row, columns.clicks);
    const parsedCtr = readRateCell(row, columns.ctr);
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
  const headerIndex = Math.max(0, rows.slice(0, 5).map((row) => row.filter((cell) => String(cell ?? "").trim()).length).reduce((best, count, index, counts) => count > counts[best]! ? index : best, 0));
  return { routeKey, tableIndex, headers: rows[headerIndex]!.map((cell) => String(cell ?? "").trim()), rows: rows.slice(headerIndex + 1) };
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
  const normalizedAliases = aliases.map(normalizeColumnName).sort((left, right) => right.length - left.length);
  const exact = normalizedHeaders.findIndex((header) => normalizedAliases.includes(header));
  if (exact >= 0) return exact;
  return normalizedHeaders.findIndex((header) => normalizedAliases.some((alias) => alias.length >= 3 && header.includes(alias)));
}

function normalizeColumnName(value: string) {
  return value.toLowerCase().replace(/[\s_\-—/（）()：:·]/g, "");
}

function readTextCell(row: unknown[], index: number) {
  if (index < 0) return null;
  const value = String(row[index] ?? "").trim();
  return value && value !== "--" ? value.slice(0, 120) : null;
}

function firstNumberCell(row: unknown[], indexes: number[]) {
  for (const index of indexes) {
    const value = readNumberCell(row, index);
    if (value != null && value > 0) return value;
  }
  return null;
}

function readNumberCell(row: unknown[], index: number) {
  if (index < 0) return null;
  const value = row[index];
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text === "--" || text === "-") return null;
  const multiplier = /万|w/i.test(text) ? 10_000 : /千/.test(text) ? 1_000 : 1;
  const parsed = Number(text.replace(/[¥￥,%\s,，万千wW]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return text.includes("%") ? parsed / 100 : parsed * multiplier;
}

function readNonNegativeNumberCell(row: unknown[], index: number) {
  const value = readNumberCell(row, index);
  return value != null && value >= 0 ? value : null;
}

function readRateCell(row: unknown[], index: number) {
  const value = readNumberCell(row, index);
  if (value == null) return null;
  const raw = index >= 0 ? row[index] : null;
  if (typeof raw === "string" && raw.includes("%")) {
    return value >= 0 && value <= 1 ? value : null;
  }
  const normalized = value > 1 && value <= 100 ? value / 100 : value;
  return normalized >= 0 && normalized <= 1 ? normalized : null;
}

function hasInvalidRateCell(row: unknown[], index: number) {
  if (index < 0) return false;
  const raw = row[index];
  if (raw == null || String(raw).trim() === "" || String(raw).trim() === "--" || String(raw).trim() === "-") return false;
  return readRateCell(row, index) == null;
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
