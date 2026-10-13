/** Tiny in-memory fixed-window rate limiter (per process) for the login form and the magic link. */
type Entry = { count: number; resetAt: number };

/** Upper bound on tracked keys, so spoofed/rotating keys cannot grow memory without limit. */
const MAX_KEYS = 10_000;

export class RateLimiter {
  private hits = new Map<string, Entry>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys: number = MAX_KEYS,
  ) {}

  /** Register an attempt; returns false when the key is over the limit. */
  hit(key: string, now: number = Date.now()): boolean {
    this.sweep(now);
    const e = this.hits.get(key);
    if (!e || e.resetAt <= now) {
      this.hits.delete(key);
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    e.count++;
    return e.count <= this.limit;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  get size(): number {
    return this.hits.size;
  }

  private sweep(now: number) {
    if (this.hits.size < 1000) return;
    for (const [k, e] of this.hits) if (e.resetAt <= now) this.hits.delete(k);
    // Still too many: evict the oldest entries (Map iterates in insertion order).
    for (const k of this.hits.keys()) {
      if (this.hits.size < this.maxKeys) break;
      this.hits.delete(k);
    }
  }
}

const g = globalThis as typeof globalThis & { __fmpLoginLimiter?: RateLimiter };
/** 10 attempts per 15 minutes per client IP — shared by POST /api/auth/login and GET /k/<token>. */
export const loginLimiter: RateLimiter = (g.__fmpLoginLimiter ??= new RateLimiter(10, 15 * 60 * 1000));

/**
 * Client IP for rate limiting.
 *
 * Assumption (documented in DEPLOYMENT.md): exactly ONE trusted reverse proxy (Traefik on lily) sits in front of
 * the app. Traefik does not trust client-sent forwarded headers, and it APPENDS the real peer address to
 * X-Forwarded-For, so the RIGHT-MOST entry is the only one a client cannot forge. Left-most entries are
 * client-controlled and are ignored. Without any proxy (local), the header is fully client-controlled — the
 * limiter is best-effort there.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last.slice(0, 100);
  }
  return req.headers.get("x-real-ip")?.trim().slice(0, 100) || "unknown";
}
