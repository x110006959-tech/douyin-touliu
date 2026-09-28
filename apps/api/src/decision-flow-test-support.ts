import { createHash } from "node:crypto";
import { expect } from "vitest";
import {
  liveScreenInternalApiAdapterVersion,
  liveScreenInternalApiContractVersion,
  liveScreenInternalApiContracts,
  localPromotionInternalApiAdapterVersion,
  localPromotionInternalApiContractVersion,
  localPromotionInternalApiEndpointContracts,
  type VisibleMetric
} from "@douyin-local-life/shared";
import { processNextDecisionRun } from "./ai-diagnosis/worker.js";
import { createSyntheticDiagnosisTransport } from "./ai-diagnosis/synthetic-evaluation.js";
import { syntheticDiagnosisCases } from "@douyin-local-life/diagnosis-skills";

export type ApiEnvelope<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: { code: string; message: string } };

export type ReviewMetricResponse = {
  id: string;
  metricKey: string;
  originalValue: string | null;
  reviewedValue: string | null;
  normalizedValue?: string | null;
  metricSource: string;
  confidence: number;
  rawEvidence?: unknown;
  reviewStatus: "PENDING" | "CONFIRMED" | "MODIFIED" | "IGNORED";
};

export type DecisionRunResponse = {
  id: string;
  mode: "LEGACY_RULE" | "AI_SKILL_ORCHESTRATED";
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  confidence: number;
  inputJson: {
    metricLayer: "REVIEWED_METRIC";
    dataReviewStatus: "REVIEWED" | "UNREVIEWED";
    reviewCoverage: { confirmedCount: number; modifiedCount: number; ignoredCount: number; pendingCount: number; totalCount: number };
    metrics: Array<{ key: string; value: number | string | null }>;
  };
  finalResultJson: {
    dataQuality: { globalSafetyBlock: boolean; missingFields: string[] };
    actionProposals: Array<{ actionType: string }>;
    businessAnalysis: {
      mode?: string;
      findings: Array<{ dimension: string }>;
      recommendations: Array<{ title: string; dimension: string }>;
      metricExplanations: Array<{ title: string }>;
    };
  };
  manualCheckItemsJson: unknown;
  finalResult: {
    schemaVersion: "ai-diagnosis-result-v1";
    evidenceCatalog: Array<{ id: string }>;
  };
  actionProposals: Array<{ id: string; actionType: string; status: string; requiresApproval: boolean }>;
};

export type ActionOutcomeResponse = {
  id: string;
  actionProposalId: string;
  observationWindow: "30m" | "2h" | "1d" | "custom";
  result: "IMPROVED" | "WORSENED" | "NO_CHANGE" | "UNCLEAR";
};

export type ProjectOutcomeSummaryResponse = {
  total: number;
  byResult: Record<"IMPROVED" | "WORSENED" | "NO_CHANGE" | "UNCLEAR", number>;
  byActionType: Array<{ actionType: string; total: number }>;
};

