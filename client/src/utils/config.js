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
