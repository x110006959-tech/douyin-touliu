import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it } from "vitest";
import { resolveJwtSecret, signToken } from "./auth.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalJwtSecret = process.env.JWT_SECRET;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

describe.sequential("JWT secret validation", () => {
  it("fails outside test when JWT_SECRET is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;

    expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET is required/);
  });

  it("fails outside test when JWT_SECRET is too short", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "too-short";

    expect(() => resolveJwtSecret()).toThrow(/at least 32 characters/);
  });

  it("allows the test-only fallback in test", () => {
    process.env.NODE_ENV = "test";
    delete process.env.JWT_SECRET;

    expect(resolveJwtSecret()).toBe("test-only-change-me");
  });

  it("signs and verifies tokens with a strong configured secret", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "strong-jwt-secret-for-security-tests-12345";

    const token = signToken({ id: "user_1", email: "user@example.com", workspaceId: "workspace_1" });
    const decoded = jwt.verify(token, resolveJwtSecret()) as { id: string; email: string; workspaceId: string };

    expect(decoded).toMatchObject({
      id: "user_1",
      email: "user@example.com",
      workspaceId: "workspace_1"
    });
  });
});
