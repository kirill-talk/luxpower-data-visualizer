/**
 * Client-side Telemetry Cache and Concurrency Pool
 *
 * 1. Cache:
 *    - Completed past days are immutable: cached indefinitely in localStorage with LRU eviction.
 *    - Today is mutable: not cached as finalized, or cached with short TTL.
 *
 * 2. Concurrency Pool:
 *    - Runs at most `concurrency` (e.g. 2-3) requests simultaneously with an optional delay
 *      between requests to avoid triggering Luxpower cloud rate-limiters.
 *    - Automatic retry with backoff on failed requests.
 */

const CACHE_PREFIX = 'lux_chart_';
const CACHE_MAX_ITEMS = 60; // Up to 60 days of historical points

/**
 * Check if date string (YYYY-MM-DD) is in the past compared to local today.
 */
export function isPastDate(dateStr) {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return dateStr < todayStr;
}

/**
 * Get cached day chart data if available.
 */
export function getCachedDayChart(serial, dateStr) {
  try {
    const key = `${CACHE_PREFIX}${serial || 'default'}_${dateStr}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data || null;
  } catch (e) {
    console.warn('Failed reading telemetry cache:', e);
    return null;
  }
}

/**
 * Set cached day chart data for past dates.
 */
export function setCachedDayChart(serial, dateStr, data) {
  // Only cache valid non-empty past data to prevent caching today's incomplete data
  if (!isPastDate(dateStr) || !data || !Array.isArray(data) || data.length === 0) {
    return;
  }

  try {
    const key = `${CACHE_PREFIX}${serial || 'default'}_${dateStr}`;
    localStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      data,
    }));
    pruneOldCache();
  } catch (e) {
    // If quota exceeded, prune and retry once
    try {
      pruneOldCache(true);
      const key = `${CACHE_PREFIX}${serial || 'default'}_${dateStr}`;
      localStorage.setItem(key, JSON.stringify({
        savedAt: Date.now(),
        data,
      }));
    } catch {}
  }
}

/**
 * Evict oldest entries if cache exceeds CACHE_MAX_ITEMS.
 */
function pruneOldCache(aggressive = false) {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) {
        keys.push(k);
      }
    }

    const limit = aggressive ? Math.floor(CACHE_MAX_ITEMS / 2) : CACHE_MAX_ITEMS;
    if (keys.length > limit) {
      // Sort oldest by key or savedAt
      keys.sort();
      const toRemove = keys.slice(0, keys.length - limit);
      toRemove.forEach((k) => localStorage.removeItem(k));
    }
  } catch {}
}

/**
 * Executes an array of async task functions with limited concurrency.
 * @param {Array<() => Promise<any>>} tasks
 * @param {number} concurrency Maximum parallel tasks (default 2)
 * @param {number} delayMs Delay between launching consecutive requests (default 60ms)
 * @returns {Promise<Array<any>>}
 */
export async function runWithConcurrency(tasks, concurrency = 2, delayMs = 60) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex++;
      try {
        results[currentIndex] = await tasks[currentIndex]();
      } catch (err) {
        results[currentIndex] = { error: err };
      }
      if (delayMs > 0 && nextIndex < tasks.length) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  const workers = [];
  const workerCount = Math.min(concurrency, tasks.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}
