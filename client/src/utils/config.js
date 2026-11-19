export const DEFAULT_CLOUDFLARE_WORKER_URL = 'https://luxpower-proxy.kirill-talk.workers.dev/api';
const PRIMARY_TIMEOUT_MS = 5000;
const PRIMARY_COOLDOWN_MS = 60000;
let primaryDownUntil = 0;

function normalizeApiUrl(url) {
  if (!url || !url.trim()) return '';
  let clean = url.trim().replace(/\/+$/, '');
  if (clean && !clean.endsWith('/api')) {
    clean = `${clean}/api`;
  }
  return clean;
}

// Get dynamic API Base URL from localStorage (if user configured a custom proxy) or env / relative path
export function getApiBaseUrl() {
  try {
    const custom = localStorage.getItem('luxpower-custom-api-url');
    if (custom && custom.trim()) {
      return normalizeApiUrl(custom);
    }
  } catch {
    // fallback
  }
  return import.meta.env.VITE_API_BASE_URL || '/api';
}

export function getFallbackApiUrl() {
  return import.meta.env.VITE_FALLBACK_API_URL || DEFAULT_CLOUDFLARE_WORKER_URL;
}

export function setCustomApiUrl(url) {
  primaryDownUntil = 0;
  if (url && url.trim()) {
    localStorage.setItem('luxpower-custom-api-url', normalizeApiUrl(url));
  } else {
    localStorage.removeItem('luxpower-custom-api-url');
  }
}

export const API_BASE_URL = getApiBaseUrl();

/**
 * Fetch wrapper with automatic fallback to Cloudflare Worker:
 * - Applies a 5s timeout on the primary endpoint.
 * - Falls back on network/timeout errors OR HTTP >= 500 (500/502/503/504).
 * - Uses a 60s cooldown so subsequent polls do not repeatedly stall on an offline primary.
 */
export async function apiFetch(path, options = {}) {
  const primaryBase = getApiBaseUrl();
  const fallbackBase = getFallbackApiUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const canFallback = !!fallbackBase && primaryBase !== fallbackBase;

  const baseHeaders = {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    ...(options.headers || {}),
  };

  const baseFetchOptions = {
    cache: 'no-store',
    ...options,
    headers: baseHeaders,
  };

  if (canFallback && Date.now() < primaryDownUntil) {
    return await fetch(`${fallbackBase}${cleanPath}`, baseFetchOptions);
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer = null;
  if (controller) {
    timer = setTimeout(() => controller.abort(), PRIMARY_TIMEOUT_MS);
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }
  }

  try {
    const res = await fetch(`${primaryBase}${cleanPath}`, {
      ...baseFetchOptions,
      signal: controller ? controller.signal : options.signal,
    });
    if (timer) clearTimeout(timer);

    if (!res.ok && res.status >= 500 && canFallback) {
      primaryDownUntil = Date.now() + PRIMARY_COOLDOWN_MS;
      console.warn(`[apiFetch] Primary API returned HTTP ${res.status}, switching to fallback proxy.`);
      return await fetch(`${fallbackBase}${cleanPath}`, baseFetchOptions);
    }
    return res;
  } catch (primaryErr) {
    if (timer) clearTimeout(timer);
    if (canFallback) {
      primaryDownUntil = Date.now() + PRIMARY_COOLDOWN_MS;
      console.warn('[apiFetch] Primary API unreachable, switching to fallback proxy.');
      return await fetch(`${fallbackBase}${cleanPath}`, baseFetchOptions);
    }
    throw primaryErr;
  }
}
