import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { securitySecret } from "./auth.js";
import { prisma } from "./prisma.js";

type RateLimitRule = {
  windowMs: number;
  maxAttempts: number;
};

export type RateLimitCheck =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

const loginIpRule: RateLimitRule = { windowMs: 15 * 60 * 1000, maxAttempts: 30 };
const loginEmailRule: RateLimitRule = { windowMs: 15 * 60 * 1000, maxAttempts: 10 };
const registrationEmailIpRule: RateLimitRule = { windowMs: 60 * 60 * 1000, maxAttempts: 3 };
const registrationEmailRule: RateLimitRule = { windowMs: 60 * 60 * 1000, maxAttempts: 3 };
const extensionPairingIpRule: RateLimitRule = { windowMs: 15 * 60 * 1000, maxAttempts: 10 };
const extensionPairingCodeRule: RateLimitRule = { windowMs: 15 * 60 * 1000, maxAttempts: 5 };
// The collector starts one pulse every five seconds, but each pulse performs
// the platform request before it reaches this API.  A strict five-second
// receive window therefore rejects healthy pulses whenever platform/network
// latency changes between two cycles.  Keep a one-second scheduling margin
// while still rejecting duplicate or burst uploads.
export const metricPulseRateLimitWindowMs = 4 * 1000;
const metricPulseRule: RateLimitRule = { windowMs: metricPulseRateLimitWindowMs, maxAttempts: 1 };
const snapshotRule: RateLimitRule = { windowMs: 60 * 1000, maxAttempts: 30 };
const decisionRule: RateLimitRule = { windowMs: 60 * 1000, maxAttempts: 6 };
const aiExplanationRule: RateLimitRule = { windowMs: 60 * 60 * 1000, maxAttempts: 10 };
const writeRule: RateLimitRule = { windowMs: 60 * 1000, maxAttempts: 120 };

export async function checkLoginRateLimit(input: { ip?: string | null; email: string }) {
  return checkCompositeRateLimit([
    ["auth:login:ip", normalizeIp(input.ip), loginIpRule],
    ["auth:login:email", normalizeEmail(input.email), loginEmailRule]
  ]);
}

export async function checkRegisterRateLimit(input: { ip?: string | null; email: string }) {
  return checkRegistrationEmailRateLimit(input);
}

export async function checkEmailVerificationRateLimit(input: { ip?: string | null; email: string }) {
  return checkRegistrationEmailRateLimit(input);
}

function checkRegistrationEmailRateLimit(input: { ip?: string | null; email: string }) {
  return checkCompositeRateLimit([
    ["auth:registration-email:ip", normalizeIp(input.ip), registrationEmailIpRule],
    ["auth:registration-email:email", normalizeEmail(input.email), registrationEmailRule]
  ]);
}

export async function checkExtensionPairingRateLimit(input: { ip?: string | null; code?: string | null }) {
  const entries: Array<[string, string, RateLimitRule]> = [
    ["extension:pairing:ip", normalizeIp(input.ip), extensionPairingIpRule]
  ];
  if (input.code) entries.push(["extension:pairing:code", input.code.trim(), extensionPairingCodeRule]);
  return checkCompositeRateLimit(entries);
}

export async function checkMetricPulseRateLimit(
  input: { credentialOrSessionId: string; taskId: string },
  now = new Date()
) {
  return checkRateLimit("collection:pulse", `${input.credentialOrSessionId}:${input.taskId}`, metricPulseRule, now);
}

export async function checkSnapshotRateLimit(input: { credentialOrSessionId: string; taskId: string }) {
  return checkRateLimit("collection:snapshot", `${input.credentialOrSessionId}:${input.taskId}`, snapshotRule);
}

export async function checkDecisionRateLimit(taskId: string) {
  return checkRateLimit("decision", taskId, decisionRule);
}

export async function checkAiExplanationRateLimit(userId: string) {
  return checkRateLimit("ai:explanation", userId, aiExplanationRule);
}

export async function checkWriteRateLimit(sessionId: string) {
  return checkRateLimit("write", sessionId, writeRule);
}

export async function resetRateLimitBuckets() {
  await prisma.rateLimitBucket.deleteMany();
}

async function checkCompositeRateLimit(entries: Array<[string, string, RateLimitRule]>): Promise<RateLimitCheck> {
  const results = await Promise.all(entries.map(([scope, subject, rule]) => checkRateLimit(scope, subject, rule)));
  const blocked = results.filter((result): result is Extract<RateLimitCheck, { allowed: false }> => !result.allowed);
  if (blocked.length === 0) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.max(...blocked.map((result) => result.retryAfterSeconds)) };
}

async function checkRateLimit(scope: string, subject: string, rule: RateLimitRule, now = new Date()): Promise<RateLimitCheck> {
  const keyHash = hashRateLimitKey(scope, subject);
  const expiresAt = new Date(now.getTime() + rule.windowMs);
  const rows = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>(Prisma.sql`
    INSERT INTO "RateLimitBucket" ("keyHash", "windowStartedAt", "expiresAt", "count", "updatedAt")
    VALUES (${keyHash}, ${now}, ${expiresAt}, 1, ${now})
    ON CONFLICT ("keyHash") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStartedAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${now} ELSE "RateLimitBucket"."windowStartedAt" END,
      "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${expiresAt} ELSE "RateLimitBucket"."expiresAt" END,
      "updatedAt" = ${now}
    RETURNING "count", "expiresAt"
  `);
  const bucket = rows[0];
  if (!bucket) throw new Error("RATE_LIMIT_BUCKET_WRITE_FAILED");
  if (bucket.count <= rule.maxAttempts) return { allowed: true };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1000))
  };
}

function hashRateLimitKey(scope: string, subject: string) {
  return createHmac("sha256", securitySecret()).update(`${scope}\u0000${subject}`, "utf8").digest("hex");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeIp(ip?: string | null) {
  return ip?.trim() || "unknown";
}
