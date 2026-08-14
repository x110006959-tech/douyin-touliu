export const metricValidationStatuses = ["TRUSTED", "REQUIRES_REVIEW", "INVALID"] as const;
export type MetricValidationStatus = (typeof metricValidationStatuses)[number];

export type MetricValueSemantic = "CURRENCY" | "PERCENTAGE" | "ROI" | "COUNT" | "UNKNOWN";

export type ParsedMetricValue = {
  displayValue: string;
  normalizedText: string | null;
  displayPrecision: number | null;
  multiplier: number;
  unit: string | null;
  status: MetricValidationStatus;
  reasons: string[];
};

export type MetricRawEvidence = {
  sourceType: string;
  path?: string;
  selector?: string;
  tableIndex?: number;
  rowIndex?: number;
  columnName?: string;
  url?: string;
  method?: string;
  jsonPath?: string;
  textSnippet?: string;
  fieldLabel?: string;
  displayValue?: string;
  normalizedValue?: string | null;
  displayPrecision?: number | null;
  multiplier?: number;
  unitSource?: "VALUE" | "HEADER" | "LABEL" | "DEFAULT" | "NONE";
  timeRange?: string | null;
  timeRangeSource?: "COMPONENT" | "TABLE_CONTEXT" | "MANUAL";
  timeRangeLocation?: string | null;
  bindingKind?: "CARD" | "TABLE" | "MANUAL";
  componentPath?: string;
  rowIdentity?: string;
  calibrationSignature?: string;
  validationStatus?: MetricValidationStatus;
  validationReasons?: string[];
  sourceStatus?: "INTERNAL_API" | "DOM_TEXT" | "API_AND_DOM" | "SOURCE_CONFLICT";
  apiCandidate?: MetricSourceCandidate;
  domCandidate?: MetricSourceCandidate;
  selectionReason?: string;
  manualSourceSelection?: "API" | "DOM" | "IGNORE";
  semanticScope?: string;
  apiContractVersion?: string;
  apiAdapterVersion?: string;
  endpointKey?: string;
  evidencePurpose?: "PULSE_ONLY" | "SNAPSHOT_EVIDENCE" | "SNAPSHOT_DISPLAY_ONLY";
};

export type MetricSourceCandidate = {
  value: string;
  displayValue: string;
  unit: string | null;
  timeRange: string;
  displayPrecision: number;
  fieldPath: string;
  fieldLabel: string;
};

const currencyMetricKeys = new Set([
  "spend", "daily_budget", "remaining_budget", "recent_30m_spend", "cpa", "target_cpa",
  "gmv", "gpm", "shelf_gmv", "search_gmv", "gross_profit", "merchant_subsidy",
  "service_fee", "platform_subsidy", "ad_coupon", "rebate_coupon"
]);

const percentageMetricKeys = new Set(["ctr", "product_click_rate", "product_conversion_rate", "live_room_click_rate", "complaint_rate", "refund_rate", "fulfillment_exception_rate"]);
const roiMetricKeys = new Set(["pay_roi", "full_domain_pay_roi", "verify_roi", "gross_profit_roi", "target_roi"]);

export function metricValueSemantic(metricKey: string): MetricValueSemantic {
  if (currencyMetricKeys.has(metricKey)) return "CURRENCY";
  if (percentageMetricKeys.has(metricKey)) return "PERCENTAGE";
  if (roiMetricKeys.has(metricKey)) return "ROI";
  return "COUNT";
}

