import { describe, expect, it } from "vitest";
import { sanitizeAndValidatePersistedInput, sanitizeCollectionSnapshotPayload, sanitizeSensitiveData } from "./safety";

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

  it("drops production network response bodies instead of sanitizing large payloads on the page", () => {
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

    expect(snapshot.rawNetworkJson).toEqual([]);
  });

  it("bounds deeply nested multi-megabyte input without overflowing the call stack", () => {
    const startedAt = performance.now();
    let nested: Record<string, unknown> = { password: "secret", payload: "x".repeat(5 * 1024 * 1024) };
    for (let depth = 0; depth < 5_000; depth += 1) nested = { child: nested };

    const sanitized = sanitizeSensitiveData(nested);

    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(JSON.stringify(sanitized)).not.toContain("secret");
    expect(JSON.stringify(sanitized)).toContain("[TRUNCATED]");
  });

  it("flags sensitive values and keys for non-capture persisted input", () => {
    const result = sanitizeAndValidatePersistedInput({
      comment: "Bearer eyJheader.payload.signature",
      nested: { access_token: "do-not-store" },
      metrics: [{ metricKey: "verify_roi", value: 1.2 }]
    });

    expect(result.hasSensitiveData).toBe(true);
    expect(JSON.stringify(result.value)).not.toContain("do-not-store");
    expect(JSON.stringify(result.value)).not.toContain("eyJheader.payload.signature");
  });

  it("redacts personal data without rejecting ordinary business audit fields", () => {
    const result = sanitizeAndValidatePersistedInput({ name: "张三", email: "demo@example.com", workspaceName: "测试工作区" });

    expect(result.hasSensitiveData).toBe(false);
    expect(result.value).toMatchObject({ name: "[REDACTED]", email: "[REDACTED]", workspaceName: "测试工作区" });
  });

  it("allows credential reference identifiers without treating them as credential values", () => {
    const result = sanitizeAndValidatePersistedInput({ credentialId: "cred_123", sessionId: "session_123" });

    expect(result.hasSensitiveData).toBe(false);
    expect(result.value).toEqual({ credentialId: "cred_123", sessionId: "session_123" });
  });

  it("rejects derived credential material even when it is not a raw token", () => {
    const result = sanitizeAndValidatePersistedInput({ passwordHash: "derived-secret-material" });

    expect(result.hasSensitiveData).toBe(true);
    expect(result.value).toEqual({ passwordHash: "[REDACTED]" });
  });
});
