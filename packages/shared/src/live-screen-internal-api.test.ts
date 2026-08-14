import { describe, expect, it } from "vitest";
import {
  liveScreenEndpointKeysForMode,
  liveScreenInternalApiContracts,
  liveScreenPulseCoreMetricKeys,
  liveScreenSnapshotEndpointKeys
} from "./live-screen-internal-api.js";

describe("live screen internal API contract", () => {
  it("requests only endpoints that project snapshot evidence", () => {
    expect(liveScreenEndpointKeysForMode("SNAPSHOT")).toEqual(liveScreenSnapshotEndpointKeys);
    expect(liveScreenEndpointKeysForMode("SNAPSHOT")).not.toContain("comment_info");
    expect(liveScreenEndpointKeysForMode("SNAPSHOT").every((endpoint) => (
      liveScreenInternalApiContracts[endpoint].fields.some((field) => field.purpose !== "PULSE_ONLY")
    ))).toBe(true);
  });

  it("keeps API pulses isolated to the live-card endpoint", () => {
    expect(liveScreenEndpointKeysForMode("PULSE")).toEqual(["key_index"]);
    expect(liveScreenEndpointKeysForMode("PULSE")).not.toContain("room_minute_indicator");
  });

  it("uses the platform key-index item value paths instead of invented flat aliases", () => {
    expect(liveScreenInternalApiContracts.key_index.fields.map((field) => field.fieldPath)).toEqual([
      "data.PayGmv.value",
      "data.CurrentUserCnt.value",
      "data.ClientAvgWatchDuration.value",
      "data.GPM.value",
      "data.PayOrderCnt.value",
      "data.PayUvAll.value",
      "data.GoodsCvr.value"
    ]);
    expect(liveScreenInternalApiContracts.key_index.fields.map((field) => field.metricKey)).toEqual(liveScreenPulseCoreMetricKeys);
    expect(liveScreenInternalApiContracts.key_index.fields.every((field) => (
      field.approvedFieldPaths.length === 1 && field.approvedFieldPaths[0] === field.fieldPath
    ))).toBe(true);
  });
});
