import {
  extensionCollectionProtocolVersion,
  isExactLocalPromotionInternalApiPage,
  localPromotionInternalApiAdapterVersion,
  localPromotionInternalApiContractVersion,
  localPromotionInternalApiEndpointContracts,
  localPromotionInternalApiEndpointKeys,
  metricValueSemantic,
  parseDisplayedMetricValue,
  resolveLocalPromotionIdentity,
  type CollectionSnapshotPayload,
  type LocalPromotionInternalApiEndpointKey,
  type LocalPromotionInternalApiField,
  type LocalPromotionInternalApiIdentityEvidence,
  type VisibleMetric
} from "@douyin-local-life/shared";

type ValidationResult = { ok: true } | { ok: false; status: number; code: string; message: string };

export function validateLocalPromotionInternalApiPulse(input: {
  featureEnabled: boolean;
  authKind: "USER_SESSION" | "EXTENSION" | undefined;
  sourceUrl: string | null | undefined;
  pageType: string;
  routeKey: string;
  captureProtocolVersion: number | undefined;
  captureMeta: CollectionSnapshotPayload["captureMeta"] | undefined;
  metrics: VisibleMetric[];
}): ValidationResult {
  const meta = input.captureMeta?.localPromotionInternalApi;
  if (input.authKind !== "EXTENSION") return reject(403, "LOCAL_PROMOTION_INTERNAL_API_EXTENSION_REQUIRED", "本地推内部 API 证据仅允许已配对插件上报");
  if (!input.featureEnabled) return reject(403, "LOCAL_PROMOTION_INTERNAL_API_DISABLED", "本地推内部 API 采集尚未开启");
  if (input.captureProtocolVersion !== extensionCollectionProtocolVersion) return reject(409, "EXTENSION_COLLECTION_PROTOCOL_MISMATCH", "插件与当前采集服务不兼容，请更新后重试");
  if (!input.sourceUrl || !isExactLocalPromotionInternalApiPage(input.sourceUrl) || input.pageType !== "LOCAL_PROMOTION_DASHBOARD" || input.routeKey !== "LOCAL_PROMOTION_DASHBOARD") {
    return reject(403, "LOCAL_PROMOTION_INTERNAL_API_PAGE_FORBIDDEN", "本地推实时脉冲只允许来自精确数据总览页面");
  }
  if (!meta || !meta.enabled || meta.contractVersion !== localPromotionInternalApiContractVersion || meta.adapterVersion !== localPromotionInternalApiAdapterVersion || meta.evidencePurpose !== "PULSE_ONLY") {
    return reject(409, "LOCAL_PROMOTION_INTERNAL_API_CONTRACT_MISMATCH", "本地推 API 契约或适配器版本不匹配");
  }
  if (!meta.identity.evidence) {
    return reject(400, "LOCAL_PROMOTION_IDENTITY_INVALID", "本地推身份缺少可复核来源证据");
  }
  const resolved = resolveLocalPromotionIdentity({
    url: input.sourceUrl,
    dom: meta.identity.evidence.dom
  });
  if (["MISSING", "MISMATCH"].includes(meta.identity.source) || (!meta.identity.advid && !meta.identity.selectedAdvid)) {
    return reject(400, "LOCAL_PROMOTION_IDENTITY_INVALID", "本地推身份缺失或来源冲突");
  }
  if (resolved.advid !== meta.identity.advid
    || resolved.roomId !== meta.identity.roomId
    || resolved.selectedAdvid !== meta.identity.selectedAdvid
    || resolved.selectedAwemeId !== meta.identity.selectedAwemeId
    || resolved.source !== meta.identity.source
    || !sameIdentityEvidence(resolved.evidence, meta.identity.evidence)) {
    return reject(400, "LOCAL_PROMOTION_IDENTITY_INVALID", "本地推身份无法由来源页面复核");
  }

  const successful = new Set<LocalPromotionInternalApiEndpointKey>();
  const seen = new Set<LocalPromotionInternalApiEndpointKey>();
  let totalBytes = 0;
  for (const status of meta.endpointStatuses) {
    if (!localPromotionInternalApiEndpointKeys.includes(status.endpoint) || seen.has(status.endpoint)) {
      return reject(400, "LOCAL_PROMOTION_INTERNAL_API_EVIDENCE_INVALID", "本地推端点状态不在白名单或重复");
    }
    seen.add(status.endpoint);
    if (status.acceptedBytes > localPromotionInternalApiEndpointContracts[status.endpoint].maxResponseBytes || status.status === "SUCCESS" && status.acceptedBytes === 0) {
      return reject(400, "LOCAL_PROMOTION_INTERNAL_API_EVIDENCE_INVALID", "本地推端点响应大小不符合契约");
    }
    totalBytes += status.acceptedBytes;
    if (status.status === "SUCCESS") successful.add(status.endpoint);
  }
  if (totalBytes > 256 * 1024) return reject(400, "LOCAL_PROMOTION_INTERNAL_API_EVIDENCE_INVALID", "本地推响应总量超过允许范围");
  const requiresPromoteMeta = input.metrics.some((metric) => (
    localPromotionInternalApiEndpointContracts.statQuery.fields
      .find((field) => field.metricKey === metric.key)
      ?.groupKeys.includes("roi2_promotion")
  ));
  const requiredEndpoints: LocalPromotionInternalApiEndpointKey[] = ["pageMetrics", "statQuery"];
  if (requiresPromoteMeta) requiredEndpoints.push("liveReportPromoteMeta");
  if (requiredEndpoints.some((endpoint) => !successful.has(endpoint))) {
    return reject(400, "LOCAL_PROMOTION_INTERNAL_API_EVIDENCE_INVALID", "本地推实时脉冲缺少完整成功端点证据");
  }
  if (!input.metrics.length) return reject(400, "LOCAL_PROMOTION_INTERNAL_API_EVIDENCE_INVALID", "本地推实时脉冲没有可用白名单指标");

  const metricKeys = new Set<string>();
  for (const metric of input.metrics) {
    if (metricKeys.has(metric.key)) return reject(400, "LOCAL_PROMOTION_INTERNAL_API_EVIDENCE_INVALID", "本地推实时脉冲包含重复指标");
    metricKeys.add(metric.key);
    if (!isInternalApiMetric(metric)) return reject(400, "LOCAL_PROMOTION_PULSE_PURPOSE_INVALID", "本地推实时脉冲不得混入 DOM 指标");
    const endpoint = metric.rawEvidence?.endpointKey;
    if (!isEndpoint(endpoint) || !successful.has(endpoint)) return reject(400, "LOCAL_PROMOTION_INTERNAL_API_EVIDENCE_INVALID", "指标未关联成功白名单端点");
    const field = localPromotionInternalApiEndpointContracts[endpoint].fields.find((candidate) => candidate.metricKey === metric.key);
    if (!field || !matchesMetric(metric, endpoint, field)) return reject(400, "LOCAL_PROMOTION_INTERNAL_API_EVIDENCE_INVALID", "本地推指标与固定字段契约不一致");
  }
  return { ok: true };
}

