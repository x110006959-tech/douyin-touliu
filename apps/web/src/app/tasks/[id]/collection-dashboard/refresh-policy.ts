export type CollectionDashboardRefreshMode = "REFRESH" | "CHECK_ONLY" | "IDLE";
export type CollectionDashboardCalibrationState = "EMPTY" | "PENDING" | "COMPLETE";

export function collectionDashboardRefreshMode(
  runStatus: "ACTIVE" | "COMPLETED" | "STOPPED" | "DEGRADED" | null | undefined,
  hasUnsavedEdits: boolean
): CollectionDashboardRefreshMode {
  if (runStatus !== "ACTIVE" && runStatus !== "DEGRADED") return "IDLE";
  return hasUnsavedEdits ? "CHECK_ONLY" : "REFRESH";
}

export function collectionDashboardCalibrationState(
  snapshotCount: number,
  pendingReviewCount: number
): CollectionDashboardCalibrationState {
  if (snapshotCount === 0) return "EMPTY";
  return pendingReviewCount > 0 ? "PENDING" : "COMPLETE";
}
