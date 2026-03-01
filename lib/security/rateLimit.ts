type RateLimitOptions = {
  keyPrefix: string;
  windowMs: number;
  max: number;
};

type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function nowMs() {
  return Date.now();
}

export function clientIpFromRequest(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const firstForwarded = forwarded.split(',')[0]?.trim();
  if (firstForwarded) return firstForwarded;
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}

function computeKey(req: Request, opts: RateLimitOptions) {
  const ip = clientIpFromRequest(req);
  return `${opts.keyPrefix}:${ip}`;
}

export function checkRateLimit(req: Request, opts: RateLimitOptions): RateLimitResult {
  const key = computeKey(req, opts);
  const now = nowMs();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return {
      ok: true,
      remaining: Math.max(0, opts.max - 1),
      retryAfterSec: Math.ceil(opts.windowMs / 1000)
    };
  }

  if (existing.count >= opts.max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return {
    ok: true,
    remaining: Math.max(0, opts.max - existing.count),
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
  };
}

