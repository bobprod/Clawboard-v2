/**
 * rateLimit.mjs — In-memory sliding window rate limiter.
 * No external dependency. Uses a Map of { count, windowStart }.
 */

const windows = new Map(); // key -> { count, windowStart }

/**
 * rateLimit(key, limit, windowMs)
 * @param {string}  key       — unique identifier (e.g. IP or IP+path)
 * @param {number}  limit     — max requests per window
 * @param {number}  windowMs  — window length in ms
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let entry = windows.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 1, windowStart: now };
    windows.set(key, entry);
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  entry.count++;
  if (entry.count > limit) {
    const retryAfterMs = windowMs - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }
  return { allowed: true, remaining: limit - entry.count, retryAfterMs: 0 };
}

/**
 * Pre-configured limiters for common routes.
 * Returns false if blocked (and sends 429 response).
 */
const LIMITS = {
  login: { limit: 10, window: 60_000 }, // 10 req/min per IP
  chat: { limit: 30, window: 60_000 }, // 30 req/min per IP
  shell: { limit: 20, window: 60_000 }, // 20 req/min per IP
  write: { limit: 60, window: 60_000 }, // 60 writes/min per IP (POST/PATCH/PUT/DELETE)
  global: { limit: 300, window: 60_000 }, // 300 req/min per IP global
};

/**
 * checkRateLimit(req, res, category)
 * @returns {boolean} true if request is allowed, false if blocked (429 already sent)
 */
export function checkRateLimit(req, res, category = "global") {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  const cfg = LIMITS[category] || LIMITS.global;
  const key = `${category}:${ip}`;
  const result = rateLimit(key, cfg.limit, cfg.window);
  if (!result.allowed) {
    res.writeHead(429, {
      "Content-Type": "application/json",
      "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
    });
    res.end(
      JSON.stringify({
        error: "Too many requests",
        retryAfterMs: result.retryAfterMs,
      }),
    );
    return false;
  }
  return true;
}

// Cleanup stale entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) {
    // Remove entries older than 2 minutes (longest window * 2)
    if (now - entry.windowStart > 120_000) windows.delete(key);
  }
}, 300_000);
