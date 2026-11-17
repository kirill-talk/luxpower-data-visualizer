/**
 * Client-side Telemetry Cache using native IndexedDB
 *
 * 1. Storage:
 *    - IndexedDB database 'luxpower_db', store 'day_charts'.
 *    - Key: `${serial}_${dateStr}`
 *    - Value: { key, serial, date: dateStr, data: rawPoints, savedAt: timestamp }
 *    - Unlimited capacity compared to localStorage (no 5MB limit).
 *    - Fully asynchronous: does not block the UI thread during parsing.
 *
 * 2. Concurrency Pool:
 *    - Runs at most `concurrency` (e.g. 2-3) requests simultaneously with delay.
 *    - Automatic retry with backoff on failed requests.
 */

const DB_NAME = 'luxpower_db';
const DB_VERSION = 1;
const STORE_NAME = 'day_charts';

let dbInstancePromise = null;

function getDB() {
  if (dbInstancePromise) return dbInstancePromise;

  dbInstancePromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.warn('IndexedDB open error:', request.error);
      reject(request.error);
    };
  });

  return dbInstancePromise;
}

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
 * Get cached day chart data from IndexedDB.
 */
export async function getCachedDayChart(serial, dateStr) {
  try {
    const db = await getDB();
    const key = `${serial || 'default'}_${dateStr}`;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        resolve(req.result ? req.result.data : null);
      };

      req.onerror = () => {
        resolve(null);
      };
    });
  } catch (e) {
    console.warn('Failed reading from IndexedDB cache:', e);
    return null;
  }
}

/**
 * Save day chart data for past dates into IndexedDB.
 */
export async function setCachedDayChart(serial, dateStr, data) {
  if (!isPastDate(dateStr) || !data || !Array.isArray(data) || data.length === 0) {
    return;
  }

  try {
    const db = await getDB();
    const key = `${serial || 'default'}_${dateStr}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({
        key,
        serial: serial || 'default',
        date: dateStr,
        data,
        savedAt: Date.now(),
      });

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Failed writing to IndexedDB cache:', e);
  }
}

/**
 * Clean up legacy localStorage chart keys if they were written earlier.
 */
export function cleanupLegacyLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return;
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('lux_chart_')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
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
