import {
  liveScreenPulseCoreMetricKeys,
  liveScreenPulseCoreMetricLabels
} from "@douyin-local-life/shared";

export type LivePulseOutcome = {
  taskId: string;
  reason: string;
  endpoint?: string;
  lastFailureReason?: string;
  occurredAt: string;
  failure: boolean;
  buildFingerprint: string;
  collectionProtocolVersion: number;
};

export type LivePulseOutcomeContext = {
  buildFingerprint: string;
  collectionProtocolVersion: number;
  endpointKeys: readonly string[];
};

export type LivePulseDisplayState = {
  active?: boolean;
  consecutiveFailures?: number;
  successCount?: number;
  lastMetricCount?: number;
  lastMetricKeys?: string[];
  lastFailureReason?: string | null;
  lastFailureEndpoint?: string | null;
  rateLimitedUntil?: string | null;
  lastOutcome?: LivePulseOutcome | null;
};

export function livePulseButtonState(
  livePulse: LivePulseDisplayState | undefined,
  pairingVerified: boolean,
  internalApiEnabled: boolean
) {
  const active = livePulse?.active === true;
  return {
    text: active ? "停止 API 持续采集" : "开始 API 持续采集",
    disabled: !pairingVerified || !internalApiEnabled
  };
}

export function livePulseStatusText(livePulse: LivePulseDisplayState | undefined, internalApiEnabled: boolean) {
  if (livePulse?.active) {
    const rateLimitedUntil = livePulse.rateLimitedUntil ? new Date(livePulse.rateLimitedUntil) : null;
    if (rateLimitedUntil && Number.isFinite(rateLimitedUntil.getTime()) && rateLimitedUntil.getTime() > Date.now()) {
      return `本机服务端正在限流，已按 Retry-After 等待至 ${rateLimitedUntil.toLocaleTimeString("zh-CN", { hour12: false })} 后继续；不会创建额外采集循环。`;
    }
    if (livePulse.consecutiveFailures) {
      const endpoint = livePulse.lastFailureEndpoint ? `（${livePulse.lastFailureEndpoint}）` : "";
      const reason = livePulse.lastFailureReason
        ? livePulseFailureReasonText(livePulse.lastFailureReason)
        : "未知白名单失败原因";
      return `第 ${livePulse.consecutiveFailures}/3 次失败${endpoint}：${reason}；仍在等待下一次固定节拍。`;
    }
    return livePulse.successCount
      ? `采集中；最近一轮核心指标 ${livePulseMetricCoverage(livePulse.lastMetricKeys).count}/${liveScreenPulseCoreMetricKeys.length}`
      : "API 已启动，正在发起首轮请求";
  }
  if (livePulse?.lastOutcome) return livePulseOutcomeMessage(livePulse.lastOutcome);
  return internalApiEnabled ? "API 已就绪；点击一次即可持续更新任务大屏" : "服务端 API 未开启；不会静默改用 DOM";
}

export function normalizeLivePulseMetricKeys(value: unknown) {
  if (!Array.isArray(value)) return [];
  const supplied = new Set(value.filter((item): item is string => typeof item === "string"));
  return liveScreenPulseCoreMetricKeys.filter((key) => supplied.has(key));
}

export function livePulseMetricCoverage(value: unknown) {
  const keys = normalizeLivePulseMetricKeys(value);
  const keySet = new Set(keys);
  return {
    keys,
    count: keys.length,
    total: liveScreenPulseCoreMetricKeys.length,
    missingLabels: liveScreenPulseCoreMetricKeys
      .filter((key) => !keySet.has(key))
      .map((key) => liveScreenPulseCoreMetricLabels[key])
  };
}

