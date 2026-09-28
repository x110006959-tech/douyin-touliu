import {
  isExactLocalPromotionInternalApiPage,
  localPromotionApiMetricKeys,
  localPromotionInternalApiAdapterVersion,
  localPromotionInternalApiContractVersion,
  localPromotionInternalApiDataSetKey,
  localPromotionInternalApiEndpointContracts,
  localPromotionInternalApiFields,
  localPromotionInternalApiFrameId,
  localPromotionInternalApiModuleId,
  localPromotionInternalApiPageMetricsRequestSchema,
  localPromotionInternalApiPromoteMetaRequestSchema,
  localPromotionInternalApiRequestSchema,
  metricValueSemantic,
  parseDisplayedMetricValue,
  resolveLocalPromotionIdentity,
  type CaptureMeta,
  type LocalPromotionInternalApiEndpointKey,
  type LocalPromotionInternalApiField,
  type LocalPromotionInternalApiMetricGroupKey,
  type LocalPromotionInternalApiIdentityResolution,
  type VisibleMetric
} from "@douyin-local-life/shared";

const sensitiveResponsePattern = /cookie|token|authorization|secret|session|credential/i;
const totalResponseLimit = 256 * 1024;
const platformMetricNamePattern = /^[A-Za-z0-9_]{1,128}$/;
const localPromotionMetricType = 1;
export const localPromotionInternalApiRequestTimeoutMs = 4_000;

type ResolvedMetricBinding = {
  field: LocalPromotionInternalApiField;
  groupKey: LocalPromotionInternalApiMetricGroupKey;
  platformMetricName: string;
};

type Roi2PromotionQueryContext = {
  startTimeMs: string;
  endTimeMs: string;
  adIds: string[];
};

export type LocalPromotionInternalApiCollection = {
  metrics: VisibleMetric[];
  captureMeta: NonNullable<CaptureMeta["localPromotionInternalApi"]>;
  diagnostics?: LocalPromotionInternalApiDiagnostics;
};

type LocalPromotionInternalApiDiagnostics = {
  metadataGroups: Array<{ groupKey: string; metricCount: number; labels: string[] }>;
  matchedMetricKeys: string[];
  missingMetricKeys: string[];
  statQueryFallback?: { attempted: true; succeeded: boolean; failureReason?: string };
};

type EndpointRequestResult =
  | { ok: true; value: unknown; acceptedBytes: number }
  | { ok: false; status: "FAILED" | "ABORTED"; reason: string; acceptedBytes: number };

type PlatformDataResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: "BUSINESS_ERROR" | "SCHEMA_MISMATCH" };

type MetricBindingResult =
  | { ok: true; bindings: ResolvedMetricBinding[]; diagnostics: LocalPromotionInternalApiDiagnostics }
  | { ok: false; reason: "BUSINESS_ERROR" | "NO_USABLE_METRICS" | "SCHEMA_MISMATCH"; diagnostics?: LocalPromotionInternalApiDiagnostics };

