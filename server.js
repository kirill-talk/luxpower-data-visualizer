require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const LuxpowerClient = require('./src/api/luxpower');
const LuxpowerDongleClient = require('./src/api/dongle');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Disable ETag / caching on dynamic API telemetry endpoints so polling always receives fresh data
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

const client = new LuxpowerClient(process.env.LUX_BASE_URL || 'https://eu.luxpowertek.com');
const dongleClient = new LuxpowerDongleClient();
let cachedSerial = process.env.LUX_INVERTER_SN || null;
let cachedPlant = null;

// Verified external session cookies allowed to read owner's LAN dongle when matching inverter SN
const verifiedDongleCookies = new Map();
const COOKIE_VERIFY_TTL_MS = 12 * 60 * 60 * 1000;

function isExternalOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  try {
    const originHost = new URL(origin).hostname.toLowerCase();
    if (!originHost) return false;
    if (originHost === host || originHost === 'localhost' || originHost === '127.0.0.1') {
      return false;
    }
    if (process.env.APP_DOMAIN && originHost === process.env.APP_DOMAIN.toLowerCase()) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

function getClientForRequest(req) {
  const reqServer = req.headers['x-lux-server'];
  if (reqServer && reqServer.trim() && reqServer.trim().replace(/\/+$/, '') !== client.baseUrl) {
    return new LuxpowerClient(reqServer.trim());
  }
  return client;
}

async function isAuthorizedForDongle(req, customCookie, serial) {
  if (!dongleClient.isConfigured()) return false;
  const targetSerial = serial || (!isExternalOrigin(req) ? dongleClient.inverterSn : null);
  if (!targetSerial || targetSerial !== dongleClient.inverterSn) return false;
  if (!isExternalOrigin(req)) return true;
  if (!customCookie) return false;

  const expiresAt = verifiedDongleCookies.get(customCookie);
  if (expiresAt && Date.now() < expiresAt) return true;

  try {
    const reqClient = getClientForRequest(req);
    const check = await reqClient.getInverterRuntime(dongleClient.inverterSn, customCookie);
    if (check && check.success) {
      verifiedDongleCookies.set(customCookie, Date.now() + COOKIE_VERIFY_TTL_MS);
      return true;
    }
  } catch {
    // Cookie invalid or expired for this inverter
  }
  return false;
}

async function initLuxpower() {
  const account = process.env.LUX_ACCOUNT;
  const password = process.env.LUX_PASSWORD;
  if (!account || !password) {
    console.warn('⚠️ LUX_ACCOUNT / LUX_PASSWORD not set in .env');
    return;
  }
  try {
    const auth = await client.login(account, password);
    if (auth.deviceInfo && auth.deviceInfo.plants && auth.deviceInfo.plants.length > 0) {
      cachedPlant = auth.deviceInfo.plants[0];
      if (cachedPlant.inverters && cachedPlant.inverters.length > 0) {
        const inv = cachedPlant.inverters[0];
        cachedSerial = inv.serialNum;
        const tzMins = (Number(cachedPlant.timezoneHourOffset) || 0) * 60 + (Number(cachedPlant.timezoneMinuteOffset) || 0);
        dongleClient.setSerials({
          datalogSn: inv.datalogSn,
          inverterSn: inv.serialNum,
          timezoneOffsetMinutes: tzMins,
        });
      }
    }
    console.log(`✅ Luxpower connected. Default Inverter SN: ${cachedSerial}`);
  } catch (err) {
    console.error('❌ Failed to connect to Luxpower on startup:', err.message);
  }
}

function startDonglePolling() {
  if (!dongleClient.host) return;
  const poll = async () => {
    if (!dongleClient.isConfigured()) return;
    try {
      await dongleClient.pollSnapshot();
    } catch (err) {
      console.warn('⚠️ Dongle background poll failed:', err.message);
    }
  };
  setTimeout(poll, 1000);
  setInterval(poll, 15000);
}

function extractClientCookie(req) {
  const header = req.headers['x-lux-cookie'] || req.headers['authorization'];
  if (header) {
    return header.replace(/^Bearer\s+/i, '').trim();
  }
  return null;
}

function resolveSerial(req) {
  const explicit = req.query.serial || req.headers['x-lux-serial'];
  if (explicit) return explicit;
  if (isExternalOrigin(req)) return null;
  return cachedSerial || dongleClient.inverterSn;
}

// 0. Explicit Login endpoint for user authentication
app.post('/api/auth/login', async (req, res) => {
  try {
    const { account, password, server } = req.body;
    if (!account || !password) {
      return res.status(400).json({ success: false, error: 'Account and password required' });
    }
    const luxBase = (server && server.trim()) || process.env.LUX_BASE_URL || 'https://eu.luxpowertek.com';
    const tempClient = new LuxpowerClient(luxBase);
    const auth = await tempClient.login(account, password);

    if (!auth.cookie) {
      return res.status(401).json({ success: false, error: 'Authentication failed. Check credentials.' });
    }

    let userSerial = null;
    let plant = null;
    if (auth.deviceInfo && auth.deviceInfo.plants && auth.deviceInfo.plants.length > 0) {
      plant = auth.deviceInfo.plants[0];
      if (plant.inverters && plant.inverters.length > 0) {
        userSerial = plant.inverters[0].serialNum;
      }
    }

    if (dongleClient.inverterSn && userSerial === dongleClient.inverterSn) {
      verifiedDongleCookies.set(auth.cookie, Date.now() + COOKIE_VERIFY_TTL_MS);
    }

    res.json({
      success: true,
      account,
      cookie: auth.cookie,
      defaultSerial: userSerial,
      plant,
      deviceInfo: auth.deviceInfo,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1. System info / connection status
app.get('/api/status', async (req, res) => {
  const customCookie = extractClientCookie(req);
  const external = isExternalOrigin(req);

  if (external && !customCookie) {
    return res.json({
      connected: false,
      hasEnvCredentials: false,
      account: null,
      defaultSerial: null,
      dataSource: 'cloud',
      dongleEnabled: false,
      dongleConnected: false,
    });
  }

  const serial = resolveSerial(req);
  if (external && customCookie) {
    const dongleOk = await isAuthorizedForDongle(req, customCookie, serial);
    const dongleStatus = dongleOk ? dongleClient.getStatus() : { dongleEnabled: false, dongleConnected: false };
    return res.json({
      connected: true,
      hasEnvCredentials: false,
      account: null,
      defaultSerial: serial,
      dataSource: dongleStatus.dongleConnected ? 'dongle' : 'cloud',
      ...dongleStatus,
    });
  }

  const dongleStatus = dongleClient.getStatus();
  res.json({
    connected: !!(customCookie || client.cookie || dongleStatus.dongleConnected),
    hasEnvCredentials: !!(process.env.LUX_ACCOUNT && process.env.LUX_PASSWORD),
    account: process.env.LUX_ACCOUNT || null,
    defaultSerial: serial,
    plant: cachedPlant,
    deviceInfo: client.deviceInfo,
    dataSource: dongleStatus.dongleConnected ? 'dongle' : 'cloud',
    ...dongleStatus,
  });
});

// 2. Realtime runtime telemetry (Dongle LAN primary -> Cloud fallback)
app.get('/api/telemetry/live', async (req, res) => {
  try {
    const customCookie = extractClientCookie(req);
    if (isExternalOrigin(req) && !customCookie) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const serial = resolveSerial(req);
    const canUseDongle = await isAuthorizedForDongle(req, customCookie, serial);

    if (canUseDongle) {
      try {
        const dongleData = await dongleClient.getLiveTelemetry();
        return res.json(dongleData);
      } catch (dongleErr) {
        console.warn('⚠️ Dongle live read failed, falling back to cloud:', dongleErr.message);
      }
    }

    if (!serial) {
      return res.status(400).json({ error: 'No serial number available' });
    }
    const reqClient = getClientForRequest(req);
    const data = await reqClient.getInverterRuntime(serial, customCookie);
    res.json({ ...data, source: 'cloud' });
  } catch (err) {
    const status = err.status || (err.response?.status === 401 ? 401 : 500);
    res.status(status).json({ error: err.message });
  }
});

// 3. Day MultiLine Chart Data (Cloud history + newer Dongle points for today)
app.get('/api/telemetry/day-chart', async (req, res) => {
  const customCookie = extractClientCookie(req);
  if (isExternalOrigin(req) && !customCookie) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const serial = resolveSerial(req);
  const todayStr = dongleClient.getInverterTimeInfo().dateStr;
  const dateText = req.query.date || todayStr;
  const isToday = dateText === todayStr;
  const canUseDongle = isToday && (await isAuthorizedForDongle(req, customCookie, serial));

  if (canUseDongle && !dongleClient.cachedResult) {
    try {
      await dongleClient.pollSnapshot();
    } catch {
      // ignore if dongle offline
    }
  }
  const donglePoints = canUseDongle ? dongleClient.getTodayChartPoints(todayStr) : [];

  try {
    if (!serial) {
      return res.status(400).json({ error: 'No serial number available' });
    }
    const reqClient = getClientForRequest(req);
    const data = await reqClient.getDayChart(serial, dateText, customCookie);
    if (donglePoints.length > 0 && data && Array.isArray(data.data)) {
      const lastCloudTime = data.data.length > 0 ? data.data[data.data.length - 1].time : '';
      const newerPoints = donglePoints.filter((p) => !lastCloudTime || p.time > lastCloudTime);
      if (newerPoints.length > 0) {
        data.data = [...data.data, ...newerPoints];
      }
    }
    res.json(data);
  } catch (err) {
    if (donglePoints.length > 0 && err.status !== 401) {
      return res.json({ success: true, source: 'dongle', data: donglePoints });
    }
    const status = err.status || (err.response?.status === 401 ? 401 : 500);
    res.status(status).json({ error: err.message });
  }
});

// 4. Day detailed table data (Cloud history + newer Dongle rows for today)
app.get('/api/telemetry/table', async (req, res) => {
  const customCookie = extractClientCookie(req);
  if (isExternalOrigin(req) && !customCookie) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const serial = resolveSerial(req);
  const todayStr = dongleClient.getInverterTimeInfo().dateStr;
  const dateText = req.query.date || todayStr;
  const page = parseInt(req.query.page, 10) || 1;
  const rows = parseInt(req.query.rows, 10) || 500;
  const isToday = dateText === todayStr;
  const canUseDongle = isToday && page === 1 && (await isAuthorizedForDongle(req, customCookie, serial));

  if (canUseDongle && !dongleClient.cachedResult) {
    try {
      await dongleClient.pollSnapshot();
    } catch {
      // ignore if dongle offline
    }
  }
  const dongleRows = canUseDongle ? dongleClient.getTodayRows(todayStr) : [];

  try {
    if (!serial) {
      return res.status(400).json({ error: 'No serial number available' });
    }
    const reqClient = getClientForRequest(req);
    const data = await reqClient.getDayDataTable(serial, dateText, page, rows, customCookie);
    if (dongleRows.length > 0 && data && Array.isArray(data.rows)) {
      const newestCloudTime = data.rows.length > 0 ? data.rows[0].time : '';
      const newerRows = dongleRows.filter((r) => !newestCloudTime || r.time > newestCloudTime);
      if (newerRows.length > 0) {
        data.rows = [...newerRows, ...data.rows];
        if (typeof data.total === 'number') {
          data.total += newerRows.length;
        }
      }
    }
    res.json(data);
  } catch (err) {
    if (dongleRows.length > 0 && err.status !== 401) {
      return res.json({ total: dongleRows.length, rows: dongleRows, source: 'dongle' });
    }
    const status = err.status || (err.response?.status === 401 ? 401 : 500);
    res.status(status).json({ error: err.message });
  }
});

// Serve static frontend build if present
const clientDist = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const indexPath = path.join(clientDist, 'index.html');
  res.sendFile(indexPath, err => {
    if (err) {
      res.status(404).send('Frontend build not ready. Run frontend dev server.');
    }
  });
});

app.listen(PORT, async () => {
  console.log(`🚀 Gateway Server running on http://localhost:${PORT}`);
  await initLuxpower();
  startDonglePolling();
});
