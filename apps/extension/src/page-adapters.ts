import {
  collectionFieldProfiles,
  metricFieldsForRoute,
  metricValueSemantic,
  normalizeMetricLookupValue,
  parseDisplayedMetricValue,
  tableFieldForHeader,
  type CaptureMeta,
  type CollectionFieldProfile,
  type CollectionMetricFieldDefinition,
  type CollectionRouteKey,
  type PageType,
  type VisibleMetric
} from "@douyin-local-life/shared";

export type PageAdapterInput = {
  document: Document;
  url: string;
  title: string;
  visibleText: string;
  tables: unknown[];
  routeKey?: CollectionRouteKey;
};

export type PageAdapter = {
  id: string;
  version: string;
  pageType: PageType;
  expectedFields: string[];
  detect(input: PageAdapterInput): boolean;
  extractMetrics(input: PageAdapterInput): VisibleMetric[];
  extractCoverage(input: PageAdapterInput, metrics: VisibleMetric[]): CaptureMeta;
};

type MetricDefinition = { key: string; name: string; unit?: string; labels: string[] };
type MetricBinding = { definition: MetricDefinition; label: string; displayValue: string; evidence: NonNullable<VisibleMetric["rawEvidence"]>; value: number | string | null; unit: string | null; confidence: number };

const adapters: PageAdapter[] = [
  createAdapter("LIVE_PRODUCT_TAB"),
  createAdapter("LIVE_TRAFFIC_TAB"),
  createAdapter("LIVE_DATA_SCREEN"),
  createAdapter("LOCAL_PROMOTION_DASHBOARD"),
  createAdapter("TASK_TABLE")
];

export function selectPageAdapter(input: PageAdapterInput): PageAdapter {
  return adapters.find((adapter) => adapter.detect(input)) || unknownAdapter;
}

function createAdapter(routeKey: CollectionRouteKey): PageAdapter {
  const profile = collectionFieldProfiles[routeKey];
  if (!profile) throw new Error(`Missing collection field profile for ${routeKey}`);
  return {
    id: profile.adapterId,
    version: "2.1.0",
    pageType: profile.pageType,
    expectedFields: [...profile.metricKeys],
    detect(input) {
      if (input.routeKey === routeKey) return true;
      if (input.routeKey && input.routeKey !== "UNKNOWN") return false;
      const combined = `${input.title}\n${input.url}\n${input.visibleText.slice(0, 50_000)}`;
      return profile.keywords.some((keyword) => combined.includes(keyword));
    },
    extractMetrics(input) {
      return extractBoundMetrics(input.document, routeKey, profile);
    },
    extractCoverage(input, metrics) {
      return buildCaptureMeta(this, input, metrics, profile, routeKey);
    }
  };
}

const unknownAdapter: PageAdapter = {
  id: "unknown-page",
  version: "2.0.0",
  pageType: "UNKNOWN",
  expectedFields: [],
  detect: () => true,
  extractMetrics: () => [],
  extractCoverage(input, metrics) {
    return buildCaptureMeta(this, input, metrics);
  }
};

function extractBoundMetrics(document: Document, routeKey: CollectionRouteKey, profile: CollectionFieldProfile): VisibleMetric[] {
  if (typeof document.querySelectorAll !== "function") return [];
  const definitions = metricFieldsForRoute(routeKey).map(toMetricDefinition);
  return definitions.flatMap((definition) => {
    const bindings = findMetricBindings(document, definition, profile);
    if (bindings.length !== 1) {
      const labelCount = countMetricLabels(document, definition.labels);
      if (!labelCount) return [];
      return [invalidBindingMetric(definition, labelCount > 1 ? "FIELD_BINDING_AMBIGUOUS" : "FIELD_VALUE_NOT_UNIQUE")];
    }
    const binding = bindings[0]!;
    return [{
      key: binding.definition.key,
      name: binding.definition.name,
      value: binding.value,
      unit: binding.unit,
      source: "dom" as const,
      metricSource: "DOM_TEXT" as const,
      confidence: binding.confidence,
      rawEvidence: binding.evidence
    }];
  });
}

function toMetricDefinition(definition: CollectionMetricFieldDefinition): MetricDefinition {
  return { ...definition, labels: [...definition.labels] };
}

function invalidBindingMetric(definition: MetricDefinition, reason: string): VisibleMetric {
  return {
    key: definition.key,
    name: definition.name,
    value: null,
    unit: definition.unit || null,
    source: "dom",
    metricSource: "DOM_TEXT",
    confidence: 0.1,
    rawEvidence: {
      sourceType: "DOM_TEXT",
      bindingKind: "CARD",
      fieldLabel: definition.labels[0],
      displayValue: "",
      unitSource: definition.unit ? "DEFAULT" : "NONE",
      validationStatus: "INVALID",
      validationReasons: [reason],
      textSnippet: definition.labels[0]
    }
  };
}