export async function collectLocalPromotionInternalApi(input: {
  enabled: boolean;
  url: string;
  domIdentity?: Partial<Parameters<typeof resolveLocalPromotionIdentity>[0]["dom"]>;
  signal?: AbortSignal;
}): Promise<LocalPromotionInternalApiCollection> {
  const identity = resolveLocalPromotionIdentity({ url: input.url, dom: input.domIdentity });
  const endpointStatuses: LocalPromotionInternalApiCollection["captureMeta"]["endpointStatuses"] = [];
  const baseMeta: LocalPromotionInternalApiCollection["captureMeta"] = {
    contractVersion: localPromotionInternalApiContractVersion,
    adapterVersion: localPromotionInternalApiAdapterVersion,
    enabled: input.enabled,
    identity: {
      advid: identity.advid,
      roomId: identity.roomId,
      selectedAdvid: identity.selectedAdvid,
      selectedAwemeId: identity.selectedAwemeId,
      source: identity.source,
      evidence: identity.evidence
    },
    endpointStatuses,
    evidencePurpose: "PULSE_ONLY"
  };
  if (!input.enabled) return { metrics: [], captureMeta: baseMeta };
  if (!isExactLocalPromotionInternalApiPage(input.url)) {
    endpointStatuses.push(...skippedStatuses("PAGE_FORBIDDEN"));
    return { metrics: [], captureMeta: baseMeta };
  }
  if (identity.source === "MISMATCH" || (!identity.advid && !identity.selectedAdvid)) {
    endpointStatuses.push(...skippedStatuses("IDENTITY_UNAVAILABLE"));
    return { metrics: [], captureMeta: baseMeta };
  }

  let acceptedTotal = 0;
  const queryAdvid = identity.advid || identity.selectedAdvid || "";
  const pageMetricsRequest = localPromotionInternalApiPageMetricsRequestSchema.safeParse({ frameId: localPromotionInternalApiFrameId, advid: queryAdvid });
  if (!pageMetricsRequest.success) {
    endpointStatuses.push({ endpoint: "pageMetrics", status: "FAILED", acceptedBytes: 0, reason: "REQUEST_INVALID" });
    return { metrics: [], captureMeta: baseMeta };
  }
  const pageMetricsResponse = await requestEndpoint({
    endpoint: "pageMetrics",
    url: buildPageMetricsUrl(input.url, pageMetricsRequest.data.advid),
    method: "GET",
    query: pageMetricsRequest.data,
    signal: input.signal,
    limit: responseLimit("pageMetrics", acceptedTotal)
  });
  if (!pageMetricsResponse.ok) {
    endpointStatuses.push({ endpoint: "pageMetrics", status: pageMetricsResponse.status, acceptedBytes: pageMetricsResponse.acceptedBytes, reason: pageMetricsResponse.reason });
    return { metrics: [], captureMeta: baseMeta };
  }
  acceptedTotal += pageMetricsResponse.acceptedBytes;
  const bindingsResult = resolveMetricBindings(pageMetricsResponse.value);
  if (!bindingsResult.ok) {
    endpointStatuses.push({
      endpoint: "pageMetrics",
      status: bindingsResult.reason === "BUSINESS_ERROR" ? "FAILED" : "ABORTED",
      acceptedBytes: pageMetricsResponse.acceptedBytes,
      reason: bindingsResult.reason
    });
    return { metrics: [], captureMeta: baseMeta, diagnostics: bindingsResult.diagnostics };
  }
  endpointStatuses.push({ endpoint: "pageMetrics", status: "SUCCESS", acceptedBytes: pageMetricsResponse.acceptedBytes });

  const metrics: VisibleMetric[] = [];
  const statQueryBindings = groupBindings(bindingsResult.bindings);
  let roi2Context: Roi2PromotionQueryContext | null = null;
  if (statQueryBindings.has("roi2_promotion")) {
    const promoteMetaRequest = localPromotionInternalApiPromoteMetaRequestSchema.safeParse({
      iesCoreUserId: identity.selectedAwemeId,
      roomId: identity.roomId,
      advid: queryAdvid
    });
    if (!promoteMetaRequest.success) {
      endpointStatuses.push({ endpoint: "liveReportPromoteMeta", status: "FAILED", acceptedBytes: 0, reason: "IDENTITY_UNAVAILABLE" });
      endpointStatuses.push({ endpoint: "statQuery", status: "SKIPPED", acceptedBytes: 0, reason: "PROMOTE_META_UNAVAILABLE" });
      return { metrics: [], captureMeta: baseMeta, diagnostics: bindingsResult.diagnostics };
    }
    const promoteMetaResponse = await requestEndpoint({
      endpoint: "liveReportPromoteMeta",
      url: buildPromoteMetaUrl(input.url),
      method: "GET",
      query: promoteMetaRequest.data,
      signal: input.signal,
      limit: responseLimit("liveReportPromoteMeta", acceptedTotal)
    });
    if (!promoteMetaResponse.ok) {
      endpointStatuses.push({ endpoint: "liveReportPromoteMeta", status: promoteMetaResponse.status, acceptedBytes: promoteMetaResponse.acceptedBytes, reason: promoteMetaResponse.reason });
      endpointStatuses.push({ endpoint: "statQuery", status: "SKIPPED", acceptedBytes: 0, reason: "PROMOTE_META_UNAVAILABLE" });
      return { metrics: [], captureMeta: baseMeta, diagnostics: bindingsResult.diagnostics };
    }
    acceptedTotal += promoteMetaResponse.acceptedBytes;
    const parsedPromoteMeta = readPromoteMeta(promoteMetaResponse.value);
    if (!parsedPromoteMeta.ok) {
      endpointStatuses.push({ endpoint: "liveReportPromoteMeta", status: "ABORTED", acceptedBytes: promoteMetaResponse.acceptedBytes, reason: parsedPromoteMeta.reason });
      endpointStatuses.push({ endpoint: "statQuery", status: "SKIPPED", acceptedBytes: 0, reason: "PROMOTE_META_UNAVAILABLE" });
      return { metrics: [], captureMeta: baseMeta, diagnostics: bindingsResult.diagnostics };
    }
    roi2Context = parsedPromoteMeta.context;
    endpointStatuses.push({ endpoint: "liveReportPromoteMeta", status: "SUCCESS", acceptedBytes: promoteMetaResponse.acceptedBytes });
  } else {
    endpointStatuses.push({ endpoint: "liveReportPromoteMeta", status: "SKIPPED", acceptedBytes: 0, reason: "ROI2_METRICS_UNAVAILABLE" });
  }
  let statQueryAcceptedBytes = 0;
  let statQueryFailure: Extract<EndpointRequestResult, { ok: false }> | null = null;
  let statQueryRecoverableFailure: Extract<EndpointRequestResult, { ok: false }> | null = null;
  let statQueryPartialReason: string | null = null;
  let statQueryUsedV3Fallback = false;
  let statQueryFallbackSucceeded = false;
  let statQueryFallbackFailureReason: string | null = null;
  for (const [groupKey, bindings] of statQueryBindings) {
    const request = createStatQueryRequest(groupKey, bindings, identity, roi2Context);
    const parsedRequest = localPromotionInternalApiRequestSchema.safeParse(request);
    if (!parsedRequest.success) {
      statQueryFailure = { ok: false, status: "FAILED", acceptedBytes: statQueryAcceptedBytes, reason: "REQUEST_INVALID" };
      break;
    }
    let response = await requestEndpoint({
      endpoint: "statQuery",
      url: buildStatQueryUrl(input.url, queryAdvid),
      method: "POST",
      body: JSON.stringify(parsedRequest.data),
      signal: input.signal,
      limit: responseLimit("statQuery", acceptedTotal, statQueryAcceptedBytes)
    });
    statQueryAcceptedBytes += response.acceptedBytes;
    acceptedTotal += response.acceptedBytes;
    let statsResult = response.ok ? readStatQueryStats(response.value) : null;
    if (response.ok && statsResult && !statsResult.ok && statsResult.reason === "BUSINESS_ERROR") {
      const fallbackResponse = await requestEndpoint({
        endpoint: "statQuery",
        url: buildStatQueryFallbackUrl(input.url, queryAdvid),
        method: "POST",
        body: JSON.stringify(parsedRequest.data),
        signal: input.signal,
        limit: responseLimit("statQuery", acceptedTotal, statQueryAcceptedBytes)
      });
      statQueryAcceptedBytes += fallbackResponse.acceptedBytes;
      acceptedTotal += fallbackResponse.acceptedBytes;
      response = fallbackResponse;
      statsResult = response.ok ? readStatQueryStats(response.value) : null;
      if (response.ok && statsResult?.ok) {
        statQueryUsedV3Fallback = true;
        statQueryFallbackSucceeded = true;
      } else {
        statQueryFallbackFailureReason = !response.ok
          ? response.reason
          : statsResult && !statsResult.ok ? statsResult.reason : "BUSINESS_ERROR";
      }
    }
    if (!response.ok) {
      if (isFatalStatQueryReason(response.reason)) {
        statQueryFailure = { ...response, acceptedBytes: statQueryAcceptedBytes };
        break;
      }
      statQueryRecoverableFailure ||= { ...response, acceptedBytes: statQueryAcceptedBytes };
      statQueryPartialReason = response.reason;
      continue;
    }
    if (!statsResult || !statsResult.ok) {
      const reason = statsResult?.reason || "BUSINESS_ERROR";
      if (reason === "SCHEMA_MISMATCH") {
        statQueryFailure = { ok: false, status: "ABORTED", acceptedBytes: statQueryAcceptedBytes, reason };
        break;
      }
      statQueryRecoverableFailure ||= { ok: false, status: "FAILED", acceptedBytes: statQueryAcceptedBytes, reason };
      statQueryPartialReason = reason;
      continue;
    }
    const projected = projectMetrics(groupKey, bindings, statsResult.statsData);
    if (!projected.ok) {
      if (projected.reason === "SCHEMA_MISMATCH") {
        statQueryFailure = { ok: false, status: "ABORTED", acceptedBytes: statQueryAcceptedBytes, reason: projected.reason };
        break;
      }
      statQueryPartialReason = projected.reason;
      continue;
    }
    const previousMetricCount = metrics.length;
    metrics.push(...projected.metrics);
    if (metrics.length === previousMetricCount) statQueryPartialReason = "NO_USABLE_METRICS";
  }

  if (statQueryFailure) {
    endpointStatuses.push({ endpoint: "statQuery", status: statQueryFailure.status, acceptedBytes: statQueryFailure.acceptedBytes, reason: statQueryFailure.reason });
    metrics.length = 0;
  } else if (metrics.length === 0 && statQueryRecoverableFailure) {
    endpointStatuses.push({
      endpoint: "statQuery",
      status: statQueryRecoverableFailure.status,
      acceptedBytes: statQueryAcceptedBytes,
      reason: statQueryRecoverableFailure.reason
    });
  } else {
    endpointStatuses.push({
      endpoint: "statQuery",
      status: "SUCCESS",
      acceptedBytes: statQueryAcceptedBytes,
      ...(metrics.length === 0
        ? { reason: statQueryPartialReason || "NO_USABLE_METRICS" }
        : statQueryPartialReason
          ? { reason: "PARTIAL_METRICS" }
          : statQueryUsedV3Fallback && !statQueryFallbackFailureReason ? { reason: "V3_FALLBACK" } : {})
    });
  }

  const diagnostics = bindingsResult.diagnostics;
  diagnostics.matchedMetricKeys = metrics.map((metric) => metric.key);
  diagnostics.missingMetricKeys = localPromotionApiMetricKeys.filter((key) => !diagnostics.matchedMetricKeys.includes(key));
  if (statQueryUsedV3Fallback || statQueryFallbackFailureReason) {
    diagnostics.statQueryFallback = {
      attempted: true,
      succeeded: statQueryFallbackSucceeded,
      ...(statQueryFallbackFailureReason ? { failureReason: statQueryFallbackFailureReason } : {})
    };
  }
  return { metrics, captureMeta: baseMeta, diagnostics };
}

