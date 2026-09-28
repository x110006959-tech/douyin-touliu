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
const creditsSource = readFileSync(
  fileURLToPath(new URL("../../lib/credits.ts", import.meta.url)),
  "utf8"
);
const registerPageSource = readFileSync(
  fileURLToPath(new URL("../register/page.tsx", import.meta.url)),
  "utf8"
);
const dashboardSource = readFileSync(
  fileURLToPath(new URL("../dashboard/page.tsx", import.meta.url)),
  "utf8"
);
const collectionDashboardSource = readFileSync(
  fileURLToPath(new URL("../tasks/[id]/collection-dashboard/page.tsx", import.meta.url)),
  "utf8"
);
const diagnosisComparisonSource = readFileSync(
  fileURLToPath(new URL("../tasks/[id]/diagnosis-comparison.tsx", import.meta.url)),
  "utf8"
);

describe("login page public registration visibility", () => {
  it("supports identifier login and exposes direct registration", () => {
    expect(loginPageSource).toContain('apiFetch<AuthPayload>("/auth/login"');
    expect(loginPageSource).toContain('identifier: form.get("identifier")');
    expect(loginPageSource).toContain("邮箱或手机号");
    expect(loginPageSource).toContain('router.push("/register")');
    expect(registerPageSource).toContain('apiFetch<RegisterPayload>("/auth/register"');
    expect(registerPageSource).toContain("邮箱和手机号至少填写一个");
    expect(registerPageSource).toContain("确认密码");
  });

  it("limits the initial session check so the login form cannot wait on an unavailable API indefinitely", () => {
    expect(authContextSource).toContain("const SESSION_CHECK_TIMEOUT_MS = 3_000;");
    expect(authContextSource).toContain("const controller = new AbortController();");
    expect(authContextSource).toContain('apiFetch<AuthUser & { csrfToken: string }>("/auth/me", null, { signal: controller.signal })');
    expect(authContextSource).toContain("if (active) setHydrated(true);");
  });

  it("prevents stale logout and auth/me responses from clearing a newer login", () => {
    expect(authContextSource).toContain("const authTransitionRef = useRef(0);");
    expect(authContextSource).toContain("const authTransition = ++authTransitionRef.current;");
    expect(authContextSource).toContain("if (authTransition !== authTransitionRef.current) return;");
    expect(authContextSource).toContain('return apiFetch<void>("/auth/logout", cookieSessionMarker, { method: "POST" })\n      .catch(() => undefined)\n      .finally(() => {\n        if (authTransition !== authTransitionRef.current) return;');
    expect(authContextSource).toContain("setCsrfToken(null);\n          setTokenState(null);\n          setUser(null);");
    expect(dashboardSource).toContain("await setToken(null);");
  });

  it("shows and refreshes credit balance around diagnosis runs", () => {
    expect(dashboardSource).toContain("剩余积分");
    expect(authContextSource).toContain("fetchLatestCreditBalance");
    expect(authContextSource).toContain("createLatestRequestGuard");
    expect(creditsSource).toContain('apiFetch<{ creditBalance: number }>("/credits", token)');
    expect(creditsSource).toContain("isCurrent(refreshVersion)");
    expect(collectionDashboardSource).toContain("积分不足，无法创建新的 AI 诊断");
    expect(collectionDashboardSource).toContain("本次积分已返还");
    expect(collectionDashboardSource).toContain("refreshCredits");
    expect(diagnosisComparisonSource).toContain("重新运行 AI 诊断（1 积分）");
    expect(diagnosisComparisonSource).toContain("creditBalance <= 0");
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