function matchesMetric(metric: VisibleMetric, endpoint: LocalPromotionInternalApiEndpointKey, field: LocalPromotionInternalApiField) {
  const evidence = metric.rawEvidence;
  const actualPath = evidence?.componentPath || "";
  const candidate = evidence?.apiCandidate;
  const displayValue = typeof metric.value === "string" ? metric.value.trim() : "";
  const parsedValue = parseDisplayedMetricValue(displayValue, metricValueSemantic(field.metricKey), field.unit);
  return metric.name === field.metricName
    && (metric.unit || null) === field.unit
    && metric.source === "network"
    && metric.metricSource === "XHR_JSON"
    && evidence?.sourceType === "INTERNAL_API"
    && evidence.sourceStatus === "INTERNAL_API"
    && evidence.evidencePurpose === field.purpose
    && evidence.routeKey === "LOCAL_PROMOTION_DASHBOARD"
    && evidence.bindingKind === "CARD"
    && evidence.fieldLabel === field.fieldLabel
    && evidence.displayValue === displayValue
    && evidence.normalizedValue === candidate?.value
    && evidence.displayPrecision === field.displayPrecision
    && evidence.unitSource === (field.unit ? "DEFAULT" : "NONE")
    && evidence.timeRange === "实时"
    && evidence.timeRangeSource === "COMPONENT"
    && evidence.timeRangeLocation === "local-promotion-internal-api-contract"
    && field.approvedFieldPaths.includes(actualPath)
    && evidence.calibrationSignature === `${field.metricKey}|实时|${field.semanticScope}|${actualPath}`
    && evidence.validationStatus === "REQUIRES_REVIEW"
    && evidence.validationReasons?.length === 0
    && evidence.semanticScope === field.semanticScope
    && evidence.apiContractVersion === localPromotionInternalApiContractVersion
    && evidence.apiAdapterVersion === localPromotionInternalApiAdapterVersion
    && evidence.endpointKey === endpoint
    && evidence.selectionReason === "仅 API 字段有效"
    && Boolean(candidate
      && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(candidate.value)
      && candidate.value === parsedValue.normalizedText
      && candidate.displayValue === displayValue
      && candidate.fieldPath === actualPath
      && candidate.fieldLabel === field.fieldLabel
      && candidate.unit === field.unit
      && candidate.timeRange === "实时"
      && candidate.displayPrecision === field.displayPrecision);
}

function sameIdentityEvidence(
  left: LocalPromotionInternalApiIdentityEvidence,
  right: LocalPromotionInternalApiIdentityEvidence
) {
  return (["url", "dom"] as const).every((source) => (
    (["advid", "roomId", "selectedAdvid", "selectedAwemeId"] as const).every((key) => (
      left[source][key].length === right[source][key].length
      && left[source][key].every((value, index) => value === right[source][key][index])
    ))
  ));
}

function isInternalApiMetric(metric: VisibleMetric) {
  return metric.source === "network" && metric.metricSource === "XHR_JSON" && metric.rawEvidence?.sourceType === "INTERNAL_API";
}

function isEndpoint(value: string | undefined): value is LocalPromotionInternalApiEndpointKey {
  return Boolean(value && localPromotionInternalApiEndpointKeys.includes(value as LocalPromotionInternalApiEndpointKey));
}

function reject(status: number, code: string, message: string): ValidationResult {
  return { ok: false, status, code, message };
}
