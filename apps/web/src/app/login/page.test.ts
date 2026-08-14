import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createLoginHref, getSafeReturnTo, loginDestination } from "../../lib/auth-redirect";

const loginPageSource = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8"
);
const authContextSource = readFileSync(
  fileURLToPath(new URL("../../lib/AuthContext.tsx", import.meta.url)),
  "utf8"
);

describe("login page public registration visibility", () => {
  it("hides public registration while retaining password login", () => {
    expect(loginPageSource).toContain('apiFetch<AuthPayload>("/auth/login"');
    expect(loginPageSource).toContain("请使用管理员发放的账号登录；公开注册入口暂不展示。");
    expect(loginPageSource).not.toContain('"/auth/register"');
    expect(loginPageSource).not.toContain("第一次使用？创建账号");
    expect(loginPageSource).not.toContain("重新发送验证邮件");
  });

  it("limits the initial session check so the login form cannot wait on an unavailable API indefinitely", () => {
    expect(authContextSource).toContain("const SESSION_CHECK_TIMEOUT_MS = 3_000;");
    expect(authContextSource).toContain("const controller = new AbortController();");
    expect(authContextSource).toContain('apiFetch<{ csrfToken: string }>("/auth/me", null, { signal: controller.signal })');
    expect(authContextSource).toContain("if (active) setHydrated(true);");
  });

  it("returns to a safe in-app task after reauthentication", () => {
    expect(loginPageSource).toContain('useSearchParams');
    expect(loginPageSource).toContain('loginDestination(searchParams.get("returnTo"))');
    expect(loginPageSource).toContain("router.push(returnTo)");
    expect(createLoginHref("/tasks/task-1")).toBe("/login?returnTo=%2Ftasks%2Ftask-1");
    expect(loginDestination("/tasks/task-1?step=pairing")).toBe("/tasks/task-1?step=pairing");
  });

  it("rejects external and malformed login return targets", () => {
    expect(getSafeReturnTo("https://attacker.example.com")).toBeNull();
    expect(getSafeReturnTo("//attacker.example.com")).toBeNull();
    expect(getSafeReturnTo("/\\attacker.example.com")).toBeNull();
    expect(loginDestination("https://attacker.example.com")).toBe("/dashboard");
  });
});