function isFatalStatQueryReason(reason: string) {
  return ["HTTP_401", "HTTP_429", "SENSITIVE_RESPONSE", "BYTE_LIMIT", "TOTAL_BYTE_LIMIT", "SCHEMA_MISMATCH", "ABORTED"].includes(reason);
}

function skippedStatuses(reason: string) {
  return (Object.keys(localPromotionInternalApiEndpointContracts) as LocalPromotionInternalApiEndpointKey[]).map((endpoint) => ({
    endpoint,
    status: "SKIPPED" as const,
    acceptedBytes: 0,
    reason
  }));
}

function responseLimit(endpoint: LocalPromotionInternalApiEndpointKey, acceptedTotal: number, acceptedEndpoint = 0) {
  return Math.min(
    Math.max(0, localPromotionInternalApiEndpointContracts[endpoint].maxResponseBytes - acceptedEndpoint),
    Math.max(0, totalResponseLimit - acceptedTotal)
  );
}

function buildPageMetricsUrl(sourceUrl: string, advid: string) {
  const url = new URL(localPromotionInternalApiEndpointContracts.pageMetrics.path, new URL(sourceUrl).origin);
  url.searchParams.set("frameId", localPromotionInternalApiFrameId);
  url.searchParams.set("advid", advid);
  return url.href;
}

