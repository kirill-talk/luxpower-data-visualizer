// Get dynamic API Base URL from localStorage (if user configured a custom proxy) or env / relative path
export function getApiBaseUrl() {
  try {
    const custom = localStorage.getItem('luxpower-custom-api-url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  } catch {
    // fallback
  }
  return import.meta.env.VITE_API_BASE_URL || '/api';
}

export function setCustomApiUrl(url) {
  if (url && url.trim()) {
    localStorage.setItem('luxpower-custom-api-url', url.trim().replace(/\/+$/, ''));
  } else {
    localStorage.removeItem('luxpower-custom-api-url');
  }
}

export const API_BASE_URL = getApiBaseUrl();

/**
 * Fetch wrapper with automatic fallback:
 * If primary API endpoint fails with network error (e.g. workers.dev DNS/adblock issue),
 * seamlessly falls back to the self-hosted dev API.
 */
export async function apiFetch(path, options = {}) {
  const primaryBase = getApiBaseUrl();
  const fallbackBase = 'https://data-visualizer.kidev.uk/api';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  try {
    const res = await fetch(`${primaryBase}${cleanPath}`, options);
    return res;
  } catch (primaryErr) {
    if (primaryBase !== fallbackBase) {
      console.warn(`[apiFetch] Primary (${primaryBase}) failed, retrying with fallback (${fallbackBase}):`, primaryErr);
      return await fetch(`${fallbackBase}${cleanPath}`, options);
    }
    throw primaryErr;
  }
}
