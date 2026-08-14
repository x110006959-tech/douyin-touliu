import { describe, expect, it } from "vitest";
import {
  livePulseUploadSafetyIntervalMs,
  nextLivePulseAfter,
  nextLivePulseAfterRateLimit,
  nextLivePulseAt
} from "./live-pulse-schedule";

describe("live pulse schedule", () => {
  it("aligns ongoing key-index refreshes to fixed five-second boundaries", () => {
    expect(nextLivePulseAt(12_001)).toBe(15_000);
    expect(nextLivePulseAt(15_000)).toBe(15_000);
    expect(nextLivePulseAt(19_999)).toBe(20_000);
  });

  it("preserves a five-second interval between pulse starts", () => {
    expect(nextLivePulseAfter(15_000)).toBe(20_000);
    expect(nextLivePulseAfter(20_001)).toBe(25_001);
  });

  it("waits for the upload receive-time safety interval after a slow platform request", () => {
    expect(nextLivePulseAfter(20_000, 23_000)).toBe(23_000 + livePulseUploadSafetyIntervalMs);
  });

  it("uses the server Retry-After delay without aligning to another wall-clock boundary", () => {
    expect(nextLivePulseAfterRateLimit(20_001, 3_000)).toBe(23_001);
  });
});
