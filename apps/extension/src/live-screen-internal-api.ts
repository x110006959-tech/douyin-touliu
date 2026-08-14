import {
  liveScreenEndpointKeysForMode,
  liveScreenInternalApiAdapterVersion,
  liveScreenInternalApiContractVersion,
  liveScreenInternalApiContracts,
  type CaptureMeta,
  type LiveScreenInternalApiEndpointKey,
  type LiveScreenRoomIdEvidence,
  type MetricRawEvidence,
  type VisibleMetric,
  metricValueSemantic,
  parseDisplayedMetricValue
} from "@douyin-local-life/shared";

const responseSafetyPattern = /cookie|token|authorization|secret|session|credential/i;
const totalResponseLimit = 384 * 1024;
/** PULSE must finish before the next five-second boundary instead of hanging in the Popup. */
export const liveScreenInternalApiRequestTimeoutMs = 4_000;

export type LiveScreenInternalApiCollection = {
  metrics: VisibleMetric[];
  captureMeta: NonNullable<CaptureMeta["liveScreenInternalApi"]>;
};

export async function collectLiveScreenInternalApi(input: {
  enabled: boolean;
  roomId: string | null;
  roomIdSource: NonNullable<CaptureMeta["liveScreenInternalApi"]>["roomIdSource"];
  roomIdEvidence: LiveScreenRoomIdEvidence;
  mode: "SNAPSHOT" | "PULSE";
  signal?: AbortSignal;
}): Promise<LiveScreenInternalApiCollection> {
  const endpointStatuses: LiveScreenInternalApiCollection["captureMeta"]["endpointStatuses"] = [];
  const requestableRoomId = input.enabled
    && input.roomId
    && !["MISMATCH", "MISSING"].includes(input.roomIdSource)
    ? input.roomId
    : null;
  const baseMeta: LiveScreenInternalApiCollection["captureMeta"] = {
    contractVersion: liveScreenInternalApiContractVersion,
    adapterVersion: liveScreenInternalApiAdapterVersion,
    enabled: input.enabled,
    roomIdSource: input.roomIdSource,
    ...(requestableRoomId ? { roomId: requestableRoomId, roomIdEvidence: input.roomIdEvidence } : {}),
    endpointStatuses
  };
  if (!input.enabled) return { metrics: [], captureMeta: baseMeta };
  if (!requestableRoomId) {
    endpointStatuses.push(...liveScreenEndpointKeysForMode(input.mode).map((endpoint) => ({ endpoint, status: "SKIPPED" as const, acceptedBytes: 0, reason: "ROOM_ID_UNAVAILABLE" })));
    return { metrics: [], captureMeta: baseMeta };
  }

  const metrics: VisibleMetric[] = [];
  let acceptedBytes = 0;
  let fatalResponse = false;
  for (const endpoint of liveScreenEndpointKeysForMode(input.mode)) {
    if (input.signal?.aborted) {
      endpointStatuses.push({ endpoint, status: "ABORTED", acceptedBytes: 0, reason: "ABORTED" });
      fatalResponse = true;
      break;
    }
    const contract = liveScreenInternalApiContracts[endpoint];
    const remaining = totalResponseLimit - acceptedBytes;
    if (remaining <= 0) {
      endpointStatuses.push({ endpoint, status: "ABORTED", acceptedBytes: 0, reason: "TOTAL_BYTE_LIMIT" });
      fatalResponse = true;
      break;
    }
    const endpointRequest = createEndpointRequest(
      input.signal,
      input.mode === "PULSE" ? liveScreenInternalApiRequestTimeoutMs : null
    );
    try {
      const response = await fetch(contract.path, {
        method: contract.method,
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(contract.requestSchema.parse({ room_id: requestableRoomId })),
        signal: endpointRequest.signal
      });
      if (response.status === 401 || response.status === 429) {
        endpointStatuses.push({ endpoint, status: "ABORTED", acceptedBytes: 0, reason: `HTTP_${response.status}` });
        fatalResponse = true;
        break;
      }
      if (!response.ok) {
        endpointStatuses.push({ endpoint, status: "FAILED", acceptedBytes: 0, reason: `HTTP_${response.status}` });
        continue;
      }
      const payload = await readSafeJson(response, Math.min(contract.maxResponseBytes, remaining), endpointRequest.signal);
      if (!payload.ok) {
        const reason = endpointRequest.didTimeout() ? "REQUEST_TIMEOUT" : payload.reason;
        endpointStatuses.push({
          endpoint,
          status: ["ABORTED", "SENSITIVE_RESPONSE", "BYTE_LIMIT"].includes(reason) ? "ABORTED" : "FAILED",
          acceptedBytes: payload.acceptedBytes,
          reason
        });
        if (reason === "SENSITIVE_RESPONSE" || reason === "BYTE_LIMIT" || reason === "ABORTED") {
          fatalResponse = true;
          break;
        }
        continue;
      }
      acceptedBytes += payload.acceptedBytes;
      const parsed = contract.responseSchema.safeParse(normalizePlatformResponse(payload.value));
      if (!parsed.success || parsed.data.code !== 0) {
        endpointStatuses.push({ endpoint, status: "FAILED", acceptedBytes: payload.acceptedBytes, reason: parsed.success ? "BUSINESS_ERROR" : "SCHEMA_MISMATCH" });
        if (!parsed.success) {
          fatalResponse = true;
          break;
        }
        continue;
      }
      const projectedMetrics = projectMetrics(endpoint, parsed.data.data, input.mode);
      endpointStatuses.push({
        endpoint,
        status: "SUCCESS",
        acceptedBytes: payload.acceptedBytes,
        ...(input.mode === "PULSE" && endpoint === "key_index" && projectedMetrics.length === 0
          ? { reason: "PULSE_KEY_INDEX_NO_USABLE_METRICS" }
          : {})
      });
      metrics.push(...projectedMetrics);
      if (endpoint === "room_minute_indicator") {
        const minuteRows = projectMinuteRows(parsed.data.data);
        if (minuteRows.length) baseMeta.minuteRows = minuteRows;
      }
    } catch (error) {
      const reason = endpointRequest.didTimeout()
        ? "REQUEST_TIMEOUT"
        : error instanceof DOMException && error.name === "AbortError" ? "ABORTED" : "REQUEST_FAILED";
      endpointStatuses.push({ endpoint, status: reason === "ABORTED" ? "ABORTED" : "FAILED", acceptedBytes: 0, reason });
      if (reason === "ABORTED") {
        fatalResponse = true;
        break;
      }
    } finally {
      endpointRequest.dispose();
    }
  }
  if (fatalResponse) {
    metrics.length = 0;
    delete baseMeta.minuteRows;
  }
  return { metrics, captureMeta: baseMeta };
}