function buildPromoteMetaUrl(sourceUrl: string) {
  return new URL(localPromotionInternalApiEndpointContracts.liveReportPromoteMeta.path, new URL(sourceUrl).origin).href;
}

function buildStatQueryUrl(sourceUrl: string, advid: string) {
  const url = new URL(localPromotionInternalApiEndpointContracts.statQuery.path, new URL(sourceUrl).origin);
  url.searchParams.set("advid", advid);
  return url.href;
}

function buildStatQueryFallbackUrl(sourceUrl: string, advid: string) {
  const url = new URL(localPromotionInternalApiEndpointContracts.statQuery.fallbackPaths[0], new URL(sourceUrl).origin);
  url.searchParams.set("advid", advid);
  return url.href;
}

async function requestEndpoint(input: {
  endpoint: LocalPromotionInternalApiEndpointKey;
  url: string;
  method: "GET" | "POST";
  body?: string;
  query?: Record<string, string>;
  signal?: AbortSignal;
  limit: number;
}): Promise<EndpointRequestResult> {
  const request = createRequest(input.signal);
  try {
    const response = await fetch(input.query ? appendQuery(input.url, input.query) : input.url, {
      method: input.method,
      ...(input.method === "POST" ? { headers: { "content-type": "application/json" }, body: input.body } : {}),
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      signal: request.signal
    });
    if (response.status === 401 || response.status === 429) {
      return { ok: false, status: "ABORTED", acceptedBytes: 0, reason: `HTTP_${response.status}` };
    }
    if (!response.ok) return { ok: false, status: "FAILED", acceptedBytes: 0, reason: `HTTP_${response.status}` };
    const payload = await readSafeJson(response, input.limit, request.signal);
    if (!payload.ok) {
      const reason = payload.reason === "ABORTED" && request.didTimeout() ? "REQUEST_TIMEOUT" : payload.reason;
      return {
        ok: false,
        status: ["SENSITIVE_RESPONSE", "BYTE_LIMIT", "ABORTED"].includes(reason) ? "ABORTED" : "FAILED",
        acceptedBytes: payload.acceptedBytes,
        reason
      };
    }
    return payload;
  } catch (error) {
    const reason = request.didTimeout() ? "REQUEST_TIMEOUT" : request.signal.aborted ? "ABORTED" : error instanceof Error ? "REQUEST_FAILED" : "REQUEST_FAILED";
    return { ok: false, status: reason === "ABORTED" ? "ABORTED" : "FAILED", acceptedBytes: 0, reason };
  } finally {
    request.dispose();
  }
}

