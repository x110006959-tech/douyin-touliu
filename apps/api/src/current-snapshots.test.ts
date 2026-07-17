import { describe, expect, it } from "vitest";
import { selectLatestSnapshotsByRoute } from "./current-snapshots.js";

describe("selectLatestSnapshotsByRoute", () => {
  it("locks to the latest run and keeps the newest local evidence per route", () => {
    const selected = selectLatestSnapshotsByRoute([
      { id: "old-run", collectionRunId: "run-1", routeKey: "LIVE_DATA_SCREEN", localCollectedAt: new Date("2026-07-15T12:00:00Z"), createdAt: new Date("2026-07-15T12:00:01Z") },
      { id: "new-local", collectionRunId: "run-2", routeKey: "LIVE_DATA_SCREEN", localCollectedAt: new Date("2026-07-15T12:05:00Z"), createdAt: new Date("2026-07-15T12:05:01Z") },
      { id: "late-old", collectionRunId: "run-2", routeKey: "LIVE_DATA_SCREEN", localCollectedAt: new Date("2026-07-15T12:04:00Z"), createdAt: new Date("2026-07-15T12:06:00Z") },
      { id: "task-table", collectionRunId: "run-2", routeKey: "TASK_TABLE", localCollectedAt: new Date("2026-07-15T12:03:00Z"), createdAt: new Date("2026-07-15T12:03:01Z") }
    ], "run-2");

    expect(selected.map((snapshot) => snapshot.id)).toEqual(["new-local", "task-table"]);
  });

  it("uses created time and id as deterministic tie breakers", () => {
    const time = new Date("2026-07-15T12:00:00Z");
    const selected = selectLatestSnapshotsByRoute([
      { id: "a", routeKey: "TASK_TABLE", localCollectedAt: time, createdAt: time },
      { id: "b", routeKey: "TASK_TABLE", localCollectedAt: time, createdAt: time }
    ]);
    expect(selected[0]?.id).toBe("b");
  });
});