export function livePulseOutcomeMessage(outcome: LivePulseOutcome | null | undefined) {
  const endpoint = outcome?.endpoint ? `（${outcome.endpoint}）` : "";
  switch (outcome?.reason) {
    case "SCHEMA_MISMATCH":
      return `API 响应结构不匹配${endpoint}，已停止。`;
    case "SENSITIVE_RESPONSE":
      return `API 响应包含敏感字段${endpoint}，已安全停止；本次未上传。`;
    case "HTTP_401":
    case "HTTP_429":
      return `平台 API 返回 ${outcome.reason}${endpoint}，已停止。`;
    case "PAGE_INACTIVE":
      return "直播平台页不再可用，已安全停止实时脉冲。";
    case "PAGE_NAVIGATED":
      return "直播平台页已导航离开，已安全停止实时脉冲。";
    case "THREE_CONSECUTIVE_FAILURES":
      return `API 连续失败 3 次${outcome.lastFailureReason ? `（最后原因：${livePulseFailureReasonText(outcome.lastFailureReason)}）` : ""}，已停止。`;
    case "USER_STOPPED":
      return "API 持续采集已停止。";
    default:
      return outcome?.failure
        ? `API 实时采集失败（${outcome?.reason || "UNKNOWN"}），已停止。`
        : "API 持续采集已停止。";
  }
}

export function safeLivePulseFailureReason(value: unknown) {
  if (typeof value !== "string") return undefined;
  const reason = value.trim();
  if (!reason || reason.length > 80) return undefined;
  return /^(?:PULSE_(?:CAPTURE_FAILED|METRICS_MISSING|KEY_INDEX_NO_USABLE_METRICS|UPLOAD_(?:TIMEOUT|ABORTED)|NETWORK_ERROR)|REQUEST_FAILED|REQUEST_TIMEOUT|JSON_PARSE_FAILED|EMPTY_RESPONSE|BUSINESS_ERROR|HTTP_\d{3}|ABORTED)$/.test(reason)
    ? reason
    : undefined;
}

export function parseLivePulseOutcome(value: unknown, context: LivePulseOutcomeContext): LivePulseOutcome | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.buildFingerprint !== context.buildFingerprint
    || candidate.collectionProtocolVersion !== context.collectionProtocolVersion
  ) {
    return null;
  }
  const endpoint = typeof candidate.endpoint === "string" && context.endpointKeys.includes(candidate.endpoint)
    ? candidate.endpoint
    : undefined;
  const lastFailureReason = safeLivePulseFailureReason(candidate.lastFailureReason);
  return typeof candidate.reason === "string"
    && candidate.reason.length > 0
    && typeof candidate.taskId === "string"
    && candidate.taskId.length > 0
    && typeof candidate.occurredAt === "string"
    && typeof candidate.failure === "boolean"
    ? {
        taskId: candidate.taskId,
        reason: candidate.reason,
        ...(endpoint ? { endpoint } : {}),
        ...(lastFailureReason ? { lastFailureReason } : {}),
        occurredAt: candidate.occurredAt,
        failure: candidate.failure,
        buildFingerprint: context.buildFingerprint,
        collectionProtocolVersion: context.collectionProtocolVersion
      }
    : null;
}

export function livePulseReasonText(reason: string) {
  return livePulseFailureReasonText(reason);
}

function livePulseFailureReasonText(reason: string) {
  const labels: Record<string, string> = {
    PULSE_CAPTURE_FAILED: "页面采集失败（PULSE_CAPTURE_FAILED）",
    PULSE_METRICS_MISSING: "API 未返回可用白名单指标（PULSE_METRICS_MISSING）",
    PULSE_KEY_INDEX_NO_USABLE_METRICS: "key_index 请求成功，但已批准字段均缺失、为空或类型不合法（PULSE_KEY_INDEX_NO_USABLE_METRICS）",
    PULSE_UPLOAD_TIMEOUT: "实时脉冲上传超时（PULSE_UPLOAD_TIMEOUT）",
    PULSE_UPLOAD_ABORTED: "实时脉冲上传被取消（PULSE_UPLOAD_ABORTED）",
    PULSE_NETWORK_ERROR: "实时脉冲上传网络失败（PULSE_NETWORK_ERROR）",
    REQUEST_FAILED: "平台 API 请求失败（REQUEST_FAILED）",
    REQUEST_TIMEOUT: "平台 API 请求超时（REQUEST_TIMEOUT）",
    JSON_PARSE_FAILED: "平台 API 返回无效 JSON（JSON_PARSE_FAILED）",
    EMPTY_RESPONSE: "平台 API 返回空响应（EMPTY_RESPONSE）",
    BUSINESS_ERROR: "平台 API 业务响应失败（BUSINESS_ERROR）",
    ABORTED: "请求被停止（ABORTED）"
  };
  return labels[reason] || `HTTP 响应失败（${reason}）`;
}
