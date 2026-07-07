import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createServer } from "./server.js";
import { prisma } from "./prisma.js";

type ApiEnvelope<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: { code: string; message: string } };

const app = createServer();
let server: Server;
let baseUrl = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await prisma.$disconnect();
});

describe("V0.1 API smoke flow", () => {
  it("keeps the full decision, approval, manual execution, and audit trail loop", async () => {
    const email = `v01-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
    const password = "password123";

    const registered = await api<{ token: string; user: { workspaceId: string } }>("/auth/register", null, {
      method: "POST",
      body: { email, password, name: "V0.1 Smoke" }
    });
    expect(registered.user.workspaceId).toBeTruthy();

    const loggedIn = await api<{ token: string; user: { workspaceId: string } }>("/auth/login", null, {
      method: "POST",
      body: { email, password }
    });
    const token = loggedIn.token || registered.token;
    expect(token).toBeTruthy();

    const workspace = await api<{ id: string; name: string }>("/workspaces", token, {
      method: "POST",
      body: { name: "V0.1 Acceptance Workspace" }
    });
    expect(workspace.id).toBeTruthy();

    const project = await api<{ id: string; subjectType: string; operatorType: string; cooperationType: string; controlLevel: string }>("/projects", token, {
      method: "POST",
      body: {
        workspaceId: workspace.id,
        name: "V0.1 service provider project",
        businessType: "DOUYIN_LOCAL_LIFE",
        subjectType: "SERVICE_PROVIDER",
        operatorType: "SERVICE_PROVIDER_LIVE",
        cooperationType: "SERVICE_PROVIDER_CONTRACT",
        controlLevel: "MEDIUM",
        subjectConfidence: 0.92,
        serviceProviderName: "V0.1 test service provider",
        serviceMode: "managed live operation",
        serviceFee: 200
      }
    });
    expect(project).toMatchObject({
      subjectType: "SERVICE_PROVIDER",
      operatorType: "SERVICE_PROVIDER_LIVE",
      cooperationType: "SERVICE_PROVIDER_CONTRACT",
      controlLevel: "MEDIUM"
    });

    const task = await api<{ id: string; projectId: string }>("/collection-tasks", token, {
      method: "POST",
      body: {
        projectId: project.id,
        sourceUrl: "https://life.douyin.com/live-dashboard",
        pageTitle: "V0.1 live dashboard smoke"
      }
    });
    expect(task.projectId).toBe(project.id);

    const snapshot = await api<{ id: string; normalizedMetrics: Array<{ metricKey: string }> }>(`/collection-tasks/${task.id}/snapshots`, token, {
      method: "POST",
      body: {
        pageType: "LIVE_DATA_SCREEN",
        sourceUrl: "https://life.douyin.com/live-dashboard",
        pageTitle: "V0.1 live dashboard smoke",
        rawDomText: "service provider live dashboard spend 1200 orders 0 impressions 50000 ctr 0.5% GPM 80",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [
          metric("verify_roi", "verify ROI", 0.8),
          metric("spend", "spend", 1200),
          metric("orders", "orders", 0),
          metric("impressions", "impressions", 50000),
          metric("ctr", "CTR", 0.005, "%"),
          metric("gpm", "GPM", 80),
          metric("clicks", "clicks", 900),
          metric("live_viewers", "live viewers", 8000),
          metric("daily_budget", "daily budget", 1500),
          metric("cpa", "CPA", 200),
          metric("target_cpa", "target CPA", 80),
          metric("target_roi", "target ROI", 1.4)
        ],
        screenshotUrl: null,
        localCollectedAt: new Date().toISOString()
      }
    });
    expect(snapshot.id).toBeTruthy();
    expect(snapshot.normalizedMetrics.length).toBeGreaterThan(0);

    const metrics = await api<Array<{ metricKey: string }>>(`/collection-tasks/${task.id}/metrics`, token);
    expect(metrics.length).toBeGreaterThan(0);

    const decisionRun = await api<{ id: string; actionProposals: Array<{ id: string; status: string; requiresApproval: boolean }> }>(
      `/collection-tasks/${task.id}/decision-runs`,
      token,
      { method: "POST", body: {} }
    );
    expect(decisionRun.id).toBeTruthy();
    expect(decisionRun.actionProposals.length).toBeGreaterThanOrEqual(3);
    expect(decisionRun.actionProposals.every((proposal) => proposal.requiresApproval)).toBe(true);

    const latest = await api<{ id: string; actionProposals: Array<{ id: string }> }>(`/collection-tasks/${task.id}/decision-runs/latest`, token);
    expect(latest.id).toBe(decisionRun.id);

    const projectProposals = await api<Array<{ id: string; status: string }>>(`/projects/${project.id}/action-proposals`, token);
    expect(projectProposals.length).toBeGreaterThanOrEqual(3);

    const [approveTarget, observeTarget, rejectTarget] = projectProposals;
    if (!approveTarget || !observeTarget || !rejectTarget) throw new Error("Expected at least three action proposals");

    const initialDetail = await api<{ id: string; decisionRun: unknown; approvalRecords: unknown[]; executionLogs: unknown[] }>(
      `/action-proposals/${approveTarget.id}`,
      token
    );
    expect(initialDetail.id).toBe(approveTarget.id);
    expect(initialDetail.decisionRun).toBeTruthy();

    const approved = await api<{ id: string; status: string; approvalRecords: unknown[] }>(`/action-proposals/${approveTarget.id}/approve`, token, {
      method: "POST",
      body: { comment: "Approved for manual handling only." }
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvalRecords.length).toBeGreaterThan(0);

    const observed = await api<{ status: string; approvalRecords: unknown[] }>(`/action-proposals/${observeTarget.id}/observe`, token, {
      method: "POST",
      body: { comment: "Keep observing before any manual change." }
    });
    expect(observed.status).toBe("OBSERVING");
    expect(observed.approvalRecords.length).toBeGreaterThan(0);

    const rejected = await api<{ status: string; approvalRecords: unknown[] }>(`/action-proposals/${rejectTarget.id}/reject`, token, {
      method: "POST",
      body: { comment: "Rejected during smoke verification." }
    });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.approvalRecords.length).toBeGreaterThan(0);

    const executed = await api<{ status: string; executionLogs: unknown[] }>(
      `/action-proposals/${approveTarget.id}/mark-manual-executed`,
      token,
      {
        method: "POST",
        body: { note: "User confirmed the action was completed manually outside the system. The system did not operate any platform page." }
      }
    );
    expect(executed.status).toBe("MANUAL_EXECUTED");
    expect(executed.executionLogs.length).toBeGreaterThan(0);

    const detail = await api<{ decisionRun: unknown; approvalRecords: unknown[]; executionLogs: unknown[] }>(
      `/action-proposals/${approveTarget.id}`,
      token
    );
    expect(detail.decisionRun).toBeTruthy();
    expect(detail.approvalRecords.length).toBeGreaterThan(0);
    expect(detail.executionLogs.length).toBeGreaterThan(0);

    const auditLogs = await api<Array<{ action: string }>>(`/projects/${project.id}/audit-logs`, token);
    expect(auditLogs.some((log) => log.action === "CREATE_DECISION_RUN")).toBe(true);
    expect(auditLogs.some((log) => log.action === "CREATE_ACTION_PROPOSALS")).toBe(true);
    expect(auditLogs.some((log) => log.action === "APPROVE_ACTION_PROPOSAL")).toBe(true);
    expect(auditLogs.some((log) => log.action === "OBSERVE_ACTION_PROPOSAL")).toBe(true);
    expect(auditLogs.some((log) => log.action === "REJECT_ACTION_PROPOSAL")).toBe(true);
    expect(auditLogs.some((log) => log.action === "MARK_ACTION_MANUAL_EXECUTED")).toBe(true);
  });
});

function metric(key: string, name: string, value: number | string | null, unit?: string) {
  return { key, name, value, unit: unit || null, source: "manual" };
}

async function api<T>(path: string, token: string | null, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!envelope.success) {
    expect(envelope).toMatchObject({
      success: false,
      data: null,
      error: { code: expect.any(String), message: expect.any(String) }
    });
    throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
  }
  expect(envelope).toMatchObject({ success: true, error: null });
  expect(envelope.data).toBeDefined();
  return envelope.data;
}
