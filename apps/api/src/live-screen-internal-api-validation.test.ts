import { describe, expect, it } from "vitest";
import {
  extensionCollectionProtocolVersion,
  liveScreenInternalApiAdapterVersion,
  liveScreenInternalApiContractVersion,
  liveScreenInternalApiContracts,
  type CollectionSnapshotPayload,
  type VisibleMetric
} from "@douyin-local-life/shared";
import { validateLiveScreenInternalApiPayload } from "./live-screen-internal-api-validation.js";

describe("live screen internal API server validation", () => {
  it("accepts a metric only when its full evidence matches the shared contract", () => {
    expect(validateLiveScreenInternalApiPayload(input(validMetric()))).toEqual({ ok: true });
  });

  it("rejects an arbitrary metric key attached to a successful endpoint", () => {
    expect(validateLiveScreenInternalApiPayload(input({ ...validMetric(), key: "spend", name: "消耗" }))).toMatchObject({
      ok: false,
      code: "LIVE_SCREEN_INTERNAL_API_EVIDENCE_INVALID"
    });
  });

  it("rejects forged field-path metadata even when the endpoint is successful", () => {
    const metric = validMetric();
    metric.rawEvidence = { ...metric.rawEvidence!, componentPath: "data.orders" };
    expect(validateLiveScreenInternalApiPayload(input(metric))).toMatchObject({
      ok: false,
      code: "LIVE_SCREEN_INTERNAL_API_EVIDENCE_INVALID"
    });
  });

  it("rejects an unknown field path even if it is presented as a key-index alias", () => {
    const pulse = pulseInput("LIVE_PRODUCT_TAB");
    const metric = pulse.metrics[0]!;
    metric.rawEvidence = {
      ...metric.rawEvidence!,
      componentPath: "data.unapproved_alias",
      calibrationSignature: `${metric.key}|实时|当前在线人数|data.unapproved_alias`,
      apiCandidate: {
        ...metric.rawEvidence!.apiCandidate!,
        fieldPath: "data.unapproved_alias"
      }
    };

    expect(validateLiveScreenInternalApiPayload(pulse)).toMatchObject({
      ok: false,
      code: "LIVE_SCREEN_INTERNAL_API_EVIDENCE_INVALID"
    });
  });

  it("accepts the primary path from the explicit approved path registry", () => {
    const field = liveScreenInternalApiContracts.key_index.fields[0]!;
    expect(field.approvedFieldPaths).toContain(field.fieldPath);
    expect(validateLiveScreenInternalApiPayload(pulseInput("LIVE_PRODUCT_TAB"))).toEqual({ ok: true });
  });

  it("keeps the server feature switch fail-closed", () => {
    expect(validateLiveScreenInternalApiPayload({ ...input(validMetric()), featureEnabled: false })).toMatchObject({
      ok: false,
      code: "LIVE_SCREEN_INTERNAL_API_DISABLED"
    });
  });

  it("rejects API evidence when the client omits verifiable room ID evidence", () => {
    const value = input(validMetric());
    delete value.captureMeta?.liveScreenInternalApi?.roomIdEvidence;
    expect(validateLiveScreenInternalApiPayload(value)).toMatchObject({
      ok: false,
      code: "LIVE_SCREEN_ROOM_ID_INVALID"
    });
  });

  it("rejects a declared room ID that differs from the source URL", () => {
    expect(validateLiveScreenInternalApiPayload({
      ...input(validMetric()),
      sourceUrl: "https://eos.douyin.com/dp/liveScreen?room_id=456"
    })).toMatchObject({
      ok: false,
      code: "LIVE_SCREEN_ROOM_ID_INVALID"
    });
  });

  it("rejects a forged room ID source classification", () => {
    const value = input(validMetric());
    value.captureMeta!.liveScreenInternalApi!.roomIdSource = "DOM";
    expect(validateLiveScreenInternalApiPayload(value)).toMatchObject({
      ok: false,
      code: "LIVE_SCREEN_ROOM_ID_INVALID"
    });
  });

  it("accepts canonical DOM-only room ID evidence when the URL has no room ID", () => {
    const value = input(validMetric());
    value.sourceUrl = "https://eos.douyin.com/dp/liveScreen";
    value.captureMeta!.liveScreenInternalApi = {
      ...value.captureMeta!.liveScreenInternalApi!,
      roomId: "123",
      roomIdSource: "DOM",
      roomIdEvidence: { urlRoomIds: [], domRoomIds: ["123"] }
    };
    expect(validateLiveScreenInternalApiPayload(value)).toEqual({ ok: true });
  });

  it("rejects endpoint bytes that exceed the endpoint contract limit", () => {
    const value = input(validMetric());
    value.captureMeta!.liveScreenInternalApi!.endpointStatuses[0]!.acceptedBytes = liveScreenInternalApiContracts.room_info.maxResponseBytes + 1;
    expect(validateLiveScreenInternalApiPayload(value)).toMatchObject({
      ok: false,
      code: "LIVE_SCREEN_INTERNAL_API_EVIDENCE_INVALID"
    });
  });

  it("allows room-level API pulses from product and traffic tabs but keeps formal API evidence on overview", () => {
    const pulse = pulseInput("LIVE_PRODUCT_TAB");
    expect(validateLiveScreenInternalApiPayload(pulse)).toEqual({ ok: true });
    expect(validateLiveScreenInternalApiPayload({
      ...input(validMetric()),
      routeKey: "LIVE_PRODUCT_TAB"
    })).toMatchObject({
      ok: false,
      code: "LIVE_SCREEN_INTERNAL_API_PAGE_FORBIDDEN"
    });
  });

  it("rejects minute-trend evidence in a real-time pulse", () => {
    const pulse = pulseInput("LIVE_PRODUCT_TAB");
    pulse.captureMeta!.liveScreenInternalApi!.minuteRows = [{ intervalLabel: "12:01", liveViews: "20" }];
    expect(validateLiveScreenInternalApiPayload(pulse)).toMatchObject({
      ok: false,
      code: "LIVE_SCREEN_PULSE_PURPOSE_INVALID"
    });
  });

  it("rejects DOM or dual-source evidence in a real-time pulse", () => {
    const pulse = pulseInput("LIVE_PRODUCT_TAB");
    const metric = pulse.metrics[0]!;
    metric.rawEvidence = {
      ...metric.rawEvidence!,
      sourceStatus: "API_AND_DOM",
      domCandidate: { value: "12", displayValue: "12", fieldLabel: metric.name }
    };
    expect(validateLiveScreenInternalApiPayload(pulse)).toMatchObject({
      ok: false,
      code: "LIVE_SCREEN_PULSE_PURPOSE_INVALID"
    });
  });

  it("rejects a former minute endpoint status even when no minute rows are attached", () => {
    const pulse = pulseInput("LIVE_PRODUCT_TAB");
    pulse.captureMeta!.liveScreenInternalApi!.endpointStatuses = [{
      endpoint: "room_minute_indicator",
      status: "SUCCESS",
      acceptedBytes: 100
    }];
    expect(validateLiveScreenInternalApiPayload(pulse)).toMatchObject({
      ok: false,
      code: "LIVE_SCREEN_INTERNAL_API_EVIDENCE_INVALID"
    });
  });
});

