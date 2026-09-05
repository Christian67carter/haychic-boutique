// api/_rateLimit.js
// Shared in-memory sliding-window rate limiter for Vercel serverless functions.
// Not stateful across cold starts, but provides real protection against
// sustained abuse within a warm Lambda instance — zero extra dependencies.

const store = new Map();

/**
 * @param {string} key      Unique key, typically the client IP address.
 * @param {number} max      Max requests allowed in the window (default 10).
 * @param {number} windowMs Window size in milliseconds (default 60 s).
 * @returns {{ limited: boolean, remaining: number, resetAt: number }}
 */
function rateLimit(key, max = 10, windowMs = 60000) {
  const now = Date.now();
  let record = store.get(key);

  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + windowMs };
  } else {
    record.count++;
  }
  store.set(key, record);

  // Prune stale entries to prevent unbounded memory growth.
  if (store.size > 5000) {
    for (const [k, v] of store) {
      if (now > v.resetAt) store.delete(k);
    }
  }

  return {
    limited: record.count > max,
    remaining: Math.max(0, max - record.count),
    resetAt: record.resetAt,
  };
}

module.exports = { rateLimit };
