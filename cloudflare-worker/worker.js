/**
 * Cloudflare Worker Proxy for Luxpowertek Cloud
 *
 * Provides CORS-enabled proxy endpoints for Luxpower dashboard hosted on GitHub Pages:
 * - POST /api/auth/login
 * - GET  /api/status
 * - GET  /api/telemetry/live
 * - GET  /api/telemetry/day-chart
 * - GET  /api/telemetry/table
 *
 * Free Tier on Cloudflare: 100,000 requests/day at zero cost.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

function extractCookie(request) {
  const custom = request.headers.get('x-lux-cookie') || request.headers.get('authorization');
  if (custom) {
    return custom.replace(/^Bearer\s+/i, '').trim();
  }
  return null;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const targetBase = request.headers.get('x-lux-server') || env.LUX_BASE_URL || 'https://eu.luxpowertek.com';

    try {
      // 1. Health / Status check
      if (pathname === '/api/status' || pathname === '/status') {
        const cookie = extractCookie(request);
        return jsonResponse({
          connected: !!cookie,
          hasEnvCredentials: !!(env.LUX_ACCOUNT && env.LUX_PASSWORD),
          account: null,
          defaultSerial: null,
          worker: true,
        });
      }

      // 2. Login Endpoint
      if (pathname === '/api/auth/login' || pathname === '/auth/login') {
        const body = await request.json();
        const { account, password, server } = body;
        const apiBase = server || targetBase;

        if (!account || !password) {
          return jsonResponse({ success: false, error: 'Account and password required' }, 400);
        }

        const formData = new URLSearchParams();
        formData.append('account', account);
        formData.append('password', password);

        // Web login to obtain session cookies
        const loginRes = await fetch(`${apiBase}/WManage/web/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          },
          body: formData.toString(),
          redirect: 'manual',
        });

        const setCookieHeader = loginRes.headers.get('set-cookie') || '';
        let cookie = setCookieHeader.split(';')[0];

        // Call api/login with the cookie to get inverter serial & plant info
        let userSerial = null;
        let plant = null;
        let deviceInfo = null;

        try {
          const apiLoginRes = await fetch(`${apiBase}/WManage/api/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'Cookie': cookie,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
            },
            body: formData.toString(),
          });
          const apiData = await apiLoginRes.json();
          if (apiData && apiData.success) {
            deviceInfo = {
              userVisitRecord: apiData.userVisitRecord,
              plants: apiData.plants,
              username: apiData.username,
            };
            if (apiData.plants && apiData.plants.length > 0) {
              plant = apiData.plants[0];
              if (plant.inverters && plant.inverters.length > 0) {
                userSerial = plant.inverters[0].serialNum;
              }
            }
          }
        } catch (e) {
          // ignore metadata failure if cookie exists
        }

        if (!cookie) {
          return jsonResponse({ success: false, error: 'Authentication failed. Check credentials.' }, 401);
        }

        return jsonResponse({
          success: true,
          account,
          cookie,
          defaultSerial: userSerial,
          plant,
          deviceInfo,
        });
      }

      // Helper to execute Luxpower request and detect expired session / HTML redirect
      async function fetchLuxJson(url, options) {
        const res = await fetch(url, options);
        const text = await res.text();
        const trimmed = text.trim();
        if (trimmed.startsWith('<') || trimmed.includes('<!DOCTYPE')) {
          return { isAuthError: true, status: 401, error: 'Session expired (redirected to login)' };
        }
        try {
          const json = JSON.parse(text);
          if (json && (json.msg === 'UNLOGIN_ERROR' || res.status === 401)) {
            return { isAuthError: true, status: 401, error: 'Session expired' };
          }
          return { ok: true, status: res.status, data: json };
        } catch (e) {
          return { isAuthError: false, status: res.status, error: 'Invalid response from Luxpower' };
        }
      }

      // 3. Realtime Live Telemetry
      if (pathname === '/api/telemetry/live' || pathname === '/telemetry/live') {
        const cookie = extractCookie(request);
        const serial = url.searchParams.get('serial') || request.headers.get('x-lux-serial');

        if (!serial) {
          return jsonResponse({ error: 'No serial number provided' }, 400);
        }

        const formData = new URLSearchParams();
        formData.append('serialNum', serial);

        const result = await fetchLuxJson(`${targetBase}/WManage/api/inverter/getInverterRuntime`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Cookie': cookie || '',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          },
          body: formData.toString(),
        });
        if (result.isAuthError) {
          return jsonResponse({ error: result.error, code: 'UNLOGIN_ERROR' }, 401);
        }
        if (!result.ok) {
          return jsonResponse({ error: result.error }, result.status || 500);
        }
        return jsonResponse(result.data);
      }

      // 4. 24h Profile Chart
      if (pathname === '/api/telemetry/day-chart' || pathname === '/telemetry/day-chart') {
        const cookie = extractCookie(request);
        const serial = url.searchParams.get('serial') || request.headers.get('x-lux-serial');
        const dateText = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

        if (!serial) {
          return jsonResponse({ error: 'No serial number provided' }, 400);
        }

        const formData = new URLSearchParams();
        formData.append('serialNum', serial);
        formData.append('dateText', dateText);

        const result = await fetchLuxJson(`${targetBase}/WManage/api/analyze/chart/dayMultiLine`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Cookie': cookie || '',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          },
          body: formData.toString(),
        });
        if (result.isAuthError) {
          return jsonResponse({ error: result.error, code: 'UNLOGIN_ERROR' }, 401);
        }
        if (!result.ok) {
          return jsonResponse({ error: result.error }, result.status || 500);
        }
        return jsonResponse(result.data);
      }

      // 5. Detailed Table Data
      if (pathname === '/api/telemetry/table' || pathname === '/telemetry/table') {
        const cookie = extractCookie(request);
        const serial = url.searchParams.get('serial') || request.headers.get('x-lux-serial');
        const dateText = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
        const page = url.searchParams.get('page') || '1';
        const rows = url.searchParams.get('rows') || '500';

        if (!serial) {
          return jsonResponse({ error: 'No serial number provided' }, 400);
        }

        const endpoint = `${targetBase}/WManage/web/analyze/data/${dateText}?serialNum=${serial}&page=${page}&rows=${rows}`;
        const result = await fetchLuxJson(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Cookie': cookie || '',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        if (result.isAuthError) {
          return jsonResponse({ error: result.error, code: 'UNLOGIN_ERROR' }, 401);
        }
        if (!result.ok) {
          return jsonResponse({ error: result.error }, result.status || 500);
        }
        return jsonResponse(result.data);
      }

      return jsonResponse({ error: 'Endpoint not found' }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },
};
