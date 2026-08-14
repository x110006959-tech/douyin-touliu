import {
  extensionCollectionProtocolVersion,
  liveScreenEndpointKeysForMode,
  liveScreenInternalApiAdapterVersion,
  liveScreenInternalApiContractVersion,
  liveScreenInternalApiContracts,
  liveScreenInternalApiEndpointKeys,
  isApprovedLiveScreenFieldPath,
  resolveLiveScreenRoomId,
  type CollectionSnapshotPayload,
  type LiveScreenInternalApiEndpointKey,
  type LiveScreenInternalApiField,
  type VisibleMetric
} from "@douyin-local-life/shared";

type ValidationResult = { ok: true } | { ok: false; status: number; code: string; message: string };

export function validateLiveScreenInternalApiPayload(input: {
  featureEnabled: boolean;
  authKind: "USER_SESSION" | "EXTENSION" | undefined;
  sourceUrl: string | null | undefined;
  pageType: string;
  routeKey: string;
  captureProtocolVersion: number | undefined;
  captureMeta: CollectionSnapshotPayload["captureMeta"] | undefined;
  metrics: VisibleMetric[];
  mode: "SNAPSHOT" | "PULSE";
}): ValidationResult {
  const apiMeta = input.captureMeta?.liveScreenInternalApi;
  const apiMetrics = input.metrics.filter(isInternalApiMetric);
  const hasMinuteRows = Boolean(apiMeta?.minuteRows?.length);
  if (!apiMeta && apiMetrics.length === 0) return { ok: true };
  if (apiMeta?.enabled === false && apiMetrics.length === 0 && !hasMinuteRows) return { ok: true };
  if (apiMetrics.length === 0 && !hasMinuteRows) return { ok: true };
  if (input.authKind !== "EXTENSION") return reject(403, "LIVE_SCREEN_INTERNAL_API_EXTENSION_REQUIRED", "直播大屏内部 API 证据仅允许已配对插件上报");
  if (!input.featureEnabled) return reject(403, "LIVE_SCREEN_INTERNAL_API_DISABLED", "直播大屏内部 API 采集尚未开启，已回退为 DOM 采集");
  if (input.captureProtocolVersion !== extensionCollectionProtocolVersion) return reject(409, "EXTENSION_COLLECTION_PROTOCOL_MISMATCH", "插件与当前采集服务不兼容，请更新后重试");
  if (!apiMeta || apiMeta.enabled !== true || apiMeta.contractVersion !== liveScreenInternalApiContractVersion || apiMeta.adapterVersion !== liveScreenInternalApiAdapterVersion) {
    return reject(409, "LIVE_SCREEN_INTERNAL_API_CONTRACT_MISMATCH", "直播大屏 API 契约或适配器版本不匹配");
  }
  const allowedRouteKeys = input.mode === "PULSE"
    ? ["LIVE_DATA_SCREEN", "LIVE_PRODUCT_TAB", "LIVE_TRAFFIC_TAB", "UNKNOWN"]
    : ["LIVE_DATA_SCREEN", "UNKNOWN"];
  if (!input.sourceUrl || !isExactLiveScreenUrl(input.sourceUrl) || input.pageType !== "LIVE_DATA_SCREEN" || !allowedRouteKeys.includes(input.routeKey)) {
    return reject(
      403,
      "LIVE_SCREEN_INTERNAL_API_PAGE_FORBIDDEN",
      input.mode === "PULSE" ? "API 实时脉冲只允许来自精确直播大屏页面" : "内部 API 正式证据只允许来自精确直播大屏概览页面"
    );
  }
  if (!hasValidRoomIdEvidence(input.sourceUrl, apiMeta)) {
    return reject(400, "LIVE_SCREEN_ROOM_ID_INVALID", "直播间标识缺失、来源不一致或无法由服务端复核，已阻止内部 API 数据上报");
  }

  const allowedEndpoints = new Set<LiveScreenInternalApiEndpointKey>(
    input.mode === "SNAPSHOT"
      ? liveScreenEndpointKeysForMode("SNAPSHOT")
      : liveScreenEndpointKeysForMode("PULSE")
  );
  const seenEndpoints = new Set<LiveScreenInternalApiEndpointKey>();
  let acceptedBytes = 0;
  for (const status of apiMeta.endpointStatuses) {
    if (!allowedEndpoints.has(status.endpoint) || seenEndpoints.has(status.endpoint)) {
      return reject(400, "LIVE_SCREEN_INTERNAL_API_EVIDENCE_INVALID", "内部 API 端点状态与当前采集模式不匹配");
    }
    seenEndpoints.add(status.endpoint);
    const endpointLimit = liveScreenInternalApiContracts[status.endpoint].maxResponseBytes;
    if (status.acceptedBytes > endpointLimit || status.status === "SUCCESS" && status.acceptedBytes === 0) {
      return reject(400, "LIVE_SCREEN_INTERNAL_API_EVIDENCE_INVALID", "内部 API 端点响应大小与服务端契约不一致");
    }
    acceptedBytes += status.acceptedBytes;
  }
  if (acceptedBytes > 384 * 1024) return reject(400, "LIVE_SCREEN_INTERNAL_API_EVIDENCE_INVALID", "内部 API 响应总量超过允许范围");

  if (input.mode === "PULSE" && hasMinuteRows) {
    return reject(400, "LIVE_SCREEN_PULSE_PURPOSE_INVALID", "实时脉冲不得提交分钟趋势或正式快照证据");
  }

  const successfulEndpoints = new Set(apiMeta.endpointStatuses.filter((item) => item.status === "SUCCESS").map((item) => item.endpoint));
  if (hasMinuteRows && !successfulEndpoints.has("room_minute_indicator")) {
    return reject(400, "LIVE_SCREEN_MINUTE_TREND_INVALID", "分钟趋势必须来自已验证的分钟接口");
  }
  for (const metric of apiMetrics) {
    const evidence = metric.rawEvidence;
    if (input.mode === "PULSE" && (evidence?.sourceStatus !== "INTERNAL_API" || Boolean(evidence.domCandidate))) {
      return reject(400, "LIVE_SCREEN_PULSE_PURPOSE_INVALID", "实时脉冲不得混入 DOM 或双来源指标");
    }
    const endpointKey = evidence?.endpointKey;
    if (!isEndpointKey(endpointKey) || !allowedEndpoints.has(endpointKey) || !successfulEndpoints.has(endpointKey)) {
      return reject(400, "LIVE_SCREEN_INTERNAL_API_EVIDENCE_INVALID", "内部 API 字段不在已验证端点白名单中");
    }
    const field = liveScreenInternalApiContracts[endpointKey].fields.find((candidate) => candidate.metricKey === metric.key && !candidate.rowPath);
    if (!field || !matchesContractMetric(metric, endpointKey, field)) {
      return reject(400, "LIVE_SCREEN_INTERNAL_API_EVIDENCE_INVALID", "内部 API 字段与服务端契约不一致");
    }
    if (input.mode === "PULSE" && field.purpose !== "PULSE_ONLY") {
      return reject(400, "LIVE_SCREEN_PULSE_PURPOSE_INVALID", "实时脉冲只能提交实时白名单指标");
    }
    if (input.mode === "SNAPSHOT" && field.purpose === "PULSE_ONLY") {
      return reject(400, "LIVE_SCREEN_SNAPSHOT_PURPOSE_INVALID", "实时展示指标不能进入正式快照");
    }
  }
  return { ok: true };
}

