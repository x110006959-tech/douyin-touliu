import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { recordSecurityMetrics } from "./security-metrics.js";

const windowStartedAt = new Date("2026-07-18T02:00:00.000Z");

afterEach(async () => {
  await prisma.securityMetric.deleteMany({
    where: { metricKey: { in: ["csrf_rejections", "snapshot_payload_bytes"] }, windowStartedAt }
  });
});

describe("security metrics", () => {
  it("aggregates counts and values by metric key and UTC hour without request context", async () => {
    await recordSecurityMetrics([
      { key: "csrf_rejections" },
      { key: "csrf_rejections" },
      { key: "snapshot_payload_bytes", value: 1_024 },
      { key: "snapshot_payload_bytes", value: 2_048 }
    ], windowStartedAt);

    await expect(prisma.securityMetric.findUniqueOrThrow({
      where: { metricKey_windowStartedAt: { metricKey: "csrf_rejections", windowStartedAt } }
    })).resolves.toMatchObject({ occurrenceCount: 2, valueTotal: 2n, lastValue: 1n });
    await expect(prisma.securityMetric.findUniqueOrThrow({
      where: { metricKey_windowStartedAt: { metricKey: "snapshot_payload_bytes", windowStartedAt } }
    })).resolves.toMatchObject({ occurrenceCount: 2, valueTotal: 3_072n, lastValue: 2_048n });
  });
});
