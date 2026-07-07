export const queueNames = {
  aiAnalysis: "ai-analysis",
  snapshotNormalize: "snapshot-normalize"
} as const;

export function redisUrl() {
  return process.env.REDIS_URL || "redis://localhost:6379";
}

// BullMQ is reserved for the next MVP slice. The first slice runs analysis inline,
// but API and docker-compose already expose the same Redis/BullMQ boundary.
export function queuedProcessingEnabled() {
  return process.env.ENABLE_BULLMQ === "true";
}
