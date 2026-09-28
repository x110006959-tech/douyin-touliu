import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { fetchLatestCreditBalance } from "./credits";
import { createLatestRequestGuard } from "./latest-request";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("fetchLatestCreditBalance", () => {
  it("returns the current balance from a successful credit read", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ creditBalance: 5 });

    await expect(fetchLatestCreditBalance("token", createLatestRequestGuard())).resolves.toBe(5);
    expect(apiFetch).toHaveBeenCalledWith("/credits", "token");
  });

  it("returns null when the request is no longer current", async () => {
    let resolveCredits: (value: { creditBalance: number }) => void = () => undefined;
    vi.mocked(apiFetch).mockReturnValue(new Promise((resolve) => {
      resolveCredits = resolve;
    }));
    const guard = createLatestRequestGuard();

    const pending = fetchLatestCreditBalance("token", guard);
    guard.invalidate();
    resolveCredits({ creditBalance: 5 });

    await expect(pending).resolves.toBeNull();
  });

  it("returns null instead of propagating a credit read error", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("credit read failed"));

    await expect(fetchLatestCreditBalance("token", createLatestRequestGuard())).resolves.toBeNull();
  });
});
