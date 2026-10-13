/**
 * Fixed-window rate limiter with pluggable stores.
 *
 * - memory   : per process, zero latency. Good for a single on-prem instance.
 * - postgres : shared by every instance (serverless / horizontally scaled),
 *              one upsert per request. Select with RATE_LIMIT_STORE=postgres.
 */
const { getSecurityConfig } = require("../config/security-config");

class MemoryStore {
  constructor(maxKeys) {
    this.maxKeys = maxKeys;
    this.buckets = new Map();
  }
  async hit(key, windowSeconds) {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      if (this.buckets.size >= this.maxKeys) this.evict(now);
    }
    bucket.count += 1;
    this.buckets.delete(key); // keep Map insertion order ~ recency
    this.buckets.set(key, bucket);
    return { count: bucket.count, resetAt: bucket.resetAt };
  }
  evict(now) {
    for (const [key, bucket] of this.buckets)
      if (bucket.resetAt <= now) this.buckets.delete(key);
    // Still full: drop the oldest quarter to bound memory.
    if (this.buckets.size >= this.maxKeys) {
      let drop = Math.ceil(this.maxKeys / 4);
      for (const key of this.buckets.keys()) {
        if (drop-- <= 0) break;
        this.buckets.delete(key);
      }
    }
  }
}

class PostgresStore {
  constructor(query) {
    this.query = query;
    this.lastCleanup = 0;
  }
  async hit(key, windowSeconds) {
    const windowStart = Math.floor(Date.now() / (windowSeconds * 1000));
    const r = await this.query(
      `INSERT INTO rate_limit_buckets(bucket_key,window_start,hits,expires_at)
       VALUES($1,$2,1,NOW()+($3||' seconds')::interval)
       ON CONFLICT(bucket_key,window_start) DO UPDATE SET hits=rate_limit_buckets.hits+1
       RETURNING hits`,
      [key, windowStart, windowSeconds],
    );
    if (Date.now() - this.lastCleanup > 60000) {
      this.lastCleanup = Date.now();
      this.query(
        "DELETE FROM rate_limit_buckets WHERE expires_at < NOW()",
      ).catch(() => {});
    }
    return {
      count: Number(r.rows[0]?.hits || 1),
      resetAt: (windowStart + 1) * windowSeconds * 1000,
    };
  }
}

let store = null;
function getStore() {
  if (store) return store;
  const config = getSecurityConfig().rateLimit;
  if (config.store === "postgres") {
    const { query } = require("../lib/db");
    store = new PostgresStore(query);
  } else store = new MemoryStore(config.memoryMaxKeys);
  return store;
}
function resetRateLimiter() {
  store = null;
}

/**
 * Counts one request for (rule, identity).
 * @returns {Promise<{allowed: boolean, limit: number, remaining: number, retryAfterSeconds: number} | null>}
 *   null when the rule is disabled.
 */
async function consume(ruleName, identity) {
  const rule = getSecurityConfig().rateLimit.rules[ruleName];
  if (!rule) return null;
  let result;
  try {
    result = await getStore().hit(
      `${ruleName}:${identity}`,
      rule.windowSeconds,
    );
  } catch (error) {
    // Fail open: availability of the API must not depend on the limiter store.
    console.error("[rate-limit] store unavailable:", error.message);
    return null;
  }
  const remaining = Math.max(0, rule.limit - result.count);
  return {
    allowed: result.count <= rule.limit,
    limit: rule.limit,
    remaining,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((result.resetAt - Date.now()) / 1000),
    ),
  };
}

module.exports = { consume, resetRateLimiter, MemoryStore, PostgresStore };
