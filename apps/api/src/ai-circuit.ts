import { prisma } from "./prisma.js";
import { readSafeOptionalText } from "./persisted-input.js";

const backoffMs = [30_000, 2 * 60_000, 5 * 60_000, 15 * 60_000] as const;
const halfOpenLeaseMs = 30_000;
const failureThreshold = 3;

export class AiCircuitOpenError extends Error {
  constructor(public readonly retryAt: Date | null) {
    super("AI_CIRCUIT_OPEN");
  }
}

export async function executeWithAiCircuit<T>(provider: string, model: string, operation: () => Promise<T>, now = new Date()) {
  const permission = await acquirePermission(provider, model, now);
  if (!permission.allowed) throw new AiCircuitOpenError(permission.retryAt);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await operation();
      await recordAiSuccess(provider, model);
      return result;
    } catch (error) {
      lastError = error;
      if (attempt === 0 && retryable(error)) {
        await sleep(100 + Math.floor(Math.random() * 150));
        continue;
      }
      if (retryable(error)) await recordAiFailure(provider, model, error, now);
      throw error;
    }
  }
  throw lastError;
}

export async function getAiCircuitStatus(provider: string, model: string, now = new Date()) {
  const circuit = await prisma.aiProviderCircuit.findUnique({ where: { provider_model: { provider, model } } });
  if (!circuit) return { state: "CLOSED" as const, cooldownEndsAt: null, consecutiveFailures: 0, backoffLevel: 0 };
  const effectiveState = circuit.state === "OPEN" && circuit.openedUntil && circuit.openedUntil <= now ? "HALF_OPEN" : circuit.state;
  return {
    state: effectiveState,
    cooldownEndsAt: circuit.openedUntil?.toISOString() || null,
    consecutiveFailures: circuit.consecutiveFailures,
    backoffLevel: circuit.backoffLevel
  };
}

export async function recordAiSuccess(provider: string, model: string) {
  await prisma.aiProviderCircuit.upsert({
    where: { provider_model: { provider, model } },
    create: { provider, model, state: "CLOSED" },
    update: { state: "CLOSED", consecutiveFailures: 0, backoffLevel: 0, openedUntil: null, halfOpenLeaseUntil: null, lastError: null }
  });
}

export async function recordAiFailure(provider: string, model: string, error: unknown, now = new Date()) {
  const safeError = readSafeOptionalText(error instanceof Error ? error.message : String(error), 1_000);
  await prisma.$transaction(async (tx) => {
    const current = await tx.aiProviderCircuit.upsert({
      where: { provider_model: { provider, model } },
      create: { provider, model, state: "CLOSED" },
      update: {}
    });
    const failures = current.consecutiveFailures + 1;
    const shouldOpen = failures >= failureThreshold || current.state === "HALF_OPEN";
    const level = shouldOpen ? Math.min(current.backoffLevel + 1, backoffMs.length) : current.backoffLevel;
    const delay = shouldOpen ? backoffMs[Math.max(0, level - 1)]! : 0;
    await tx.aiProviderCircuit.update({
      where: { id: current.id },
      data: {
        state: shouldOpen ? "OPEN" : "CLOSED",
        consecutiveFailures: failures,
        backoffLevel: level,
        openedUntil: shouldOpen ? new Date(now.getTime() + delay) : null,
        halfOpenLeaseUntil: null,
        lastError: safeError.value || "AI provider request failed"
      }
    });
  });
}

async function acquirePermission(provider: string, model: string, now: Date): Promise<{ allowed: boolean; retryAt: Date | null }> {
  return prisma.$transaction(async (tx) => {
    const circuit = await tx.aiProviderCircuit.upsert({
      where: { provider_model: { provider, model } },
      create: { provider, model, state: "CLOSED" },
      update: {}
    });
    if (circuit.state === "CLOSED") return { allowed: true, retryAt: null };
    if (circuit.state === "OPEN" && circuit.openedUntil && circuit.openedUntil > now) return { allowed: false, retryAt: circuit.openedUntil };
    if (circuit.state === "HALF_OPEN" && circuit.halfOpenLeaseUntil && circuit.halfOpenLeaseUntil > now) return { allowed: false, retryAt: circuit.halfOpenLeaseUntil };
    const leased = await tx.aiProviderCircuit.updateMany({
      where: {
        id: circuit.id,
        OR: [
          { state: "OPEN", openedUntil: { lte: now } },
          { state: "HALF_OPEN", OR: [{ halfOpenLeaseUntil: null }, { halfOpenLeaseUntil: { lte: now } }] }
        ]
      },
      data: { state: "HALF_OPEN", halfOpenLeaseUntil: new Date(now.getTime() + halfOpenLeaseMs) }
    });
    return leased.count === 1 ? { allowed: true, retryAt: null } : { allowed: false, retryAt: circuit.openedUntil };
  });
}

function retryable(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) : null;
  if (status != null && Number.isFinite(status)) return status === 429 || status >= 500;
  return true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
