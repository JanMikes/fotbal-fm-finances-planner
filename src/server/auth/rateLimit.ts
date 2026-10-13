/** Tiny in-memory fixed-window rate limiter (per process) for the login form. */
type Entry = { count: number; resetAt: number };

export class RateLimiter {
  private hits = new Map<string, Entry>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Register an attempt; returns false when the key is over the limit. */
  hit(key: string, now: number = Date.now()): boolean {
    this.sweep(now);
    const e = this.hits.get(key);
    if (!e || e.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    e.count++;
    return e.count <= this.limit;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private sweep(now: number) {
    if (this.hits.size < 1000) return;
    for (const [k, e] of this.hits) if (e.resetAt <= now) this.hits.delete(k);
  }
}

const g = globalThis as typeof globalThis & { __fmpLoginLimiter?: RateLimiter };
/** 10 failed attempts per 15 minutes per client IP. */
export const loginLimiter: RateLimiter = (g.__fmpLoginLimiter ??= new RateLimiter(10, 15 * 60 * 1000));

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