export function parseDisplayedMetricValue(
  value: string | number | null | undefined,
  semantic: MetricValueSemantic = "UNKNOWN",
  declaredUnit?: string | null
): ParsedMetricValue {
  const displayValue = value == null ? "" : String(value).trim();
  if (!displayValue || displayValue === "--" || displayValue === "-") {
    return {
      displayValue,
      normalizedText: null,
      displayPrecision: null,
      multiplier: 1,
      unit: null,
      status: "REQUIRES_REVIEW",
      reasons: ["VALUE_MISSING"]
    };
  }

  const matched = displayValue.match(/^[¥￥]?\s*(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(万|千|w|W|k|K)?\s*(%|元|人民币|倍)?\s*$/);
  if (!matched) {
    return invalid(displayValue, "VALUE_FORMAT_INVALID");
  }

  const numeric = matched[1]!.replace(/,/g, "");
  const suffix = matched[2] || "";
  const explicitUnit = matched[3] || "";
  const multiplier = /万|w/i.test(suffix) ? 10_000 : /千|k/i.test(suffix) ? 1_000 : 1;
  const isPercent = explicitUnit === "%" || declaredUnit === "%";
  const precision = numeric.split(".")[1]?.length || 0;
  const normalizedText = scaleDecimal(numeric, multiplier, isPercent ? -2 : 0);

  const reasons: string[] = [];
  if (semantic === "ROI" && isPercent) reasons.push("ROI_CANNOT_USE_PERCENT_UNIT");
  if (semantic === "ROI" && suffix) reasons.push("ROI_CANNOT_USE_QUANTITY_UNIT");
  if (semantic === "ROI" && explicitUnit && explicitUnit !== "倍" && explicitUnit !== "%") reasons.push("ROI_UNIT_MISMATCH");
  if (semantic === "PERCENTAGE" && !isPercent) reasons.push("PERCENT_UNIT_NOT_EXPLICIT");
  if (semantic === "PERCENTAGE" && suffix) reasons.push("PERCENT_CANNOT_USE_QUANTITY_UNIT");
  if (semantic === "PERCENTAGE" && explicitUnit && explicitUnit !== "%") reasons.push("PERCENT_UNIT_MISMATCH");
  if (semantic === "CURRENCY" && (explicitUnit === "%" || explicitUnit === "倍")) reasons.push("CURRENCY_UNIT_MISMATCH");
  if (semantic === "COUNT" && explicitUnit) reasons.push("COUNT_UNIT_MISMATCH");

  return {
    displayValue,
    normalizedText,
    displayPrecision: precision,
    multiplier,
    unit: explicitUnit || declaredUnit || null,
    status: reasons.length ? "INVALID" : "REQUIRES_REVIEW",
    reasons
  };
}

function invalid(displayValue: string, reason: string): ParsedMetricValue {
  return {
    displayValue,
    normalizedText: null,
    displayPrecision: null,
    multiplier: 1,
    unit: null,
    status: "INVALID",
    reasons: [reason]
  };
}

type MetricValueWithEvidence = {
  value: string | number | null;
  rawEvidence?: { normalizedValue?: string | null } | null;
};

// Persist the canonical decimal text; rule evaluation opts into a bounded number separately.
export function metricValueText(metric: MetricValueWithEvidence, semantic: MetricValueSemantic = "UNKNOWN") {
  const evidencedValue = metric.rawEvidence?.normalizedValue;
  if (typeof evidencedValue === "string" && isCanonicalDecimal(evidencedValue)) return evidencedValue;
  if (metric.value == null) return null;
  if (typeof metric.value === "number") {
    return Number.isFinite(metric.value) ? String(metric.value) : null;
  }
  return parseDisplayedMetricValue(metric.value, semantic).normalizedText;
}

// The existing rule engine uses Number arithmetic. Reject values outside its safe boundary
// instead of silently rounding persisted exact decimals during diagnosis.
export function metricValueToRuleNumber(metric: MetricValueWithEvidence, semantic: MetricValueSemantic = "UNKNOWN") {
  const normalizedText = metricValueText(metric, semantic);
  if (!normalizedText || !isRuleNumericRange(normalizedText)) return null;
  const numberValue = Number(normalizedText);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function scaleDecimal(value: string, multiplier: number, decimalShift: number) {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  const shift = (multiplier === 10_000 ? 4 : multiplier === 1_000 ? 3 : 0) - fraction.length + decimalShift;
  let result: string;
  if (shift >= 0) result = `${digits}${"0".repeat(shift)}`;
  else {
    const point = digits.length + shift;
    result = point > 0 ? `${digits.slice(0, point)}.${digits.slice(point)}` : `0.${"0".repeat(-point)}${digits}`;
  }
  result = result.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return negative && result !== "0" ? `-${result}` : result;
}

function isCanonicalDecimal(value: string) {
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
}

function isRuleNumericRange(value: string) {
  const unsigned = value.startsWith("-") ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const significantDigits = `${whole.replace(/^0+/, "")}${fraction}`.replace(/^0+/, "").length;
  return significantDigits <= 15 && fraction.length <= 12;
}
