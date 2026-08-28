import { describe, expect, it } from "vitest";
import {
  extensionCollectionProtocolVersion,
  localPromotionInternalApiAdapterVersion,
  localPromotionInternalApiContractVersion,
  localPromotionInternalApiEndpointContracts,
  type CollectionSnapshotPayload,
  type VisibleMetric
} from "@douyin-local-life/shared";
import { validateLocalPromotionInternalApiPulse } from "./local-promotion-internal-api-validation.js";

describe("local promotion internal API server validation", () => {
  it("accepts a metric only when its endpoint and fixed field evidence match", () => {
    expect(validateLocalPromotionInternalApiPulse(input(validMetric()))).toEqual({ ok: true });
  });

  it("rejects DOM metrics and unapproved daily-budget evidence in a pulse", () => {
    expect(validateLocalPromotionInternalApiPulse(input({
      ...validMetric(),
      key: "daily_budget",
      name: "日预算",
      source: "dom",
      metricSource: "DOM_TEXT"
    }))).toMatchObject({ ok: false, code: "LOCAL_PROMOTION_PULSE_PURPOSE_INVALID" });
  });

  it("rejects a local-promotion pulse without internal API evidence", () => {
    expect(validateLocalPromotionInternalApiPulse({
      ...input(validMetric()),
      captureMeta: {} as CollectionSnapshotPayload["captureMeta"],
      metrics: [{ ...validMetric(), source: "dom", metricSource: "DOM_TEXT" }]
    })).toMatchObject({ ok: false, code: "LOCAL_PROMOTION_INTERNAL_API_CONTRACT_MISMATCH" });
  });

  it("rejects a forged metric value even when the field metadata is valid", () => {
    expect(validateLocalPromotionInternalApiPulse(input({
      ...validMetric(),
      value: "999999"
    }))).toMatchObject({ ok: false, code: "LOCAL_PROMOTION_INTERNAL_API_EVIDENCE_INVALID" });
  });

  it("rejects forged field paths even when the endpoint reports success", () => {
    const metric = validMetric();
    metric.rawEvidence = {
      ...metric.rawEvidence!,
      componentPath: "data.StatsData.Totals[metric].unknown",
      calibrationSignature: "spend|实时|本日投放消耗|data.StatsData.Totals[metric].unknown",
      apiCandidate: { ...metric.rawEvidence!.apiCandidate!, fieldPath: "data.StatsData.Totals[metric].unknown" }
    };
    expect(validateLocalPromotionInternalApiPulse(input(metric))).toMatchObject({
      ok: false,
      code: "LOCAL_PROMOTION_INTERNAL_API_EVIDENCE_INVALID"
    });
  });

  it("requires both fixed endpoints and rejects duplicate metric keys", () => {
    const missingMetadataEndpoint = input(validMetric());
    missingMetadataEndpoint.captureMeta!.localPromotionInternalApi!.endpointStatuses = [
      { endpoint: "statQuery", status: "SUCCESS", acceptedBytes: 100 }
    ];
    expect(validateLocalPromotionInternalApiPulse(missingMetadataEndpoint)).toMatchObject({
      ok: false,
      code: "LOCAL_PROMOTION_INTERNAL_API_EVIDENCE_INVALID"
    });

    const duplicate = input(validMetric());
    duplicate.metrics = [validMetric(), validMetric()];
    expect(validateLocalPromotionInternalApiPulse(duplicate)).toMatchObject({
      ok: false,
      code: "LOCAL_PROMOTION_INTERNAL_API_EVIDENCE_INVALID"
    });
  });

  it("requires successful promote metadata evidence for full-domain metrics", () => {
    const fullDomainField = localPromotionInternalApiEndpointContracts.statQuery.fields
      .find((field) => field.groupKeys.includes("roi2_promotion"))!;
    const missingPromoteMeta = input(validMetric(fullDomainField));
    expect(validateLocalPromotionInternalApiPulse(missingPromoteMeta)).toMatchObject({
      ok: false,
      code: "LOCAL_PROMOTION_INTERNAL_API_EVIDENCE_INVALID"
    });

    missingPromoteMeta.captureMeta!.localPromotionInternalApi!.endpointStatuses.splice(1, 0, {
      endpoint: "liveReportPromoteMeta",
      status: "SUCCESS",
      acceptedBytes: 100
    });
    expect(validateLocalPromotionInternalApiPulse(missingPromoteMeta)).toEqual({ ok: true });
  });

  it("keeps the feature switch and exact page fail-closed", () => {
    expect(validateLocalPromotionInternalApiPulse({ ...input(validMetric()), featureEnabled: false })).toMatchObject({
      ok: false,
      code: "LOCAL_PROMOTION_INTERNAL_API_DISABLED"
    });
    expect(validateLocalPromotionInternalApiPulse({
      ...input(validMetric()),
      sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/promotion/roi2?selected_advid=123"
    })).toMatchObject({ ok: false, code: "LOCAL_PROMOTION_INTERNAL_API_PAGE_FORBIDDEN" });
  });

  it("rejects forged identity source classification and source evidence", () => {
    const forgedSource = input(validMetric());
    forgedSource.captureMeta!.localPromotionInternalApi!.identity.source = "DOM";
    expect(validateLocalPromotionInternalApiPulse(forgedSource)).toMatchObject({
      ok: false,
      code: "LOCAL_PROMOTION_IDENTITY_INVALID"
    });

    const forgedEvidence = input(validMetric());
    forgedEvidence.captureMeta!.localPromotionInternalApi!.identity.evidence!.url.selectedAdvid = ["456"];
    expect(validateLocalPromotionInternalApiPulse(forgedEvidence)).toMatchObject({
      ok: false,
      code: "LOCAL_PROMOTION_IDENTITY_INVALID"
    });
  });
});