function projectMetrics(endpoint: LiveScreenInternalApiEndpointKey, data: Record<string, unknown>, mode: "SNAPSHOT" | "PULSE"): VisibleMetric[] {
  const contract = liveScreenInternalApiContracts[endpoint];
  return contract.fields.flatMap((field) => {
    if (mode === "PULSE" && field.purpose !== "PULSE_ONLY") return [];
    if (mode === "SNAPSHOT" && field.purpose === "PULSE_ONLY") return [];
    if (field.rowPath) return [];
    const matched = readApprovedFieldValue(data, field.approvedFieldPaths);
    if (!matched) return [];
    const { value, fieldPath } = matched;
    const displayValue = String(value).trim();
    if (!displayValue || responseSafetyPattern.test(displayValue)) return [];
    const parsedValue = field.metricKey === "average_watch_duration_seconds"
      ? parseAverageWatchDuration(displayValue)
      : parseDisplayedMetricValue(displayValue, metricValueSemantic(field.metricKey), field.unit);
    if (!parsedValue.normalizedText) return [];
    const evidence: MetricRawEvidence = {
      sourceType: "INTERNAL_API",
      bindingKind: "CARD",
      fieldLabel: field.fieldLabel,
      displayValue,
      normalizedValue: parsedValue.normalizedText,
      displayPrecision: field.displayPrecision,
      unitSource: field.unit ? "DEFAULT" : "NONE",
      timeRange: field.timeRange,
      timeRangeSource: "COMPONENT",
      timeRangeLocation: "internal-api-contract",
      componentPath: fieldPath,
      calibrationSignature: `${field.metricKey}|${field.timeRange}|${field.semanticScope}|${fieldPath}`,
      validationStatus: "REQUIRES_REVIEW",
      validationReasons: [],
      endpointKey: endpoint,
      semanticScope: field.semanticScope,
      apiContractVersion: liveScreenInternalApiContractVersion,
      apiAdapterVersion: liveScreenInternalApiAdapterVersion,
      evidencePurpose: field.purpose
    };
    const apiCandidate = {
      value: parsedValue.normalizedText,
      displayValue,
      unit: field.unit,
      timeRange: field.timeRange,
      displayPrecision: field.displayPrecision,
      fieldPath,
      fieldLabel: field.fieldLabel
    };
    return [{
      key: field.metricKey,
      name: field.metricName,
      value: displayValue,
      unit: field.unit,
      source: "network" as const,
      metricSource: "XHR_JSON" as const,
      confidence: 0.8,
      rawEvidence: {
        ...evidence,
        sourceStatus: "INTERNAL_API",
        apiCandidate,
        selectionReason: "仅 API 字段有效"
      }
    }];
  });
}