export function restoreDecisionTestEnvironment(name: "AI_DIAGNOSIS_ENABLED" | "DEEPSEEK_API_KEY", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

export function metric(key: string, name: string, value: number | string | null, unit?: string) {
  return { key, name, value, unit: unit || null, source: "manual" };
}

export function captureMeta(adapterId: string, fields: string[]) {
  return {
    adapterId,
    adapterVersion: "1.0.0",
    pageFingerprint: `fixture-${adapterId}`,
    completeness: "COMPLETE",
    coverageRatio: 1,
    expectedFields: fields,
    extractedFields: fields,
    visibleRegions: ["fixture"],
    renderModes: ["DOM"],
    tabState: "VISIBLE",
    originalBytes: 100,
    acceptedBytes: 100,
    truncatedFields: [],
    truncationReasons: []
  };
}

export function internalApiPulseMetric(
  field: (typeof liveScreenInternalApiContracts.key_index.fields)[number],
  value: number,
  displayValue: string
): VisibleMetric {
  return {
    key: field.metricKey,
    name: field.metricName,
    value,
    unit: field.unit,
    source: "network",
    metricSource: "XHR_JSON",
    confidence: 1,
    rawEvidence: {
      sourceType: "INTERNAL_API",
      bindingKind: "CARD",
      fieldLabel: field.fieldLabel,
      displayValue,
      normalizedValue: String(value),
      displayPrecision: field.displayPrecision,
      unitSource: field.unit ? "DEFAULT" : "NONE",
      timeRange: field.timeRange,
      timeRangeSource: "COMPONENT",
      timeRangeLocation: "internal-api-contract",
      componentPath: field.fieldPath,
      calibrationSignature: `${field.metricKey}|${field.timeRange}|${field.semanticScope}|${field.fieldPath}`,
      validationStatus: "TRUSTED",
      validationReasons: [],
      sourceStatus: "INTERNAL_API",
      apiCandidate: {
        value: String(value),
        displayValue,
        unit: field.unit,
        timeRange: field.timeRange,
        displayPrecision: field.displayPrecision,
        fieldPath: field.fieldPath,
        fieldLabel: field.fieldLabel
      },
      selectionReason: "仅 API 字段有效",
      semanticScope: field.semanticScope,
      apiContractVersion: liveScreenInternalApiContractVersion,
      apiAdapterVersion: liveScreenInternalApiAdapterVersion,
      endpointKey: "key_index",
      evidencePurpose: field.purpose
    }
  };
}

export function localPromotionPulseMetric(
  field: (typeof localPromotionInternalApiEndpointContracts.statQuery.fields)[number],
  value: number,
  displayValue: string
): VisibleMetric {
  return {
    key: field.metricKey,
    name: field.metricName,
    value: displayValue,
    unit: field.unit,
    source: "network",
    metricSource: "XHR_JSON",
    confidence: 0.8,
    rawEvidence: {
      sourceType: "INTERNAL_API",
      bindingKind: "CARD",
      fieldLabel: field.fieldLabel,
      displayValue,
      normalizedValue: String(value),
      displayPrecision: field.displayPrecision,
      unitSource: field.unit ? "DEFAULT" : "NONE",
      timeRange: "实时",
      timeRangeSource: "COMPONENT",
      timeRangeLocation: "local-promotion-internal-api-contract",
      componentPath: field.fieldPath,
      calibrationSignature: `${field.metricKey}|实时|${field.semanticScope}|${field.fieldPath}`,
      validationStatus: "REQUIRES_REVIEW",
      validationReasons: [],
      sourceStatus: "INTERNAL_API",
      routeKey: "LOCAL_PROMOTION_DASHBOARD",
      apiCandidate: {
        value: String(value),
        displayValue,
        unit: field.unit,
        timeRange: "实时",
        displayPrecision: field.displayPrecision,
        fieldPath: field.fieldPath,
        fieldLabel: field.fieldLabel
      },
      selectionReason: "仅 API 字段有效",
      semanticScope: field.semanticScope,
      apiContractVersion: localPromotionInternalApiContractVersion,
      apiAdapterVersion: localPromotionInternalApiAdapterVersion,
      endpointKey: "statQuery",
      evidencePurpose: "PULSE_ONLY"
    }
  };
}

export function hashForTest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createDecisionFlowApiClient(baseUrlProvider: () => string) {
  async function apiWithDecisionTiming<T>(
    path: string,
    token: string,
    options: { method?: string; body?: unknown; headers?: Record<string, string> }
  ) {
    const response = await fetch(`${baseUrlProvider()}${path}`, {
      method: options.method || "GET",
      headers: requestHeaders(token, options.headers),
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const envelope = (await response.json()) as ApiEnvelope<T>;
    if (!envelope.success) throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
    const timing = response.headers.get("server-timing") || "";
    const transactionMs = Number(timing.match(/decision-write;dur=([\d.]+)/)?.[1] || Number.POSITIVE_INFINITY);
    return { data: envelope.data, transactionMs };
  }

  async function api<T>(
    path: string,
    token: string | null,
    options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const response = await fetch(`${baseUrlProvider()}${path}`, {
      method: options.method || "GET",
      headers: requestHeaders(token, options.headers),
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const envelope = (await response.json()) as ApiEnvelope<T>;
    if (!envelope.success) {
      expect(envelope).toMatchObject({
        success: false,
        data: null,
        error: { code: expect.any(String), message: expect.any(String) }
      });
      throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
    }
    expect(envelope).toMatchObject({ success: true, error: null });
    expect(envelope.data).toBeDefined();
    if (path === "/auth/register" || path === "/auth/login") {
      const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
      const csrfToken = (envelope.success ? (envelope.data as { csrfToken?: string }).csrfToken : null) || "";
      if (cookie && csrfToken && envelope.success) {
        return { ...(envelope.data as object), token: encodeTestSession(cookie, csrfToken) } as T;
      }
    }
    return envelope.data;
  }

  async function apiError(path: string, token: string | null, options: { method?: string; body?: unknown; headers?: Record<string, string> }, expectedCode: string) {
    const response = await fetch(`${baseUrlProvider()}${path}`, {
      method: options.method || "GET",
      headers: requestHeaders(token, options.headers),
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const envelope = (await response.json()) as ApiEnvelope<unknown>;
    expect(envelope).toMatchObject({
      success: false,
      data: null,
      error: { code: expectedCode, message: expect.any(String) }
    });
  }

  async function currentReviewSnapshotVersions(taskId: string, token: string) {
    const dashboard = await api<{
      summary: {
        routes: Array<{ snapshotId: string | null; snapshotUpdatedAt: string | null }>;
      };
    }>(`/collection-tasks/${taskId}/collection-dashboard`, token);
    return dashboard.summary.routes.flatMap((route) => route.snapshotId && route.snapshotUpdatedAt
      ? [{ snapshotId: route.snapshotId, expectedSnapshotUpdatedAt: route.snapshotUpdatedAt }]
      : []);
  }

  async function completeDecisionRun(id: string, token: string) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const testCase = syntheticDiagnosisCases[attempt % syntheticDiagnosisCases.length]!;
      await processNextDecisionRun({
        workerId: `test-worker-${attempt}`,
        transport: createSyntheticDiagnosisTransport(testCase)
      });
      const run = await api<DecisionRunResponse>(`/decision-runs/${id}`, token);
      if (run.status === "SUCCEEDED") return run;
      if (run.status === "FAILED") throw new Error(`${id} failed during fake worker execution`);
    }
    throw new Error(`${id} did not reach a terminal status`);
  }

  return { api, apiError, apiWithDecisionTiming, completeDecisionRun, currentReviewSnapshotVersions };
}

function requestHeaders(token: string | null, extra: Record<string, string> = {}) {
  if (token?.startsWith("test-session:")) {
    const { cookie, csrfToken } = decodeTestSession(token);
    return {
      "content-type": "application/json",
      cookie,
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      "x-csrf-token": csrfToken,
      ...extra
    };
  }
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...extra
  };
}

function encodeTestSession(cookie: string, csrfToken: string) {
  return `test-session:${Buffer.from(JSON.stringify({ cookie, csrfToken })).toString("base64url")}`;
}

function decodeTestSession(value: string) {
  return JSON.parse(Buffer.from(value.slice("test-session:".length), "base64url").toString("utf8")) as { cookie: string; csrfToken: string };
}
