import { describe, expect, it } from "vitest";
import {
  localPromotionPulseCadenceMs,
  localPromotionRateLimitCooldownRemaining,
  livePulseUploadSafetyIntervalMs,
  nextLivePulseAfter,
  nextLivePulseAfterRateLimit,
  nextLivePulseAt
} from "./live-pulse-schedule";

describe("live pulse schedule", () => {
  it("aligns ongoing key-index refreshes to fixed thirty-second boundaries", () => {
    expect(nextLivePulseAt(12_001)).toBe(30_000);
    expect(nextLivePulseAt(30_000)).toBe(30_000);
    expect(nextLivePulseAt(59_999)).toBe(60_000);
  });

  it("preserves a thirty-second interval between pulse starts", () => {
    expect(nextLivePulseAfter(15_000)).toBe(45_000);
    expect(nextLivePulseAfter(20_001)).toBe(50_001);
  });

  it("waits for the upload receive-time safety interval after a slow platform request", () => {
    expect(nextLivePulseAfter(20_000, 55_000)).toBe(55_000 + livePulseUploadSafetyIntervalMs);
  });

  it("uses the server Retry-After delay without aligning to another wall-clock boundary", () => {
    expect(nextLivePulseAfterRateLimit(20_001, 3_000)).toBe(23_001);
  });

  it("uses a conservative cadence and a manual-restart cooldown for local promotion", () => {
    expect(nextLivePulseAfter(20_000, 20_100, localPromotionPulseCadenceMs)).toBe(50_000);
    expect(localPromotionRateLimitCooldownRemaining(20_000, 79_999)).toBe(1);
    expect(localPromotionRateLimitCooldownRemaining(20_000, 80_000)).toBe(0);
  });
});
