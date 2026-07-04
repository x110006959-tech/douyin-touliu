import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "./crypto";

describe("session vault encryption", () => {
  it("encrypts password-like payloads without leaving plaintext in stored fields", () => {
    const payload = {
      cookies: "session=abc",
      localStorage: "{}",
      password: "super-secret-password"
    };

    const encrypted = encryptJson(payload);
    const stored = JSON.stringify(encrypted);

    expect(stored).not.toContain("super-secret-password");
    expect(stored).not.toContain("\"password\"");
    expect(decryptJson<typeof payload>(encrypted.encryptedPayload, encrypted.encryptionMeta)).toEqual(payload);
  });
});
