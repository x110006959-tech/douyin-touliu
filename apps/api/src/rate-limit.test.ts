import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import {
  checkLoginRateLimit,
  checkMetricPulseRateLimit,
  metricPulseRateLimitWindowMs,
  resetRateLimitBuckets
} from "./rate-limit.js";

beforeEach(async () => {
  await resetRateLimitBuckets();
});

afterAll(async () => {
  await resetRateLimitBuckets();
  await prisma.$disconnect();
});

describe("metric pulse rate limit", () => {
  it("allows the next scheduled five-second pulse despite receive-time jitter", async () => {
    const subject = { credentialOrSessionId: "extension-credential", taskId: "task-1", routeKey: "LIVE_DATA_SCREEN" };
    const firstReceivedAt = new Date("2026-08-12T13:00:00.900Z");
    const nextScheduledPulse = new Date(firstReceivedAt.getTime() + 4_100);

    expect(metricPulseRateLimitWindowMs).toBeLessThan(5_000);
    await expect(checkMetricPulseRateLimit(subject, firstReceivedAt)).resolves.toEqual({ allowed: true });
    await expect(checkMetricPulseRateLimit(subject, nextScheduledPulse)).resolves.toEqual({ allowed: true });
  });

  it("still rejects duplicate uploads inside the scheduling margin", async () => {
    const subject = { credentialOrSessionId: "extension-credential", taskId: "task-2", routeKey: "LIVE_DATA_SCREEN" };
    const firstReceivedAt = new Date("2026-08-12T13:00:00.000Z");

    await expect(checkMetricPulseRateLimit(subject, firstReceivedAt)).resolves.toEqual({ allowed: true });
    await expect(checkMetricPulseRateLimit(
      subject,
      new Date(firstReceivedAt.getTime() + metricPulseRateLimitWindowMs - 1)
    )).resolves.toMatchObject({ allowed: false });
  });

  it("keeps live and local-promotion pulse budgets independent", async () => {
    const now = new Date("2026-08-12T13:00:00.000Z");
    const base = { credentialOrSessionId: "extension-credential", taskId: "task-routes" };

    await expect(checkMetricPulseRateLimit({ ...base, routeKey: "LIVE_DATA_SCREEN" }, now)).resolves.toEqual({ allowed: true });
    await expect(checkMetricPulseRateLimit({ ...base, routeKey: "LOCAL_PROMOTION_DASHBOARD" }, now)).resolves.toEqual({ allowed: true });
  });
});

describe("login identifier rate limit", () => {
  it("normalizes phone formatting into the same login identifier bucket", async () => {
    const digits = String(Date.now()).slice(-8);
    const forms = [
      `136${digits}`,
      `+86136${digits}`,
      `+86 136 ${digits.slice(0, 4)} ${digits.slice(4)}`
    ];

    for (let index = 0; index < 10; index += 1) {
      await expect(checkLoginRateLimit({
        ip: "login-phone-normalization",
        identifier: forms[index % forms.length]
      })).resolves.toEqual({ allowed: true });
    }

    await expect(checkLoginRateLimit({
      ip: "login-phone-normalization",
      identifier: forms[0]
    })).resolves.toMatchObject({ allowed: false });
  });
});
