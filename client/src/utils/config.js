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

export function setCustomApiUrl(url) {
  if (url && url.trim()) {
    localStorage.setItem('luxpower-custom-api-url', normalizeApiUrl(url));
  } else {
    localStorage.removeItem('luxpower-custom-api-url');
  }
}

export const API_BASE_URL = getApiBaseUrl();

/**
 * Fetch wrapper with automatic fallback:
 * If primary API endpoint fails with network error (e.g. workers.dev DNS/adblock issue),
 * seamlessly falls back to VITE_FALLBACK_API_URL or configured API base.
 */
export async function apiFetch(path, options = {}) {
  const primaryBase = getApiBaseUrl();
  const fallbackBase = import.meta.env.VITE_FALLBACK_API_URL || import.meta.env.VITE_API_BASE_URL || '/api';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // Ensure fresh responses and bypass browser 304 caching on dynamic endpoints
  const fetchOptions = {
    cache: 'no-store',
    ...options,
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...(options.headers || {}),
    },
  };

  try {
    const res = await fetch(`${primaryBase}${cleanPath}`, fetchOptions);
    return res;
  } catch (primaryErr) {
    if (primaryBase !== fallbackBase) {
      console.warn(`[apiFetch] Primary (${primaryBase}) failed, retrying with fallback (${fallbackBase}):`, primaryErr);
      return await fetch(`${fallbackBase}${cleanPath}`, fetchOptions);
    }
    throw primaryErr;
  }
}
