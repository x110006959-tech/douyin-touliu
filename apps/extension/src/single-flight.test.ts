import { describe, expect, it, vi } from "vitest";
import { createKeyedSingleFlight } from "./single-flight";

describe("keyed single flight", () => {
  it("shares the same promise for duplicate keys and releases it after success", async () => {
    const singleFlight = createKeyedSingleFlight();
    const operation = vi.fn(async () => "ok");
    const first = singleFlight.run("task:tab:route:run", operation);
    const second = singleFlight.run("task:tab:route:run", operation);

    await expect(Promise.all([first, second])).resolves.toEqual(["ok", "ok"]);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(singleFlight.size()).toBe(0);

    await singleFlight.run("task:tab:route:run", operation);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("keeps different keys independent and releases failed operations", async () => {
    const singleFlight = createKeyedSingleFlight();
    const failed = vi.fn(async () => {
      throw new Error("failed");
    });
    const ok = vi.fn(async () => "ok");

    await expect(Promise.allSettled([
      singleFlight.run("task-a", failed),
      singleFlight.run("task-b", ok)
    ])).resolves.toMatchObject([
      { status: "rejected" },
      { status: "fulfilled", value: "ok" }
    ]);
    expect(singleFlight.size()).toBe(0);
  });
});
