import { describe, expect, it } from "vitest";
import { readIdempotencyKey } from "./idempotency.js";

describe("idempotency key validation", () => {
  it("accepts a bounded safe key", () => {
    const result = readIdempotencyKey({ header: () => "snapshot:task-1:abc_123" } as never);
    expect(result).toEqual({ key: "snapshot:task-1:abc_123", error: null });
  });

  it("rejects control characters and oversized keys", () => {
    expect(readIdempotencyKey({ header: () => "bad key\n" } as never).error).toBeTruthy();
    expect(readIdempotencyKey({ header: () => "x".repeat(129) } as never).error).toBeTruthy();
  });
});
