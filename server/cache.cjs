const { ApiError } = require('./errors.cjs');

// One bounded cache per process. A shared promise collapses simultaneous misses.
class RequestCache {
  constructor({ ttlMs, maxAgeMs = ttlMs, maxEntries = 256, maxPending = 64, now = Date.now }) {
    Object.assign(this, { ttlMs, maxAgeMs, maxEntries, maxPending, now });
    this.entries = new Map();
    this.pending = new Map();
  }

  result(entry, cache) {
    return { data: entry.data, fetchedAt: entry.fetchedAt, cache };
  }

  async get(key, loader) {
    const cached = this.entries.get(key);
    const age = cached ? this.now() - cached.fetchedAt : Infinity;
    if (cached && age < this.ttlMs) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return this.result(cached, 'hit');
    }
    if (cached && age < this.maxAgeMs && this.now() < cached.retryAt) {
      return this.result(cached, 'stale');
    }
    if (this.pending.has(key)) {
      const result = await this.pending.get(key);
      return { ...result, cache: result.cache === 'stale' ? 'stale' : 'coalesced' };
    }
    if (this.pending.size >= this.maxPending) {
      throw new ApiError(503, 'SERVER_BUSY', 'The weather service is busy. Please try again shortly.', { retryAfter: 5 });
    }
    const pending = this.load(key, cached, loader);
    this.pending.set(key, pending);
    try {
      return await pending;
    } finally {
      this.pending.delete(key);
    }
  }

  async load(key, cached, loader) {
    try {
      const data = await loader();
      const entry = { data, fetchedAt: this.now(), retryAt: 0 };
      this.entries.delete(key);
      if (this.entries.size >= this.maxEntries) {
        this.entries.delete(this.entries.keys().next().value);
      }
      this.entries.set(key, entry);
      return this.result(entry, 'miss');
    } catch (error) {
      // Re-check age after the upstream wait; never extend the maximum stale age.
      if (error.transient && cached && this.now() - cached.fetchedAt < this.maxAgeMs) {
        cached.retryAt = this.now() + Math.max(10000, (error.retryAfter || 0) * 1000);
        return this.result(cached, 'stale');
      }
      throw error;
    }
  }
}

module.exports = { RequestCache };
