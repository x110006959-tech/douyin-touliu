import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import {
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
    const subject = { credentialOrSessionId: "extension-credential", taskId: "task-1" };
    const firstReceivedAt = new Date("2026-08-12T13:00:00.900Z");
    const nextScheduledPulse = new Date(firstReceivedAt.getTime() + 4_100);

    expect(metricPulseRateLimitWindowMs).toBeLessThan(5_000);
    await expect(checkMetricPulseRateLimit(subject, firstReceivedAt)).resolves.toEqual({ allowed: true });
    await expect(checkMetricPulseRateLimit(subject, nextScheduledPulse)).resolves.toEqual({ allowed: true });
  });

  it("still rejects duplicate uploads inside the scheduling margin", async () => {
    const subject = { credentialOrSessionId: "extension-credential", taskId: "task-2" };
    const firstReceivedAt = new Date("2026-08-12T13:00:00.000Z");

    await expect(checkMetricPulseRateLimit(subject, firstReceivedAt)).resolves.toEqual({ allowed: true });
    await expect(checkMetricPulseRateLimit(
      subject,
      new Date(firstReceivedAt.getTime() + metricPulseRateLimitWindowMs - 1)
    )).resolves.toMatchObject({ allowed: false });
  });
});
