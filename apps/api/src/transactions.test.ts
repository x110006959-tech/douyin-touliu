import { describe, expect, it } from "vitest";
import { isSerializableConflict } from "./transactions.js";

describe("serializable transactions", () => {
  it("only retries Prisma serialization conflicts", () => {
    expect(isSerializableConflict({ code: "P2034" })).toBe(true);
    expect(isSerializableConflict({ code: "P2003" })).toBe(false);
    expect(isSerializableConflict(new Error("P2034"))).toBe(false);
  });
});