function appendQuery(url: string, query: Record<string, string>) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
  return target.href;
}

function resolveMetricBindings(value: unknown): MetricBindingResult {
  // 平台指标名只在本次请求内由固定中文标签和分组白名单解析，绝不作为证据或本地状态保存。
  const dataResult = readPlatformData(value);
  if (!dataResult.ok) return dataResult;
  const moduleInfos = asArray(dataResult.data.ModuleInfos);
  if (!moduleInfos) return { ok: false, reason: "SCHEMA_MISMATCH" };
  const moduleInfo = moduleInfos.find((candidate) => asString(candidate, "ModuleId") === localPromotionInternalApiModuleId);
  const dataSetInfo = moduleInfo && asRecord(moduleInfo.DataSetInfo);
  if (!dataSetInfo || asString(dataSetInfo, "Identifier") !== localPromotionInternalApiDataSetKey) {
    return { ok: false, reason: "SCHEMA_MISMATCH" };
  }
  const groups = asArray(dataSetInfo.DataSetGroupInfos);
  if (!groups) return { ok: false, reason: "SCHEMA_MISMATCH" };
  const expandedGroups = expandMetricGroups(groups);
  if (!expandedGroups) return { ok: false, reason: "SCHEMA_MISMATCH" };

  const usedMetricNames = new Set<string>();
  const bindings: ResolvedMetricBinding[] = [];
  for (const field of localPromotionInternalApiFields) {
    const metricCandidates = findMetricCandidates(expandedGroups, field);
    if (metricCandidates === "SCHEMA_MISMATCH") return { ok: false, reason: "SCHEMA_MISMATCH", diagnostics: createMetadataDiagnostics(expandedGroups, bindings) };
    if (metricCandidates.length === 0) continue;
    if (metricCandidates.length > 1) return { ok: false, reason: "SCHEMA_MISMATCH", diagnostics: createMetadataDiagnostics(expandedGroups, bindings) };
    const [candidate] = metricCandidates;
    if (!candidate) return { ok: false, reason: "NO_USABLE_METRICS", diagnostics: createMetadataDiagnostics(expandedGroups, bindings) };
    if (usedMetricNames.has(candidate.platformMetricName)) return { ok: false, reason: "SCHEMA_MISMATCH", diagnostics: createMetadataDiagnostics(expandedGroups, bindings) };
    usedMetricNames.add(candidate.platformMetricName);
    bindings.push({ field, ...candidate });
  }
  const diagnostics = createMetadataDiagnostics(expandedGroups, bindings);
  return bindings.length > 0
    ? { ok: true, bindings, diagnostics }
    : { ok: false, reason: "NO_USABLE_METRICS", diagnostics };
}

function expandMetricGroups(groups: Record<string, unknown>[], depth = 0): Record<string, unknown>[] | null {
  if (depth > 2) return null;
  const expanded: Record<string, unknown>[] = [];
  for (const group of groups) {
    expanded.push(group);
    if (group.Groups === undefined) continue;
    const nestedGroups = asArray(group.Groups);
    if (!nestedGroups) return null;
    const nested = expandMetricGroups(nestedGroups, depth + 1);
    if (!nested) return null;
    expanded.push(...nested);
  }
  return expanded;
}

