import bcrypt from "bcryptjs";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createUserSession } from "./auth.js";
import { prisma } from "./prisma.js";
import { resetRateLimitBuckets } from "./rate-limit.js";
import { createServer } from "./server.js";

type ApiEnvelope<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: { code: string; message: string; requestId?: string } };

const app = createServer();
let server: Server;
let baseUrl = "";
const originalNodeEnv = process.env.NODE_ENV;
const originalJwtSecret = process.env.JWT_SECRET;
const originalExtensionOrigins = process.env.EXTENSION_ORIGINS;
const originalWebOrigin = process.env.WEB_ORIGIN;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

beforeEach(async () => {
  await resetRateLimitBuckets();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await resetRateLimitBuckets();
  process.env.NODE_ENV = originalNodeEnv;
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
  if (originalExtensionOrigins === undefined) {
    delete process.env.EXTENSION_ORIGINS;
  } else {
    process.env.EXTENSION_ORIGINS = originalExtensionOrigins;
  }
  if (originalWebOrigin === undefined) {
    delete process.env.WEB_ORIGIN;
  } else {
    process.env.WEB_ORIGIN = originalWebOrigin;
  }
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await prisma.$disconnect();
});

describe("auth security controls", () => {
  it("reports an expired browser session without asking users to provide a token", async () => {
    const response = await rawApi("/auth/me");

    expect(response.status).toBe(401);
    expect(response.envelope.error).toMatchObject({
      code: "UNAUTHORIZED",
      message: "登录状态已失效，请重新登录"
    });
    expect(response.envelope.error?.message.toLowerCase()).not.toContain("token");
  });

  it("rate limits repeated failed login attempts by identifier", async () => {
    const body = { identifier: `missing-${unique()}@example.com`, password: "wrong-password" };

    for (let index = 0; index < 10; index += 1) {
      const response = await rawApi("/auth/login", { method: "POST", body });
      expect(response.status).toBe(401);
      expect(response.envelope.error?.code).toBe("INVALID_CREDENTIALS");
    }

    const blocked = await rawApi("/auth/login", { method: "POST", body });
    expect(blocked.status).toBe(429);
    expect(blocked.envelope.error).toMatchObject({
      code: "RATE_LIMITED",
      message: "请求过于频繁，请稍后再试。"
    });
  });

  it("normalizes phone formatting into one login rate-limit bucket", async () => {
    const digits = String(Date.now()).slice(-8);
    const forms = [
      `136${digits}`,
      `+86136${digits}`,
      `+86 136 ${digits.slice(0, 4)} ${digits.slice(4)}`
    ];

    for (let index = 0; index < 10; index += 1) {
      const response = await rawApi("/auth/login", {
        method: "POST",
        body: { identifier: forms[index % forms.length], password: "wrong-password" }
      });
      expect(response.status).toBe(401);
      expect(response.envelope.error?.code).toBe("INVALID_CREDENTIALS");
    }

    const blocked = await rawApi("/auth/login", {
      method: "POST",
      body: { identifier: forms[0], password: "wrong-password" }
    });
    expect(blocked.status).toBe(429);
    expect(blocked.envelope.error?.code).toBe("RATE_LIMITED");
  });

  it("rate limits repeated registrations by IP", async () => {
    for (let index = 0; index < 3; index += 1) {
      const response = await rawApi("/auth/register", {
        method: "POST",
        body: { email: `register-limit-${unique()}-${index}@example.com`, password: "password123" }
      });
      expect(response.status).toBe(201);
    }
    const blocked = await rawApi("/auth/register", {
      method: "POST",
      body: { email: `register-limit-${unique()}-blocked@example.com`, password: "password123" }
    });
    expect(blocked.status).toBe(429);
    expect(blocked.envelope.error?.code).toBe("RATE_LIMITED");
  });

  it("rejects passwords longer than 128 characters before bcrypt hashing", async () => {
    const hashSpy = vi.spyOn(bcrypt, "hash");
    const response = await rawApi("/auth/register", {
      method: "POST",
      body: { email: `long-password-${unique()}@example.com`, password: "x".repeat(129), name: "Long Password" }
    });

    expect(response.status).toBe(400);
    expect(hashSpy).not.toHaveBeenCalled();
  });

  it("uses the same login error code for missing email and wrong password", async () => {
    const email = `login-unified-${unique()}@example.com`;
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash("right-password", 10),
        name: "Unified Login Error"
      }
    });

    const missing = await rawApi("/auth/login", {
      method: "POST",
      body: { identifier: `missing-${unique()}@example.com`, password: "wrong-password" }
    });
    const wrongPassword = await rawApi("/auth/login", {
      method: "POST",
      body: { identifier: email, password: "wrong-password" }
    });

    expect(missing.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(missing.envelope.error?.code).toBe("INVALID_CREDENTIALS");
    expect(wrongPassword.envelope.error?.code).toBe("INVALID_CREDENTIALS");

    expect((await rawApi("/auth/login", { method: "POST", body: { identifier: email, password: "right-password" } })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email }, select: { passwordHash: true } })).passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("registers directly with email or phone and starts with five credits", async () => {
    const email = `cookie-session-${unique()}@example.com`;
    const registered = await rawApi("/auth/register", { method: "POST", body: { email, password: "password123" } });
    const setCookie = registered.headers.get("set-cookie") || "";
    const cookie = setCookie.split(";")[0] || "";
    expect(registered.status).toBe(201);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=3600");
    const me = await rawApi("/auth/me", { cookie });
    expect(me.status).toBe(200);
    expect(me.envelope.success && me.envelope.data).toMatchObject({ email, phone: null, creditBalance: 5 });
    expect(await prisma.pendingRegistration.count({ where: { email } })).toBe(0);

    const csrfToken = me.envelope.success ? (me.envelope.data as { csrfToken: string }).csrfToken : "";
    const logout = await rawApi("/auth/logout", { method: "POST", cookie, csrfToken });
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await rawApi("/auth/me", { cookie })).status).toBe(401);
  });

  it("supports phone-only registration, normalized phone login and protected credit reads", async () => {
    const phone = `139${String(Date.now()).slice(-8)}`;
    const registered = await rawApi("/auth/register", { method: "POST", body: { phone, password: "password123" } });
    expect(registered.status).toBe(201);
    const cookie = (registered.headers.get("set-cookie") || "").split(";")[0] || "";
    const me = await rawApi("/auth/me", { cookie });
    expect(me.envelope.success && me.envelope.data).toMatchObject({ email: null, phone: `+86${phone}`, creditBalance: 5 });
    const csrfToken = me.envelope.success ? (me.envelope.data as { csrfToken: string }).csrfToken : "";
    await rawApi("/auth/logout", { method: "POST", cookie, csrfToken });
    const login = await rawApi("/auth/login", { method: "POST", body: { identifier: phone, password: "password123" } });
    expect(login.status).toBe(200);
    const loginCookie = (login.headers.get("set-cookie") || "").split(";")[0] || "";
    const credits = await rawApi("/credits", { cookie: loginCookie });
    expect(credits.envelope.success && credits.envelope.data).toEqual({ creditBalance: 5 });
    expect((await rawApi("/credits")).status).toBe(401);
  });

  it("registers email and phone together and rejects duplicate phone", async () => {
    const phone = `137${String(Date.now()).slice(-8)}`;
    const email = `both-${unique()}@example.com`;
    const registered = await rawApi("/auth/register", { method: "POST", body: { email, phone, password: "password123" } });
    expect(registered.status).toBe(201);
    const created = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(created).toMatchObject({ email, phone: `+86${phone}`, creditBalance: 5, emailVerifiedAt: null });
    const duplicate = await rawApi("/auth/register", {
      method: "POST",
      body: { email: `other-${unique()}@example.com`, phone, password: "password123" }
    });
    expect(duplicate.envelope.error?.code).toBe("REGISTER_FAILED");
  });

  it("keeps legacy email users at zero credits and allows their login", async () => {
    const email = `legacy-${unique()}@example.com`;
    await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash("legacy-password", 10) } });
    const login = await rawApi("/auth/login", { method: "POST", body: { identifier: email, password: "legacy-password" } });
    expect(login.status).toBe(200);
    expect(login.envelope.success && login.envelope.data).toMatchObject({ user: { email, creditBalance: 0 } });
  });

  it("accepts the legacy email-only login payload", async () => {
    const email = `legacy-payload-${unique()}@example.com`;
    await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash("legacy-password", 10) } });
    const login = await rawApi("/auth/login", { method: "POST", body: { email, password: "legacy-password" } });
    expect(login.status).toBe(200);
    expect(login.envelope.success && login.envelope.data).toMatchObject({ user: { email, creditBalance: 0 } });
  });

  it("validates registration identifiers, password length and duplicates", async () => {
    expect((await rawApi("/auth/register", { method: "POST", body: { email: "", phone: "", password: "password123" } })).status).toBe(400);
    expect((await rawApi("/auth/register", { method: "POST", body: { email: `short-${unique()}@example.com`, password: "1234567" } })).status).toBe(400);
    expect((await rawApi("/auth/register", { method: "POST", body: { phone: "123", password: "password123" } })).status).toBe(400);
    const email = `duplicate-${unique()}@example.com`;
    const first = await rawApi("/auth/register", { method: "POST", body: { email, phone: `138${String(Date.now()).slice(-8)}`, password: "password123" } });
    expect(first.status).toBe(201);
    expect((await rawApi("/auth/register", { method: "POST", body: { email, password: "password123" } })).envelope.error?.code).toBe("REGISTER_FAILED");
  });

  it("rejects forged cross-site writes and accepts only the issued CSRF token", async () => {
    const registered = await registerAndVerify({
      method: "POST",
      body: { email: `csrf-${unique()}@example.com`, password: "password123", name: "CSRF User" }
    });
    const cookie = (registered.headers.get("set-cookie") || "").split(";")[0] || "";
    const csrfToken = registered.envelope.success ? (registered.envelope.data as { csrfToken: string }).csrfToken : "";

    const forged = await rawApi("/workspaces", {
      method: "POST",
      cookie,
      body: { name: "forged" }
    });
    expect(forged.status).toBe(403);
    expect(forged.envelope.error?.code).toBe("CSRF_INVALID");

    const crossSite = await rawApi("/workspaces", {
      method: "POST",
      cookie,
      csrfToken,
      origin: "https://evil.example.com",
      fetchSite: "cross-site",
      body: { name: "cross-site" }
    });
    expect(crossSite.status).toBe(403);
    expect(crossSite.envelope.error?.code).toBe("CSRF_INVALID");

    const accepted = await rawApi("/workspaces", {
      method: "POST",
      cookie,
      csrfToken,
      body: { name: "same-origin" }
    });
    expect(accepted.status).toBe(201);
  });

  it("accepts a configured same-site web origin only with the issued CSRF token", async () => {
    const registered = await registerAndVerify({
      method: "POST",
      body: { email: `csrf-same-site-${unique()}@example.com`, password: "password123", name: "CSRF Same Site" }
    });
    const cookie = (registered.headers.get("set-cookie") || "").split(";")[0] || "";
    const csrfToken = registered.envelope.success ? (registered.envelope.data as { csrfToken: string }).csrfToken : "";

    const response = await rawApi("/workspaces", {
      method: "POST",
      cookie,
      csrfToken,
      origin: "http://localhost:3000",
      fetchSite: "same-site",
      body: { name: "configured-same-site" }
    });

    expect(response.status).toBe(201);
  });

  it("rejects same-site writes from an unconfigured sibling origin", async () => {
    const registered = await registerAndVerify({
      method: "POST",
      body: { email: `csrf-sibling-${unique()}@example.com`, password: "password123", name: "CSRF Sibling" }
    });
    const cookie = (registered.headers.get("set-cookie") || "").split(";")[0] || "";
    const csrfToken = registered.envelope.success ? (registered.envelope.data as { csrfToken: string }).csrfToken : "";

    const response = await rawApi("/workspaces", {
      method: "POST",
      cookie,
      csrfToken,
      origin: "http://attacker.localhost:3000",
      fetchSite: "same-site",
      body: { name: "sibling-origin" }
    });

    expect(response.status).toBe(403);
    expect(response.envelope.error?.code).toBe("CSRF_INVALID");
  });
});