function pulseInput(routeKey: "LIVE_PRODUCT_TAB" | "LIVE_TRAFFIC_TAB") {
  const field = liveScreenInternalApiContracts.key_index.fields[0]!;
  const metric: VisibleMetric = {
    key: field.metricKey,
    name: field.metricName,
    value: "12",
    unit: field.unit,
    source: "network",
    metricSource: "XHR_JSON",
    confidence: 0.8,
    rawEvidence: {
      sourceType: "INTERNAL_API",
      bindingKind: "CARD",
      fieldLabel: field.fieldLabel,
      displayValue: "12",
      normalizedValue: "12",
      displayPrecision: field.displayPrecision,
      unitSource: field.unit ? "DEFAULT" : "NONE",
      timeRange: field.timeRange,
      timeRangeSource: "COMPONENT",
      timeRangeLocation: "internal-api-contract",
      componentPath: field.fieldPath,
      calibrationSignature: `${field.metricKey}|${field.timeRange}|${field.semanticScope}|${field.fieldPath}`,
      validationStatus: "REQUIRES_REVIEW",
      validationReasons: [],
      sourceStatus: "INTERNAL_API",
      apiCandidate: {
        value: "12",
        displayValue: "12",
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
      evidencePurpose: "PULSE_ONLY"
    }
  };
  const value = input(metric);
  return {
    ...value,
    routeKey,
    mode: "PULSE" as const,
    captureMeta: {
      ...value.captureMeta,
      liveScreenInternalApi: {
        ...value.captureMeta!.liveScreenInternalApi!,
        endpointStatuses: [{
          endpoint: "key_index" as const,
          status: "SUCCESS" as const,
          acceptedBytes: 100
        }]
      }
    }
  };
}

function input(metric: VisibleMetric) {
  return {
    featureEnabled: true,
    authKind: "EXTENSION" as const,
    sourceUrl: "https://eos.douyin.com/dp/liveScreen?room_id=123",
    pageType: "LIVE_DATA_SCREEN",
    routeKey: "LIVE_DATA_SCREEN",
    captureProtocolVersion: extensionCollectionProtocolVersion,
    captureMeta: {
      liveScreenInternalApi: {
        enabled: true,
        contractVersion: liveScreenInternalApiContractVersion,
        adapterVersion: liveScreenInternalApiAdapterVersion,
        roomId: "123",
        roomIdSource: "URL" as const,
        roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
        endpointStatuses: [{ endpoint: "room_info" as const, status: "SUCCESS" as const, acceptedBytes: 100 }]
      }
    } as CollectionSnapshotPayload["captureMeta"],
    metrics: [metric],
    mode: "SNAPSHOT" as const
  };
}

function validMetric(): VisibleMetric {
  return {
    key: "live_viewers",
    name: "整场累计看播人数",
    value: "12",
    unit: null,
    source: "network",
    metricSource: "XHR_JSON",
    confidence: 0.8,
    rawEvidence: {
      sourceType: "INTERNAL_API",
      bindingKind: "CARD",
      fieldLabel: "整场累计看播人数",
      displayValue: "12",
      normalizedValue: "12",
      displayPrecision: 0,
      unitSource: "NONE",
      timeRange: "本场",
      timeRangeSource: "COMPONENT",
      timeRangeLocation: "internal-api-contract",
      componentPath: "data.live_viewers",
      calibrationSignature: "live_viewers|本场|整场累计看播人数|data.live_viewers",
      validationStatus: "REQUIRES_REVIEW",
      validationReasons: [],
      sourceStatus: "INTERNAL_API",
      apiCandidate: {
        value: "12",
        displayValue: "12",
        unit: null,
        timeRange: "本场",
        displayPrecision: 0,
        fieldPath: "data.live_viewers",
        fieldLabel: "整场累计看播人数"
      },
      selectionReason: "仅 API 字段有效",
      semanticScope: "整场累计看播人数",
      apiContractVersion: liveScreenInternalApiContractVersion,
      apiAdapterVersion: liveScreenInternalApiAdapterVersion,
      endpointKey: "room_info",
      evidencePurpose: "SNAPSHOT_EVIDENCE"
    }
  };
}