function createMetadataDiagnostics(groups: Record<string, unknown>[], bindings: ResolvedMetricBinding[]): LocalPromotionInternalApiDiagnostics {
  const metadataGroups = groups.slice(0, 6).map((group) => {
    const metricOrDimensions = asArray(group.MetricOrDimension) || [];
    const labels = metricOrDimensions
      .map((item) => isRecord(item) && typeof item.NameZh === "string" ? sanitizeDiagnosticLabel(item.NameZh) : "")
      .filter((label): label is string => Boolean(label))
      .slice(0, 12);
    return {
      groupKey: sanitizeDiagnosticLabel(typeof group.GroupKey === "string" ? group.GroupKey : "UNKNOWN_GROUP"),
      metricCount: metricOrDimensions.length,
      labels
    };
  });
  const matchedMetricKeys = bindings.map((binding) => binding.field.metricKey);
  return {
    metadataGroups,
    matchedMetricKeys,
    missingMetricKeys: localPromotionApiMetricKeys.filter((key) => !matchedMetricKeys.includes(key))
  };
}

function sanitizeDiagnosticLabel(value: string) {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return normalized.length > 80 ? `${normalized.slice(0, 79)}…` : normalized;
}

function findMetricCandidates(groups: Record<string, unknown>[], field: LocalPromotionInternalApiField) {
  const candidates: Array<{ groupKey: LocalPromotionInternalApiMetricGroupKey; platformMetricName: string }> = [];
  for (const groupKey of field.groupKeys) {
    const matchingGroups = groups.filter((candidate) => asString(candidate, "GroupKey") === groupKey);
    if (matchingGroups.length > 1) return "SCHEMA_MISMATCH" as const;
    const [group] = matchingGroups;
    if (!group) continue;
    const metricOrDimensions = asArray(group.MetricOrDimension);
    if (!metricOrDimensions) return "SCHEMA_MISMATCH" as const;
    for (const item of metricOrDimensions) {
      if (!isRecord(item) || item.Type !== localPromotionMetricType) continue;
      const platformMetricName = typeof item.Name === "string" ? item.Name.trim() : "";
      const metadataLabel = typeof item.NameZh === "string" ? item.NameZh.trim() : "";
      const normalizedMetadataLabel = normalizeMetadataLabel(metadataLabel);
      const matchesApprovedLabel = field.metadataLabels.some((label) => normalizeMetadataLabel(label) === normalizedMetadataLabel);
      if (platformMetricName && matchesApprovedLabel && platformMetricNamePattern.test(platformMetricName)) {
        candidates.push({ groupKey, platformMetricName });
      }
    }
  }
  return candidates;
}