function parseAverageWatchDuration(displayValue: string) {
  const matched = displayValue.match(/^((?:0|[1-9]\d*)(?:\.\d+)?)\s*(?:s|秒)$/i);
  if (!matched) return parseDisplayedMetricValue(displayValue, "COUNT", "s");
  return {
    displayValue,
    normalizedText: matched[1]!,
    displayPrecision: matched[1]!.split(".")[1]?.length || 0,
    multiplier: 1,
    unit: "s",
    status: "REQUIRES_REVIEW" as const,
    reasons: []
  };
}

export function readApprovedFieldValue(
  data: Record<string, unknown>,
  approvedFieldPaths: readonly string[]
): { value: string | number; fieldPath: string } | null {
  for (const fieldPath of approvedFieldPaths) {
    const value = readPath(data, fieldPath.replace(/^data\./, ""));
    if (typeof value === "number" && Number.isFinite(value)) return { value, fieldPath };
    if (typeof value === "string" && value.trim()) return { value, fieldPath };
  }
  return null;
}

function projectMinuteRows(data: Record<string, unknown>) {
  const rows = data.minute_rows;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const record = row as Record<string, unknown>;
    const intervalLabel = typeof record.interval_label === "string" ? record.interval_label.trim() : "";
    const liveViews = record.live_views;
    if (!intervalLabel || (typeof liveViews !== "number" && typeof liveViews !== "string")) return [];
    const value = String(liveViews).trim();
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return [];
    return [{ intervalLabel, liveViews: value }];
  });
}

async function readSafeJson(response: Response, limit: number, signal?: AbortSignal): Promise<{ ok: true; value: unknown; acceptedBytes: number } | { ok: false; acceptedBytes: number; reason: string }> {
  const reader = response.body?.getReader();
  if (!reader) return { ok: false, acceptedBytes: 0, reason: signal?.aborted ? "ABORTED" : "EMPTY_RESPONSE" };
  const decoder = new TextDecoder();
  let text = "";
  let acceptedBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      acceptedBytes += chunk.value.byteLength;
      if (acceptedBytes > limit) {
        await reader.cancel();
        return { ok: false, acceptedBytes, reason: "BYTE_LIMIT" };
      }
      text += decoder.decode(chunk.value, { stream: true });
      if (responseSafetyPattern.test(text)) {
        await reader.cancel();
        return { ok: false, acceptedBytes, reason: "SENSITIVE_RESPONSE" };
      }
    }
    text += decoder.decode();
    if (responseSafetyPattern.test(text)) return { ok: false, acceptedBytes, reason: "SENSITIVE_RESPONSE" };
    return { ok: true, value: JSON.parse(text), acceptedBytes };
  } catch {
    return { ok: false, acceptedBytes, reason: signal?.aborted ? "ABORTED" : "JSON_PARSE_FAILED" };
  } finally {
    reader.releaseLock();
  }
}

function createEndpointRequest(parentSignal: AbortSignal | undefined, timeoutMs: number | null) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = timeoutMs == null ? null : globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      if (timer != null) globalThis.clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortFromParent);
    }
  };
}

function readPath(source: unknown, path: string) {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (!segment || segment.includes("[")) return undefined;
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Douyin live-screen endpoints have shipped two equivalent envelopes: `code`
 * with `data`, and `status_code` with either `data` or `result`. Normalize only
 * those fixed envelopes; field projection remains governed by the endpoint
 * contract, so unknown response fields are never retained or uploaded.
 */
function normalizePlatformResponse(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const code = record.code ?? record.status_code;
  const data = record.data ?? record.result;
  if (typeof code !== "number" || !Number.isInteger(code) || !data || typeof data !== "object" || Array.isArray(data)) {
    return value;
  }
  return { code, data };
}
