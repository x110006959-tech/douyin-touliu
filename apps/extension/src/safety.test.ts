import { describe, expect, it } from "vitest";
import {
  normalizeApiBaseUrl,
  sanitizeSensitiveFields,
  sanitizeSnapshotPayload
} from "./safety";

describe("extension safety helpers", () => {
  it("redacts direct sensitive fields", () => {
    expect(
      sanitizeSensitiveFields({
        password: "pw",
        cookie: "cookie",
        token: "token",
        authorization: "bearer",
        secret: "secret",
        access_token: "access",
        refresh_token: "refresh",
        session: "session",
        credential: "credential",
        phone: "13800138000",
        mobile: "13800138000",
        idCard: "110101199003074455",
        identityCard: "110101199003074455",
        email: "demo@example.com",
        name: "Alice",
        keep: "safe"
      })
    ).toEqual({
      password: "[REDACTED]",
      cookie: "[REDACTED]",
      token: "[REDACTED]",
      authorization: "[REDACTED]",
      secret: "[REDACTED]",
      access_token: "[REDACTED]",
      refresh_token: "[REDACTED]",
      session: "[REDACTED]",
      credential: "[REDACTED]",
      phone: "[REDACTED]",
      mobile: "[REDACTED]",
      idCard: "[REDACTED]",
      identityCard: "[REDACTED]",
      email: "[REDACTED]",
      name: "[REDACTED]",
      keep: "safe"
    });
  });

  it("redacts nested objects and arrays recursively", () => {
    const result = sanitizeSensitiveFields({
      user: {
        profile: {
          mobile: "13800138000",
          items: [{ access_token: "token" }, { value: 1 }]
        }
      }
    });

    expect(result).toEqual({
      user: {
        profile: {
          mobile: "[REDACTED]",
          items: [{ access_token: "[REDACTED]" }, { value: 1 }]
        }
      }
    });
  });

  it("allows HTTPS SaaS endpoints and localhost development only", () => {
    expect(normalizeApiBaseUrl("https://api.pxxis.cn/")).toBe("https://api.pxxis.cn");
    expect(normalizeApiBaseUrl("http://127.0.0.1:4000")).toBe("http://127.0.0.1:4000");
    expect(normalizeApiBaseUrl("http://api.pxxis.cn")).toBeNull();
    expect(normalizeApiBaseUrl("https://user:secret@api.pxxis.cn")).toBeNull();
  });

  it("sanitizes snapshots before local persistence or upload", () => {
    const snapshot = sanitizeSnapshotPayload({
      rawDomText: "contact 13800138000 demo@example.com Bearer secret-token",
      rawNetworkJson: [
        {
          url: "https://www.douyin.com/api?access_token=secret",
          method: "post",
          status: 200,
          responseJson: { session: "secret", data: [{ value: 1 }] },
          capturedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      rawTableData: [{ mobile: "13800138000", safe: "ok" }]
    });

    expect(snapshot.rawDomText).toBe("contact [REDACTED] [REDACTED] Bearer [REDACTED]");
    expect(snapshot.rawNetworkJson).toEqual([]);
    expect(snapshot.rawTableData).toEqual([{ mobile: "[REDACTED]", safe: "ok" }]);
  });
});