function countMetricLabels(document: Document, labels: string[]) {
  return [...document.querySelectorAll("*")].filter((element) => isVisible(element) && isExactMetricLabel(element, labels)).length;
}

function findMetricBindings(document: Document, definition: MetricDefinition, profile: CollectionFieldProfile): MetricBinding[] {
  const labelElements = [...document.querySelectorAll("*")].filter((element) => isVisible(element) && isExactMetricLabel(element, definition.labels));
  const bindings: MetricBinding[] = [];
  for (const labelElement of labelElements) {
    const container = findMetricContainer(labelElement);
    if (!container) continue;
    const labelsInContainer = [...container.querySelectorAll("*")].filter((element) => isVisible(element) && isExactMetricLabel(element, definition.labels));
    if (labelsInContainer.length !== 1) continue;
    const values = findMetricValueElements(container, labelElement, definition);
    if (values.length !== 1) continue;
    const displayValue = textOf(values[0]!);
    const parsed = parseDisplayedMetricValue(displayValue, metricValueSemantic(definition.key), definition.unit);
    const periodElement = findTimeRangeElement(container);
    const timeRange = periodElement ? extractTimeRange(textOf(periodElement)) : null;
    const periodLocation = periodElement ? componentPath(container, periodElement) : null;
    const periodReasons = profile.periodRequired && !timeRange ? ["TIME_RANGE_MISSING"] : [];
    const label = textOf(labelElement);
    bindings.push({
      definition,
      label,
      displayValue,
      value: parsed.normalizedText,
      unit: definition.unit || parsed.unit,
      confidence: parsed.status === "INVALID" || parsed.normalizedText == null || periodReasons.length ? 0.1 : 0.82,
      evidence: {
        sourceType: "DOM_TEXT",
        bindingKind: "CARD",
        fieldLabel: label,
        displayValue,
        normalizedValue: parsed.normalizedText,
        displayPrecision: parsed.displayPrecision,
        multiplier: parsed.multiplier,
        unitSource: parsed.unit && parsed.unit !== definition.unit ? "VALUE" : definition.unit ? "DEFAULT" : "NONE",
        timeRange,
        timeRangeSource: timeRange ? "COMPONENT" : undefined,
        timeRangeLocation: periodLocation,
        componentPath: componentPath(container, labelElement),
        calibrationSignature: bindingSignature(definition.key, label, parsed.unit || definition.unit || null, componentPath(container, labelElement), periodLocation),
        validationStatus: parsed.status === "INVALID" || parsed.normalizedText == null || periodReasons.length ? "INVALID" : parsed.status,
        validationReasons: [...parsed.reasons, ...periodReasons],
        textSnippet: `${label} ${displayValue}`
      }
    });
  }
  return bindings;
}

function findMetricContainer(label: Element) {
  let current: Element | null = label.parentElement;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    const className = current.getAttribute("class") || "";
    if (current.tagName === "ARTICLE" || current.tagName === "SECTION" || /card|metric|indicator|overview|data-item/i.test(className)) return current;
    if (current.children.length <= 8 && current.querySelectorAll("*").length <= 24) return current;
  }
  return null;
}

function findMetricValueElements(container: Element, label: Element, definition: MetricDefinition) {
  const descendants = [...container.querySelectorAll("*")];
  const labelIndex = descendants.indexOf(label);
  return descendants.filter((element, index) => {
    if (index <= labelIndex) return false;
    if (element === label || !isVisible(element) || element.children.length > 0) return false;
    const text = textOf(element);
    if (!text || isExactMetricLabel(element, definition.labels)) return false;
    const parsed = parseDisplayedMetricValue(text, metricValueSemantic(definition.key), definition.unit);
    return parsed.normalizedText != null || parsed.reasons.includes("VALUE_MISSING");
  });
}

function isExactMetricLabel(element: Element, labels: string[]) {
  const text = normalizeMetricLookupValue(textOf(element));
  return Boolean(text) && labels.some((label) => text === normalizeMetricLookupValue(label));
}

function isVisible(element: Element) {
  return !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true";
}

function textOf(element: Element) {
  return (element.textContent || "").replace(/\s+/g, " ").trim();
}

