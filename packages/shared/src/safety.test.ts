import { describe, expect, it } from "vitest";
import { sanitizeCollectionSnapshotPayload, sanitizeSensitiveData, snapshotSafetyLimits } from "./safety";

describe("shared collection safety", () => {
  it("redacts nested credentials and personal data", () => {
    expect(
      sanitizeSensitiveData({ password: "pw", nested: [{ access_token: "token", mobile: "13800138000", keep: 1 }] })
    ).toEqual({ password: "[REDACTED]", nested: [{ access_token: "[REDACTED]", mobile: "[REDACTED]", keep: 1 }] });
  });

  it("sanitizes every persisted snapshot surface", () => {
    const snapshot = sanitizeCollectionSnapshotPayload({
      sourceUrl: "https://life.douyin.com/page?token=secret",
      pageTitle: "contact 13800138000",
      rawDomText: "password=secret Bearer abc",
      rawNetworkJson: [
        {
          url: "https://life.douyin.com/api?access_token=secret",
          method: "get",
          status: 200,
          responseJson: { authorization: "Bearer abc", phone: "13800138000" },
          capturedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      rawTableData: [{ email: "demo@example.com" }],
      visibleMetricsJson: [{ key: "spend", name: "消耗", value: 1, rawEvidence: { token: "secret" } }],
      screenshotUrl: null
    });

    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(JSON.stringify(snapshot)).not.toContain("13800138000");
    expect(snapshot.visibleMetricsJson[0]).toMatchObject({ key: "spend", name: "消耗" });
  });

  it("caps network record count and oversized responses", () => {
    const snapshot = sanitizeCollectionSnapshotPayload({
      sourceUrl: "https://life.douyin.com",
      pageTitle: "page",
      rawDomText: "",
      rawNetworkJson: [
        {
          url: "https://life.douyin.com/api/oversized",
          method: "GET",
          status: 200,
          responseJson: { first: "x".repeat(150_000), second: "y".repeat(150_000) }
        },
        ...Array.from({ length: 50 }, (_, index) => ({
        url: `https://life.douyin.com/api/${index}`,
        method: "GET",
        status: 200,
          responseJson: { index }
        }))
      ],
      rawTableData: [],
      visibleMetricsJson: []
    });

    expect(snapshot.rawNetworkJson.length).toBeLessThanOrEqual(snapshotSafetyLimits.networkRecords);
    expect(snapshot.rawNetworkJson[0]?.responseJson).toMatchObject({ truncated: true });
  });
});
