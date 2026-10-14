/**
 * Small in-memory cache with a time-to-live and an entry cap (least recently
 * used entries are evicted first). Process-local by design: each server
 * instance keeps its own copy, so it never needs coordination and can be
 * disabled by not creating one.
 */
class TtlCache {
  /**
   * @param {{ ttlMs: number, maxEntries: number, now?: () => number }} options
   */
  constructor({ ttlMs, maxEntries, now = Date.now }) {
    this.ttlMs = Math.max(0, Number(ttlMs) || 0);
    this.maxEntries = Math.max(1, Math.trunc(Number(maxEntries) || 1));
    this.now = now;
    /** @type {Map<string, { value: unknown, expiresAt: number }>} */
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Re-insert so Map order tracks recency.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (!this.ttlMs) return;
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries)
      this.entries.delete(this.entries.keys().next().value);
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}

module.exports = { TtlCache };