function extractTimeRange(text: string) {
  return text.match(/(?:今日|昨日|昨天|实时|本场|整场|近\s*\d+\s*(?:分钟|小时|天)|\d{1,2}:\d{2}\s*[-至]\s*\d{1,2}:\d{2}|\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:\s*[-至]\s*\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)?)/)?.[0] || null;
}

function findTimeRangeElement(container: Element) {
  return [container, ...container.querySelectorAll("*")].find((element) => (
    isVisible(element)
    && element.children.length === 0
    && Boolean(extractTimeRange(textOf(element)))
  )) || null;
}

function componentPath(container: Element, target: Element) {
  const path: string[] = [];
  let current: Element | null = target;
  while (current) {
    const parent: Element | null = current.parentElement;
    const siblingIndex = parent ? [...parent.children].indexOf(current) : 0;
    path.unshift(`${current.tagName.toLowerCase()}:${Math.max(0, siblingIndex)}`);
    if (current === container) break;
    current = parent;
  }
  return path.join(">");
}

function bindingSignature(metricKey: string, label: string, unit: string | null, path: string, periodLocation: string | null) {
  return [metricKey, normalizeMetricLookupValue(label), unit || "", path, periodLocation || ""].join("|");
}

function buildCaptureMeta(adapter: PageAdapter, input: PageAdapterInput, metrics: VisibleMetric[], profile?: CollectionFieldProfile, routeKey?: CollectionRouteKey): CaptureMeta {
  const extractedFields = [...new Set(metrics.map((metric) => String(metric.key)))];
  const expected = adapter.expectedFields;
  const matched = expected.filter((field) => extractedFields.includes(field)).length;
  const coverageRatio = expected.length ? matched / expected.length : 0;
  const renderModes: CaptureMeta["renderModes"] = ["DOM"];
  if (typeof input.document.querySelector === "function" && input.document.querySelector('table,[role="table"],[role="grid"]')) renderModes.push("TABLE");
  if (typeof input.document.querySelector === "function" && input.document.querySelector("canvas")) renderModes.push("CANVAS");
  if (detectVirtualizedContent(input.document)) renderModes.push("VIRTUALIZED");
  const partialRender = renderModes.includes("CANVAS") || renderModes.includes("VIRTUALIZED");
  const completeness = adapter.pageType === "UNKNOWN" ? "UNKNOWN" : partialRender || coverageRatio < 0.75 ? "PARTIAL" : "COMPLETE";
  const originalBytes = byteLength(input.visibleText) + byteLength(safeStringify(input.tables));
  const truncatedFields = input.visibleText.length >= 200_000 ? ["rawDomText"] : [];
  const tableBindings = extractTableBindings(input, profile, routeKey);
  return {
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    pageFingerprint: fingerprintPage(input, metrics, tableBindings),
    completeness,
    coverageRatio: Math.round(coverageRatio * 100) / 100,
    expectedFields: expected,
    extractedFields,
    visibleRegions: typeof input.document.querySelectorAll === "function" ? [...input.document.querySelectorAll("h1,h2,h3,[role=heading]")].slice(0, 30).map(textOf).filter(Boolean) : [],
    renderModes: [...new Set(renderModes)],
    tableBindings,
    tabState: input.document.visibilityState === "visible" ? "VISIBLE" : "HIDDEN",
    originalBytes,
    acceptedBytes: originalBytes,
    truncatedFields,
    truncationReasons: truncatedFields.length ? ["DOM_TEXT_LIMIT"] : []
  };
}

