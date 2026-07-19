import { describe, expect, it } from "vitest";
import { evaluateCollectionRouteDiagnostic } from "./collection-diagnostics";
import { collectionFreshnessPolicy } from "./collection-routes";

const now = Date.parse("2026-07-19T10:00:00.000Z");

describe("collection route diagnostics", () => {
  it("distinguishes fresh, aging and stale snapshots at the existing thresholds", () => {
    const base = {
      routeKey: "TASK_TABLE",
      required: true,
      snapshot: {
        accountMatchStatus: "MATCHED",
        routeVerificationStatus: "VERIFIED",
        captureMeta: { completeness: "COMPLETE", coverageRatio: 1 }
      }
    } as const;

    expect(evaluateCollectionRouteDiagnostic({
      ...base,
      snapshot: { ...base.snapshot, localCollectedAt: new Date(now - 60_000) }
    }, now).summaryStatus).toBe("UPLOADED");
    expect(evaluateCollectionRouteDiagnostic({
      ...base,
      snapshot: { ...base.snapshot, localCollectedAt: new Date(now - collectionFreshnessPolicy.agingAfterMs) }
    }, now).summaryStatus).toBe("AGING");
    expect(evaluateCollectionRouteDiagnostic({
      ...base,
      snapshot: { ...base.snapshot, localCollectedAt: new Date(now - collectionFreshnessPolicy.staleAfterMs) }
    }, now).summaryStatus).toBe("STALE");
  });

  it("marks three failures and stalled required routes without losing the missing-snapshot block", () => {
    const diagnostic = evaluateCollectionRouteDiagnostic({
      routeKey: "LIVE_DATA_SCREEN",
      required: true,
      runActive: true,
      runStartedAt: new Date(now - collectionFreshnessPolicy.staleAfterMs),
      heartbeat: {
        consecutiveFailures: 3,
        lastAttemptAt: new Date(now - collectionFreshnessPolicy.staleAfterMs),
        lastErrorCode: "UPLOAD_NETWORK_ERROR"
      }
    }, now);

    expect(diagnostic.summaryStatus).toBe("FAILED");
    expect(diagnostic.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "NO_SNAPSHOT",
      "COLLECTOR_STALLED",
      "CONSECUTIVE_FAILURES",
      "UPLOAD_FAILED"
    ]));
    expect(diagnostic.blocksFormalDecision).toBe(true);
    expect(diagnostic.blocksStrongActions).toBe(true);
  });

  it("keeps partial coverage advisory-only while reporting missing fields and truncation", () => {
    const diagnostic = evaluateCollectionRouteDiagnostic({
      routeKey: "TASK_TABLE",
      required: true,
      snapshot: {
        localCollectedAt: new Date(now - 60_000),
        accountMatchStatus: "MATCHED",
        routeVerificationStatus: "VERIFIED",
        captureMeta: {
          completeness: "PARTIAL",
          coverageRatio: 0.5,
          expectedFields: ["spend", "orders"],
          extractedFields: ["spend"],
          truncationReasons: ["ROW_LIMIT"]
        }
      }
    }, now);

    expect(diagnostic.summaryStatus).toBe("PARTIAL");
    expect(diagnostic.missingFields).toEqual(["orders"]);
    expect(diagnostic.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "PARTIAL_CAPTURE",
      "LOW_FIELD_COVERAGE",
      "CAPTURE_TRUNCATED"
    ]));
    expect(diagnostic.blocksFormalDecision).toBe(false);
    expect(diagnostic.blocksStrongActions).toBe(false);
  });
});