function isInternalApiMetric(metric: VisibleMetric) {
  const evidence = metric.rawEvidence;
  return evidence?.sourceStatus === "INTERNAL_API"
    || evidence?.sourceStatus === "API_AND_DOM"
    || evidence?.sourceStatus === "SOURCE_CONFLICT"
    || metric.metricSource === "XHR_JSON" && Boolean(evidence?.endpointKey);
}

function matchesContractMetric(metric: VisibleMetric, endpointKey: LiveScreenInternalApiEndpointKey, field: LiveScreenInternalApiField) {
  const evidence = metric.rawEvidence;
  if (!evidence) return false;
  const actualFieldPath = evidence.componentPath || "";
  if (!isApprovedLiveScreenFieldPath(field, actualFieldPath)) return false;
  const expectedSignature = `${field.metricKey}|${field.timeRange}|${field.semanticScope}|${actualFieldPath}`;
  const sourceStatusValid = ["INTERNAL_API", "API_AND_DOM", "SOURCE_CONFLICT"].includes(evidence.sourceStatus || "");
  const apiCandidate = evidence.apiCandidate;
  const candidateMatches = Boolean(apiCandidate
    && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(apiCandidate.value)
    && apiCandidate.unit === field.unit
    && apiCandidate.timeRange === field.timeRange
    && apiCandidate.displayPrecision === field.displayPrecision
    && apiCandidate.fieldPath === actualFieldPath
    && apiCandidate.fieldLabel === field.fieldLabel);
  const dualSourceCandidateValid = evidence.sourceStatus === "API_AND_DOM" || evidence.sourceStatus === "SOURCE_CONFLICT"
    ? Boolean(evidence.domCandidate)
    : true;
  return sourceStatusValid
    && metric.name === field.metricName
    && (metric.unit || null) === field.unit
    && metric.source === "network"
    && metric.metricSource === "XHR_JSON"
    && evidence.sourceType === "INTERNAL_API"
    && evidence.bindingKind === "CARD"
    && evidence.fieldLabel === field.fieldLabel
    && evidence.displayPrecision === field.displayPrecision
    && evidence.unitSource === (field.unit ? "DEFAULT" : "NONE")
    && evidence.timeRange === field.timeRange
    && evidence.timeRangeSource === "COMPONENT"
    && evidence.timeRangeLocation === "internal-api-contract"
    && evidence.componentPath === actualFieldPath
    && evidence.calibrationSignature === expectedSignature
    && evidence.semanticScope === field.semanticScope
    && evidence.apiContractVersion === liveScreenInternalApiContractVersion
    && evidence.apiAdapterVersion === liveScreenInternalApiAdapterVersion
    && evidence.endpointKey === endpointKey
    && evidence.evidencePurpose === field.purpose
    && candidateMatches
    && dualSourceCandidateValid;
}