function input(metric: VisibleMetric) {
  return {
    featureEnabled: true,
    authKind: "EXTENSION" as const,
    sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123",
    pageType: "LOCAL_PROMOTION_DASHBOARD",
    routeKey: "LOCAL_PROMOTION_DASHBOARD",
    captureProtocolVersion: extensionCollectionProtocolVersion,
    captureMeta: {
      localPromotionInternalApi: {
        enabled: true,
        contractVersion: localPromotionInternalApiContractVersion,
        adapterVersion: localPromotionInternalApiAdapterVersion,
        identity: {
          advid: null,
          roomId: null,
          selectedAdvid: "123",
          selectedAwemeId: null,
          source: "URL" as const,
          evidence: {
            url: { advid: [], roomId: [], selectedAdvid: ["123"], selectedAwemeId: [] },
            dom: { advid: [], roomId: [], selectedAdvid: [], selectedAwemeId: [] }
          }
        },
        endpointStatuses: [
          { endpoint: "pageMetrics" as const, status: "SUCCESS" as const, acceptedBytes: 100 },
          { endpoint: "statQuery" as const, status: "SUCCESS" as const, acceptedBytes: 100 }
        ],
        evidencePurpose: "PULSE_ONLY" as const
      }
    } as CollectionSnapshotPayload["captureMeta"],
    metrics: [metric]
  };
}

function validMetric(
  field = localPromotionInternalApiEndpointContracts.statQuery.fields[0]!
): VisibleMetric {
  return {
    key: field.metricKey,
    name: field.metricName,
    value: "100.20",
    unit: field.unit,
    source: "network",
    metricSource: "XHR_JSON",
    confidence: 0.8,
    rawEvidence: {
      sourceType: "INTERNAL_API",
      bindingKind: "CARD",
      fieldLabel: field.fieldLabel,
      displayValue: "100.20",
      normalizedValue: "100.2",
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
      semanticScope: field.semanticScope,
      apiContractVersion: localPromotionInternalApiContractVersion,
      apiAdapterVersion: localPromotionInternalApiAdapterVersion,
      endpointKey: "statQuery",
      evidencePurpose: "PULSE_ONLY",
      apiCandidate: {
        value: "100.2",
        displayValue: "100.20",
        unit: field.unit,
        timeRange: "实时",
        displayPrecision: field.displayPrecision,
        fieldPath: field.fieldPath,
        fieldLabel: field.fieldLabel
      },
      selectionReason: "仅 API 字段有效"
    }
  };
}
