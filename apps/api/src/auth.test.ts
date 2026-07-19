import { afterEach, describe, expect, it } from "vitest";
import { ensureSecurityConfiguration, resolveSecuritySecret, resolveSessionCookieSecure, sessionCookieName } from "./auth.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalSecuritySecret = process.env.SECURITY_SECRET;
const originalJwtSecret = process.env.JWT_SECRET;
const originalSessionCookieSecure = process.env.SESSION_COOKIE_SECURE;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalSecuritySecret === undefined) {
    delete process.env.SECURITY_SECRET;
  } else {
    process.env.SECURITY_SECRET = originalSecuritySecret;
  }
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
  if (originalSessionCookieSecure === undefined) {
    delete process.env.SESSION_COOKIE_SECURE;
  } else {
    process.env.SESSION_COOKIE_SECURE = originalSessionCookieSecure;
  }
});

describe.sequential("server security secret validation", () => {
  it("fails outside test when SECURITY_SECRET is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SECURITY_SECRET;
    delete process.env.JWT_SECRET;

    expect(() => resolveSecuritySecret()).toThrow(/SECURITY_SECRET is required/);
  });

  it("fails outside test when SECURITY_SECRET is too short", () => {
    process.env.NODE_ENV = "production";
    process.env.SECURITY_SECRET = "too-short";
    delete process.env.JWT_SECRET;

    expect(() => resolveSecuritySecret()).toThrow(/at least 32 characters/);
  });

  it("allows the test-only fallback in test", () => {
    process.env.NODE_ENV = "test";
    delete process.env.SECURITY_SECRET;
    delete process.env.JWT_SECRET;

    expect(resolveSecuritySecret()).toBe("test-only-security-secret-at-least-32-chars");
  });

  it("accepts a strong configured server security secret", () => {
    process.env.NODE_ENV = "production";
    process.env.SECURITY_SECRET = "strong-security-secret-for-security-tests-12345";
    delete process.env.JWT_SECRET;

    expect(resolveSecuritySecret()).toBe("strong-security-secret-for-security-tests-12345");
  });

  it("accepts the legacy JWT_SECRET during the configuration transition", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SECURITY_SECRET;
    process.env.JWT_SECRET = "legacy-jwt-secret-for-security-tests-12345";

    expect(resolveSecuritySecret()).toBe("legacy-jwt-secret-for-security-tests-12345");
  });
});

describe("session cookie security configuration", () => {
  it("keeps production cookies secure by default", () => {
    expect(resolveSessionCookieSecure("production", undefined)).toBe(true);
    expect(resolveSessionCookieSecure("development", undefined)).toBe(false);
  });

  it("allows an explicit local HTTP override without weakening production defaults", () => {
    expect(resolveSessionCookieSecure("production", "false")).toBe(false);
    expect(resolveSessionCookieSecure("development", "true")).toBe(true);
  });

  it("rejects an insecure cookie override when the production server starts", () => {
    process.env.NODE_ENV = "production";
    process.env.SECURITY_SECRET = "strong-security-secret-for-security-tests-12345";
    process.env.SESSION_COOKIE_SECURE = "false";

    expect(() => ensureSecurityConfiguration()).toThrow(/SESSION_COOKIE_SECURE must be true/);
  });

  it("uses the __Host cookie prefix only for secure sessions", () => {
    expect(sessionCookieName("production")).toBe("__Host-pxxis_session");
    expect(sessionCookieName("development")).toBe("pxxis_session");
  });
});