function isEndpointKey(value: string | undefined): value is LiveScreenInternalApiEndpointKey {
  return Boolean(value && liveScreenInternalApiEndpointKeys.includes(value as LiveScreenInternalApiEndpointKey));
}

function isExactLiveScreenUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "eos.douyin.com" && url.pathname === "/dp/liveScreen";
  } catch {
    return false;
  }
}

function hasValidRoomIdEvidence(
  sourceUrl: string,
  apiMeta: NonNullable<NonNullable<CollectionSnapshotPayload["captureMeta"]>["liveScreenInternalApi"]>
) {
  if (!apiMeta.roomId || !apiMeta.roomIdEvidence) return false;
  const declaredResolution = resolveLiveScreenRoomId(apiMeta.roomIdEvidence);
  if (!sameRoomIds(apiMeta.roomIdEvidence.urlRoomIds, declaredResolution.evidence.urlRoomIds)
    || !sameRoomIds(apiMeta.roomIdEvidence.domRoomIds, declaredResolution.evidence.domRoomIds)) {
    return false;
  }
  const sourceUrlResolution = resolveLiveScreenRoomId({
    urlRoomIds: new URL(sourceUrl).searchParams.getAll("room_id"),
    domRoomIds: []
  });
  return declaredResolution.value === apiMeta.roomId
    && declaredResolution.source === apiMeta.roomIdSource
    && !["MISSING", "MISMATCH"].includes(declaredResolution.source)
    && sameRoomIds(declaredResolution.evidence.urlRoomIds, sourceUrlResolution.evidence.urlRoomIds);
}

function sameRoomIds(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function reject(status: number, code: string, message: string): ValidationResult {
  return { ok: false, status, code, message };
}