function extractTableBindings(input: PageAdapterInput, profile?: CollectionFieldProfile, routeKey?: CollectionRouteKey) {
  const tableElements = typeof input.document.querySelectorAll === "function"
    ? [...input.document.querySelectorAll('table,[role="table"],[role="grid"]')].filter(isVisible)
    : [];
  return input.tables.flatMap((table, tableIndex) => {
    if (tableIndex > 3 || !Array.isArray(table) || !Array.isArray(table[0])) return [];
    const headers = (table[0] as unknown[]).map((cell) => String(cell ?? "").trim()).slice(0, 100);
    if (!headers.length || headers.every((header) => !header)) return [];
    const normalizedHeaders = headers.map(normalizeMetricLookupValue);
    const tableFields = headers.map((header) => profile ? tableFieldForHeader(routeKey || input.routeKey || "UNKNOWN", header) : null);
    const identityColumnIndex = tableFields.findIndex((field) => field?.identity);
    const identityColumn = identityColumnIndex >= 0 ? headers[identityColumnIndex]! : null;
    const duplicatedHeader = normalizedHeaders.some((header, index) => header && normalizedHeaders.indexOf(header) !== index);
    const duplicatedField = tableFields.some((field, index) => field && tableFields.findIndex((candidate) => candidate?.key === field.key) !== index);
    const rowIdentities = (table.slice(1) as unknown[])
      .map((row) => Array.isArray(row) && identityColumnIndex >= 0 ? String(row[identityColumnIndex] ?? "").trim() : "");
    const missingRowIdentity = rowIdentities.some((value) => !value);
    const duplicateRowIdentity = new Set(rowIdentities.filter(Boolean)).size !== rowIdentities.filter(Boolean).length;
    const rowWidthMismatch = (table as unknown[][]).some((row) => Array.isArray(row) && row.length !== headers.length);
    const uncalibratedHeader = tableFields.some((field, index) => !field && Boolean(headers[index]));
    const tableElement = tableElements[tableIndex] || null;
    const tableContext = tableElement ? findTableContext(tableElement) : null;
    const periodElement = tableContext ? findTimeRangeElement(tableContext) : null;
    const timeRange = periodElement ? extractTimeRange(textOf(periodElement)) : null;
    const tablePath = tableElement && tableContext ? componentPath(tableContext, tableElement) : null;
    const timeRangeLocation = periodElement && tableContext ? componentPath(tableContext, periodElement) : null;
    const invalidReasons = [
      ...(headers.some((header) => !header) ? ["TABLE_HEADER_MISSING"] : []),
      ...(identityColumn ? [] : ["TABLE_IDENTITY_COLUMN_MISSING"]),
      ...(duplicatedHeader ? ["TABLE_HEADER_AMBIGUOUS"] : []),
      ...(duplicatedField ? ["TABLE_FIELD_AMBIGUOUS"] : []),
      ...(missingRowIdentity ? ["TABLE_ROW_IDENTITY_MISSING"] : []),
      ...(duplicateRowIdentity ? ["TABLE_ROW_IDENTITY_DUPLICATED"] : []),
      ...(rowWidthMismatch ? ["TABLE_COLUMN_COUNT_MISMATCH"] : []),
      ...(profile?.periodRequired && !timeRange ? ["TIME_RANGE_MISSING"] : [])
    ];
    const reviewReasons = [
      ...(!profile?.tableFields.length ? ["TABLE_ROUTE_SCHEMA_UNCALIBRATED"] : []),
      ...(uncalibratedHeader ? ["TABLE_HEADER_UNCALIBRATED"] : [])
    ];
    const signature = [
      headers.map((header) => normalizeMetricLookupValue(header) || "<empty>").join("|"),
      identityColumnIndex,
      tablePath || "",
      timeRangeLocation || ""
    ].join("::");
    return [{
      tableIndex,
      headers,
      identityColumn,
      identityColumnIndex: identityColumnIndex >= 0 ? identityColumnIndex : null,
      timeRange,
      timeRangeLocation,
      componentPath: tablePath,
      bindingSignature: signature,
      validationStatus: invalidReasons.length ? "INVALID" as const : "REQUIRES_REVIEW" as const,
      validationReasons: [...invalidReasons, ...reviewReasons]
    }];
  });
}

function findTableContext(table: Element) {
  let fallback: Element = table;
  let current: Element | null = table;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    if (current.tagName === "BODY" || current.tagName === "HTML") break;
    fallback = current;
    if (findTimeRangeElement(current)) return current;
  }
  return fallback;
}

function detectVirtualizedContent(document: Document) {
  if (typeof document.querySelectorAll !== "function") return false;
  return [...document.querySelectorAll("[aria-rowcount]")].some((element) => {
    const total = Number(element.getAttribute("aria-rowcount") || 0);
    const rendered = element.querySelectorAll('[role="row"]').length;
    return total > rendered && rendered > 0;
  });
}

function fingerprintPage(input: PageAdapterInput, metrics: VisibleMetric[], tableBindings: NonNullable<CaptureMeta["tableBindings"]>) {
  const headers = typeof input.document.querySelectorAll === "function"
    ? [...input.document.querySelectorAll("h1,h2,h3,th,[role=columnheader]")].slice(0, 50).map(textOf).join("|")
    : "";
  const url = new URL(input.url);
  const metricStructure = metrics.map((metric) => metric.rawEvidence?.calibrationSignature || "").filter(Boolean).sort().join("|");
  const tableStructure = tableBindings.map((binding) => binding.bindingSignature).sort().join("|");
  const value = `${url.hostname}${url.pathname}|${input.title}|${headers}|${metricStructure}|${tableStructure}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function safeStringify(value: unknown) {
  try { return JSON.stringify(value) || ""; } catch { return ""; }
}
