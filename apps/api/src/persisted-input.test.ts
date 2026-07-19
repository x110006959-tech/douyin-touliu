import { describe, expect, it, vi } from "vitest";
import { writeAuditLog } from "./audit.js";
import { SensitivePersistedInputError, readSafeOptionalText, sanitizeDerivedPersistedJson, sanitizePersistedJson, sanitizeRequestMetadata } from "./persisted-input.js";

describe("persisted input safety", () => {
  it("rejects sensitive JSON instead of silently redacting and storing it", () => {
    expect(() => sanitizePersistedJson({ nested: { authorization: "Bearer credential-that-must-not-persist" } }))
      .toThrow(SensitivePersistedInputError);
  });

  it("keeps already-sanitized derived records serializable", () => {
    expect(() => sanitizePersistedJson({ request: { authorization: "[REDACTED]" } }))
      .toThrow(SensitivePersistedInputError);

    expect(sanitizeDerivedPersistedJson({ request: { authorization: "[REDACTED]" } }))
      .toEqual({ request: { authorization: "[REDACTED]" } });
  });

  it("rejects free-text credentials and does not silently truncate oversized input", () => {
    expect(readSafeOptionalText("authorization=Bearer credential-that-must-not-persist"))
      .toMatchObject({ value: null, error: "输入包含敏感认证信息，已拒绝保存" });
    expect(readSafeOptionalText("x".repeat(101), 100))
      .toMatchObject({ value: null, error: "输入不能超过 100 个字符" });
  });

  it("redacts credential-like request metadata before it reaches audit storage", () => {
    expect(sanitizeRequestMetadata("collector token=must-not-persist"))
      .toBe("collector token=[REDACTED]");
  });

  it("rejects sensitive audit details before the database write", async () => {
    const create = vi.fn();
    const request = {
      ip: "127.0.0.1",
      header: () => null,
      user: { id: "user-1", email: "user@example.com" }
    };

    await expect(writeAuditLog(
      request as never,
      "test.audit",
      { detailJson: { access_token: "must-not-persist" } },
      { auditLog: { create } } as never
    )).rejects.toThrow(SensitivePersistedInputError);
    expect(create).not.toHaveBeenCalled();
  });

  it("stores a minimal immutable actor snapshot with every audit record", async () => {
    const create = vi.fn();
    const request = {
      ip: "127.0.0.1",
      header: () => null,
      user: { id: "user-1", email: "user@example.com" }
    };

    await writeAuditLog(
      request as never,
      "test.audit",
      {},
      { auditLog: { create } } as never
    );

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ actorSnapshotJson: { userId: "user-1" } })
    }));
  });
});