describe("action proposal concurrency controls", () => {
  it("allows only one concurrent approve/reject/observe transition", async () => {
    const fixture = await createActionProposalFixture("PENDING_APPROVAL");

    const results = await Promise.all([
      rawApi(`/action-proposals/${fixture.proposalId}/approve`, { method: "POST", token: fixture.token, body: { comment: "approve" } }),
      rawApi(`/action-proposals/${fixture.proposalId}/reject`, { method: "POST", token: fixture.token, body: { comment: "reject" } }),
      rawApi(`/action-proposals/${fixture.proposalId}/observe`, { method: "POST", token: fixture.token, body: { comment: "observe" } })
    ]);

    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(2);

    const records = await prisma.approvalRecord.findMany({ where: { actionProposalId: fixture.proposalId } });
    const proposal = await prisma.actionProposal.findUniqueOrThrow({ where: { id: fixture.proposalId } });

    expect(records).toHaveLength(1);
    expect(["APPROVED", "REJECTED", "OBSERVING"]).toContain(proposal.status);
  });

  it("allows only one concurrent manual execution marker", async () => {
    const fixture = await createActionProposalFixture("APPROVED");

    const results = await Promise.all([
      rawApi(`/action-proposals/${fixture.proposalId}/mark-manual-executed`, {
        method: "POST",
        token: fixture.token,
        body: { note: "manual execution one" }
      }),
      rawApi(`/action-proposals/${fixture.proposalId}/mark-manual-executed`, {
        method: "POST",
        token: fixture.token,
        body: { note: "manual execution two" }
      })
    ]);

    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(1);

    const executionLogs = await prisma.executionLog.findMany({ where: { actionProposalId: fixture.proposalId } });
    const proposal = await prisma.actionProposal.findUniqueOrThrow({ where: { id: fixture.proposalId } });

    expect(executionLogs).toHaveLength(1);
    expect(proposal.status).toBe("MANUAL_EXECUTED");
  });

  it("sanitizes the custom outcome window before persisting manual review data", async () => {
    const fixture = await createActionProposalFixture("APPROVED");
    await rawApi(`/action-proposals/${fixture.proposalId}/mark-manual-executed`, {
      method: "POST",
      token: fixture.token,
      body: { note: "manual execution" }
    });

    const sensitive = await rawApi(`/action-proposals/${fixture.proposalId}/outcomes`, {
      method: "POST",
      token: fixture.token,
      body: {
        observationWindow: "custom",
        customWindow: "Authorization: Bearer abc",
        result: "UNCLEAR"
      }
    });
    expect(sensitive.status).toBe(400);
    expect(sensitive.envelope.error?.code).toBe("SENSITIVE_DATA_FORBIDDEN");

    const clean = await rawApi(`/action-proposals/${fixture.proposalId}/outcomes`, {
      method: "POST",
      token: fixture.token,
      body: {
        observationWindow: "custom",
        customWindow: "最近 7 天",
        result: "UNCLEAR"
      }
    });
    expect(clean.status).toBe(201);

    const outcomes = await prisma.actionOutcome.findMany({ where: { actionProposalId: fixture.proposalId } });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.customWindow).toBe("最近 7 天");
  });
});