function normalizeMetadataLabel(value: string) {
  return value
    .trim()
    .replace(/[（(]\s*元\s*[）)]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function groupBindings(bindings: ResolvedMetricBinding[]) {
  const grouped = new Map<LocalPromotionInternalApiMetricGroupKey, ResolvedMetricBinding[]>();
  for (const binding of bindings) {
    const existing = grouped.get(binding.groupKey) || [];
    existing.push(binding);
    grouped.set(binding.groupKey, existing);
  }
  return grouped;
}

function createStatQueryRequest(
  groupKey: LocalPromotionInternalApiMetricGroupKey,
  bindings: ResolvedMetricBinding[],
  identity: LocalPromotionInternalApiIdentityResolution,
  roi2Context: Roi2PromotionQueryContext | null
) {
  const conditions: Array<{
    Field: "room_id" | "advertiser_id" | "is_order" | "adlab_mode" | "stat_time" | "ad_id";
    Values: string[];
    Operator: 6 | 7 | 9;
  }> = [];
  if (groupKey === "group_total_data") {
    if (identity.roomId) conditions.push({ Field: "room_id", Values: [identity.roomId], Operator: 7 });
  } else if (groupKey === "promotion") {
    if (identity.advid || identity.selectedAdvid) {
      conditions.push({ Field: "advertiser_id", Values: [identity.advid || identity.selectedAdvid!], Operator: 7 });
    }
    if (identity.roomId) conditions.push({ Field: "room_id", Values: [identity.roomId], Operator: 7 });
    conditions.push({ Field: "is_order", Values: ["1"], Operator: 6 });
    conditions.push({ Field: "adlab_mode", Values: ["1"], Operator: 6 });
  } else {
    if (identity.advid || identity.selectedAdvid) {
      conditions.push({ Field: "advertiser_id", Values: [identity.advid || identity.selectedAdvid!], Operator: 7 });
    }
    if (identity.roomId) conditions.push({ Field: "room_id", Values: [identity.roomId], Operator: 7 });
    if (roi2Context) {
      conditions.push({ Field: "stat_time", Values: [roi2Context.startTimeMs, roi2Context.endTimeMs], Operator: 9 });
      conditions.push({ Field: "ad_id", Values: roi2Context.adIds.length ? roi2Context.adIds : ["0"], Operator: 7 });
    }
  }
  return {
    FrameId: localPromotionInternalApiFrameId,
    ModuleId: localPromotionInternalApiModuleId,
    DataSetKey: localPromotionInternalApiDataSetKey,
    Metrics: bindings.map((binding) => binding.platformMetricName),
    ...(conditions.length ? { Filters: { ConditionRelationshipType: 1 as const, Conditions: conditions } } : {}),
    PageParams: { Limit: -1 as const, Offset: 0 as const }
  };
}

function readPromoteMeta(value: unknown): { ok: true; context: Roi2PromotionQueryContext } | { ok: false; reason: "BUSINESS_ERROR" | "SCHEMA_MISMATCH" } {
  const dataResult = readPlatformData(value);
  if (!dataResult.ok) return dataResult;
  const nested = asRecord(dataResult.data.data);
  const meta = nested || dataResult.data;
  const interval = asRecord(meta.liveTimeInterval);
  const startTimeSeconds = interval ? readPositiveInteger(interval.startTime) : null;
  const endTimeSeconds = interval ? readPositiveInteger(interval.endTime) : null;
  const rawAdIds = meta.roi2AdIdsUnderThisAdvID;
  if (startTimeSeconds == null || endTimeSeconds == null || endTimeSeconds < startTimeSeconds || !Array.isArray(rawAdIds) || rawAdIds.length > 200) {
    return { ok: false, reason: "SCHEMA_MISMATCH" };
  }
  const adIds = rawAdIds.map(readIdentifier);
  if (adIds.some((value) => value == null)) return { ok: false, reason: "SCHEMA_MISMATCH" };
  const startTimeMs = Math.floor(startTimeSeconds / 3_600) * 3_600 * 1_000;
  const endTimeMs = endTimeSeconds * 1_000 + 86_400_000;
  return {
    ok: true,
    context: {
      startTimeMs: String(startTimeMs),
      endTimeMs: String(endTimeMs),
      adIds: adIds as string[]
    }
  };
}

function readPositiveInteger(value: unknown) {
  const candidate = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
}

function readIdentifier(value: unknown) {
  const candidate = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  return /^\d{1,64}$/.test(candidate) ? candidate : null;
}

function readPlatformData(value: unknown): PlatformDataResult {
  const record = asRecord(value);
  if (!record || typeof record.status_code !== "number") return { ok: false, reason: "SCHEMA_MISMATCH" };
  if (record.status_code !== 0) return { ok: false, reason: "BUSINESS_ERROR" };
  const data = asRecord(record.data);
  return data ? { ok: true, data } : { ok: false, reason: "SCHEMA_MISMATCH" };
}

function readStatQueryStats(value: unknown): { ok: true; statsData: Record<string, unknown> } | { ok: false; reason: "BUSINESS_ERROR" | "SCHEMA_MISMATCH" } {
  const dataResult = readPlatformData(value);
  if (!dataResult.ok) return dataResult;
  const statsData = asRecord(dataResult.data.StatsData);
  return statsData ? { ok: true, statsData } : { ok: false, reason: "SCHEMA_MISMATCH" };
}

function projectMetrics(
  groupKey: LocalPromotionInternalApiMetricGroupKey,
  bindings: ResolvedMetricBinding[],
  statsData: Record<string, unknown>
): { ok: true; metrics: VisibleMetric[] } | { ok: false; reason: "SCHEMA_MISMATCH" | "NO_USABLE_METRICS" } {
  const totals = readTotals(statsData, groupKey);
  if (!totals) return { ok: false, reason: "SCHEMA_MISMATCH" };
  const metrics: VisibleMetric[] = [];
  for (const binding of bindings) {
    const metricRecord = asRecord(totals[binding.platformMetricName]);
    const matched = metricRecord ? readScalar(metricRecord.Value) : null;
    if (matched == null || sensitiveResponsePattern.test(String(matched))) continue;
    const field = binding.field;
    const displayValue = String(matched).trim();
    const parsed = parseDisplayedMetricValue(displayValue, metricValueSemantic(field.metricKey), field.unit);
    if (!parsed.normalizedText || !localPromotionApiMetricKeys.includes(field.metricKey)) continue;
    const rawEvidence = createRawEvidence(field, displayValue, parsed.normalizedText, binding.field.endpoint);
    metrics.push({
      key: field.metricKey,
      name: field.metricName,
      value: displayValue,
      unit: field.unit,
      source: "network",
      metricSource: "XHR_JSON",
      confidence: 0.8,
      rawEvidence
    });
  }
  return { ok: true, metrics };
}

function readTotals(statsData: Record<string, unknown>, groupKey: LocalPromotionInternalApiMetricGroupKey) {
  const directTotals = asRecord(statsData.Totals);
  if (directTotals) return directTotals;
  const groupedStats = asRecord(statsData[groupKey]);
  return groupedStats ? asRecord(groupedStats.Totals) : null;
}

function createRawEvidence(field: LocalPromotionInternalApiField, displayValue: string, normalizedValue: string, endpoint: LocalPromotionInternalApiEndpointKey) {
  return {
    sourceType: "INTERNAL_API",
    bindingKind: "CARD" as const,
    fieldLabel: field.fieldLabel,
    displayValue,
    normalizedValue,
    displayPrecision: field.displayPrecision,
    unitSource: field.unit ? "DEFAULT" as const : "NONE" as const,
    timeRange: "实时",
    timeRangeSource: "COMPONENT" as const,
    timeRangeLocation: "local-promotion-internal-api-contract",
    componentPath: field.fieldPath,
    calibrationSignature: `${field.metricKey}|实时|${field.semanticScope}|${field.fieldPath}`,
    validationStatus: "REQUIRES_REVIEW" as const,
    validationReasons: [] as string[],
    sourceStatus: "INTERNAL_API" as const,
    routeKey: "LOCAL_PROMOTION_DASHBOARD" as const,
    semanticScope: field.semanticScope,
    apiContractVersion: localPromotionInternalApiContractVersion,
    apiAdapterVersion: localPromotionInternalApiAdapterVersion,
    endpointKey: endpoint,
    evidencePurpose: "PULSE_ONLY" as const,
    apiCandidate: {
      value: normalizedValue,
      displayValue,
      unit: field.unit,
      unitSource: field.unit ? "DEFAULT" as const : "NONE" as const,
      timeRange: "实时",
      displayPrecision: field.displayPrecision,
      fieldPath: field.fieldPath,
      fieldLabel: field.fieldLabel
    },
    selectionReason: "仅 API 字段有效"
  };
}

function readScalar(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asArray(value: unknown): Record<string, unknown>[] | null {
  return Array.isArray(value) && value.every((item) => isRecord(item)) ? value as Record<string, unknown>[] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" ? record[key] : null;
}

async function readSafeJson(response: Response, limit: number, signal: AbortSignal): Promise<{ ok: true; value: unknown; acceptedBytes: number } | { ok: false; reason: string; acceptedBytes: number }> {
  const reader = response.body?.getReader();
  if (!reader) return { ok: false, reason: "EMPTY_RESPONSE", acceptedBytes: 0 };
  const cancelReader = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancelReader, { once: true });
  const decoder = new TextDecoder();
  let text = "";
  let acceptedBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      acceptedBytes += chunk.value.byteLength;
      if (acceptedBytes > limit) return { ok: false, reason: "BYTE_LIMIT", acceptedBytes };
      text += decoder.decode(chunk.value, { stream: true });
      if (sensitiveResponsePattern.test(text)) return { ok: false, reason: "SENSITIVE_RESPONSE", acceptedBytes };
    }
    text += decoder.decode();
    if (sensitiveResponsePattern.test(text)) return { ok: false, reason: "SENSITIVE_RESPONSE", acceptedBytes };
    return { ok: true, value: JSON.parse(text), acceptedBytes };
  } catch {
    return { ok: false, reason: signal.aborted ? "ABORTED" : "JSON_PARSE_FAILED", acceptedBytes };
  } finally {
    signal.removeEventListener("abort", cancelReader);
    reader.releaseLock();
  }
}

function createRequest(parentSignal?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, localPromotionInternalApiRequestTimeoutMs);
  const abort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort(); else parentSignal?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abort);
    }
  };
}
