type RateLimitRule = {
  windowMs: number;
  maxAttempts: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitCheck =
  | { allowed: true }
  | {
      allowed: false;
      retryAfterSeconds: number;
    };

const buckets = new Map<string, Bucket>();

const loginIpRule: RateLimitRule = { windowMs: 15 * 60 * 1000, maxAttempts: 30 };
const loginEmailRule: RateLimitRule = { windowMs: 15 * 60 * 1000, maxAttempts: 10 };
const registerIpRule: RateLimitRule = { windowMs: 60 * 60 * 1000, maxAttempts: 10 };
const registerEmailRule: RateLimitRule = { windowMs: 60 * 60 * 1000, maxAttempts: 3 };

// In-memory limiting is suitable for single-process staging. Multi-instance production should move this to Redis.
export function checkLoginRateLimit(input: { ip?: string | null; email: string }) {
  return checkCompositeRateLimit([
    [`auth:login:ip:${normalizeIp(input.ip)}`, loginIpRule],
    [`auth:login:email:${normalizeEmail(input.email)}`, loginEmailRule]
  ]);
}

export function checkRegisterRateLimit(input: { ip?: string | null; email: string }) {
  return checkCompositeRateLimit([
    [`auth:register:ip:${normalizeIp(input.ip)}`, registerIpRule],
    [`auth:register:email:${normalizeEmail(input.email)}`, registerEmailRule]
  ]);
}

export function resetAuthRateLimiters() {
  buckets.clear();
}

function checkCompositeRateLimit(entries: Array<[string, RateLimitRule]>): RateLimitCheck {
  const results = entries.map(([key, rule]) => hitBucket(key, rule));
  const blocked = results.filter((result): result is Extract<RateLimitCheck, { allowed: false }> => !result.allowed);
  if (blocked.length === 0) return { allowed: true };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(...blocked.map((result) => result.retryAfterSeconds))
  };
}

function hitBucket(key: string, rule: RateLimitRule, now = Date.now()): RateLimitCheck {
  const existing = buckets.get(key);
  const current = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + rule.windowMs };
  current.count += 1;
  buckets.set(key, current);

  if (current.count <= rule.maxAttempts) return { allowed: true };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeIp(ip?: string | null) {
  return ip?.trim() || "unknown";
}
