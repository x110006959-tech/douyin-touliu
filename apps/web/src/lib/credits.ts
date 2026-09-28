import { apiFetch } from "./api";
import type { LatestRequestGuard } from "./latest-request";

export async function fetchLatestCreditBalance(token: string, guard: LatestRequestGuard) {
  const refreshVersion = guard.begin();
  try {
    const credits = await apiFetch<{ creditBalance: number }>("/credits", token);
    if (!guard.isCurrent(refreshVersion)) return null;
    return credits.creditBalance;
  } catch {
    // Credit reads are best-effort. Never let a balance refresh failure make
    // a successful diagnosis creation look like a failed request.
    return null;
  }
}