describe.sequential("production error hardening", () => {
  it("does not expose internal error details in production and returns a requestId", async () => {
    await withIsolatedServer({ nodeEnv: "production" }, async (url) => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.spyOn(prisma.user, "findFirst").mockRejectedValueOnce(
        new Error("Prisma schema SQL C:\\internal\\path stack password=abc token=def")
      );

      const response = await rawApi("/auth/login", {
        base: url,
        method: "POST",
        body: { identifier: `prod-error-${unique()}@example.com`, password: "password123" },
        requestId: "prod-error-request"
      });
      const serialized = JSON.stringify(response.envelope);

      expect(response.status).toBe(500);
      expect(response.headers.get("x-request-id")).toBe("prod-error-request");
      expect(response.envelope.error).toMatchObject({
        code: "INTERNAL_ERROR",
        message: "服务暂时不可用，请稍后再试。",
        requestId: "prod-error-request"
      });
      expect(serialized).not.toMatch(/Prisma|schema|SQL|password|token|stack/i);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  it("keeps debug messages outside production while redacting sensitive fields", async () => {
    await withIsolatedServer({ nodeEnv: "development" }, async (url) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.spyOn(prisma.user, "findFirst").mockRejectedValueOnce(new Error("Prisma debug detail token=abc password=def"));

      const response = await rawApi("/auth/login", {
        base: url,
        method: "POST",
        body: { identifier: `dev-error-${unique()}@example.com`, password: "password123" }
      });

      expect(response.status).toBe(500);
      expect(response.envelope.error?.message).toContain("Prisma debug detail");
      expect(response.envelope.error?.message).toContain("token=[REDACTED]");
      expect(response.envelope.error?.message).toContain("password=[REDACTED]");
      expect(response.envelope.error?.message).not.toContain("abc");
      expect(response.envelope.error?.message).not.toContain("def");
    });
  });

  it("keeps known business errors on their original status codes", async () => {
    await withIsolatedServer({ nodeEnv: "production" }, async (url) => {
      const response = await rawApi("/auth/me", { base: url });

      expect(response.status).toBe(401);
      expect(response.envelope.error?.code).toBe("UNAUTHORIZED");
    });
  });

  it("allows only configured Chrome extension origins", async () => {
    await withIsolatedServer(
      { nodeEnv: "production", extensionOrigins: "chrome-extension://approved-extension-id" },
      async (url) => {
        const allowed = await fetch(`${url}/health`, { headers: { origin: "chrome-extension://approved-extension-id" } });
        const denied = await fetch(`${url}/health`, { headers: { origin: "chrome-extension://untrusted-extension-id" } });

        expect(allowed.headers.get("access-control-allow-origin")).toBe("chrome-extension://approved-extension-id");
        expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
        expect(denied.headers.get("access-control-allow-origin")).toBeNull();
      }
    );
  });

  it("allows only exact configured web origins in production", async () => {
    await withIsolatedServer(
      { nodeEnv: "production", webOrigin: "https://console.example.com" },
      async (url) => {
        const allowed = await fetch(`${url}/health`, { headers: { origin: "https://console.example.com" } });
        const denied = await fetch(`${url}/health`, { headers: { origin: "https://console.example.com.evil" } });

        expect(allowed.headers.get("access-control-allow-origin")).toBe("https://console.example.com");
        expect(denied.headers.get("access-control-allow-origin")).toBeNull();
      }
    );
  });

  it("sets API security headers without overriding the Web CSP", async () => {
    await withIsolatedServer({ nodeEnv: "production", webOrigin: "https://console.example.com" }, async (url) => {
      const response = await fetch(`${url}/health`);

      expect(response.headers.get("x-powered-by")).toBeNull();
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
      expect(response.headers.get("strict-transport-security")).toContain("max-age=");
    });
  });

  it("refuses localhost origins in production configuration", () => {
    process.env.NODE_ENV = "production";
    process.env.WEB_ORIGIN = "http://localhost:3000";
    process.env.JWT_SECRET = "strong-jwt-secret-for-isolated-server-tests-12345";

    expect(() => createServer()).toThrow("WEB_ORIGIN must not contain localhost or loopback origins in production");
  });
});

async function rawApi(
  path: string,
  options: { base?: string; method?: string; token?: string; cookie?: string; csrfToken?: string; origin?: string; fetchSite?: string; body?: unknown; requestId?: string } = {}
): Promise<{ status: number; envelope: ApiEnvelope<unknown>; headers: Headers }> {
  const session = options.token?.startsWith("test-session:") ? decodeTestSession(options.token) : null;
  const response = await fetch(`${options.base || baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(options.token && !session ? { authorization: `Bearer ${options.token}` } : {}),
      ...(session ? { cookie: session.cookie, origin: "http://localhost:3000", "sec-fetch-site": "same-origin", "x-csrf-token": session.csrfToken } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.csrfToken ? { origin: options.origin || "http://localhost:3000", "sec-fetch-site": options.fetchSite || "same-origin", "x-csrf-token": options.csrfToken } : {}),
      ...(options.requestId ? { "x-request-id": options.requestId } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  return {
    status: response.status,
    envelope: (await response.json()) as ApiEnvelope<unknown>,
    headers: response.headers
  };
}

async function registerAndVerify(options: { method: "POST"; body: { email: string; password: string; name: string } }) {
  const registered = await rawApi("/auth/register", options);
  if (registered.status !== 201) throw new Error("Expected registration to create a session");
  return registered;
}

async function createActionProposalFixture(status: "PENDING_APPROVAL" | "APPROVED") {
  const email = `proposal-${unique()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: "not-used-in-this-test",
      name: "Proposal User",
      workspaces: { create: { name: "Proposal Workspace" } }
    },
    include: { workspaces: true }
  });
  const workspaceId = user.workspaces[0]?.id;
  if (!workspaceId) throw new Error("Expected workspace to be created");

  const account = await prisma.accountProfile.create({
    data: {
      workspaceId,
      identityKey: `id:security-${unique()}`,
      accountName: "Security proposal account",
      normalizedName: "securityproposalaccount",
      platformAccountId: `security-${unique()}`,
      identityStatus: "VERIFIED"
    }
  });

  const project = await prisma.project.create({
    data: {
      workspaceId,
      accountProfileId: account.id,
      name: "Security proposal project",
      businessType: "DOUYIN_LOCAL_LIFE",
      subjectType: "SERVICE_PROVIDER",
      operatorType: "SERVICE_PROVIDER_LIVE",
      cooperationType: "SERVICE_PROVIDER_CONTRACT",
      controlLevel: "MEDIUM",
      subjectConfidence: 0.9
    }
  });
  const task = await prisma.collectionTask.create({
    data: {
      projectId: project.id,
      userId: user.id,
      status: "UPLOADED"
    }
  });
  const decisionRun = await prisma.decisionRun.create({
    data: {
      projectId: project.id,
      collectionTaskId: task.id,
      engineVersion: "security-test",
      ruleVersion: "security-test",
      strategyVersion: "security-test",
      inputJson: {},
      ruleResultJson: {},
      finalResultJson: {},
      riskLevel: "MEDIUM",
      confidence: 0.8,
      diagnosis: "Security transition test"
    }
  });
  const proposal = await prisma.actionProposal.create({
    data: {
      decisionRunId: decisionRun.id,
      projectId: project.id,
      collectionTaskId: task.id,
      actionType: "CHECK_LIVE_ROOM",
      title: "Security transition proposal",
      reason: "Test transition safety",
      riskLevel: "MEDIUM",
      confidence: 0.8,
      requiresApproval: true,
      status,
      approvedAt: status === "APPROVED" ? new Date() : null
    }
  });

  const session = await createUserSession(user.id);
  return {
    proposalId: proposal.id,
    token: encodeTestSession(`pxxis_session=${session.token}`, session.csrfToken)
  };
}

function encodeTestSession(cookie: string, csrfToken: string) {
  return `test-session:${Buffer.from(JSON.stringify({ cookie, csrfToken })).toString("base64url")}`;
}

function decodeTestSession(value: string) {
  return JSON.parse(Buffer.from(value.slice("test-session:".length), "base64url").toString("utf8")) as { cookie: string; csrfToken: string };
}

async function withIsolatedServer(
  env: { nodeEnv: "production" | "development"; extensionOrigins?: string; webOrigin?: string },
  callback: (url: string) => Promise<void>
) {
  process.env.NODE_ENV = env.nodeEnv;
  process.env.JWT_SECRET = "strong-jwt-secret-for-isolated-server-tests-12345";
  process.env.WEB_ORIGIN = env.webOrigin || "https://www.pxxis.cn";
  if (env.extensionOrigins) process.env.EXTENSION_ORIGINS = env.extensionOrigins;
  await resetRateLimitBuckets();
  const isolatedApp = createServer();
  let isolatedServer: Server | undefined;
  let isolatedBaseUrl = "";
  await new Promise<void>((resolve) => {
    isolatedServer = isolatedApp.listen(0, "127.0.0.1", () => {
      const address = isolatedServer?.address();
      if (address && typeof address === "object") isolatedBaseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
  try {
    await callback(isolatedBaseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => isolatedServer?.close((error) => (error ? reject(error) : resolve())));
  }
}

function unique() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
