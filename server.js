require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const LuxpowerClient = require('./src/api/luxpower');

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
let cachedSerial = null;
let cachedPlant = null;

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
        cachedSerial = cachedPlant.inverters[0].serialNum;
      }
    }
    console.log(`✅ Luxpower connected. Default Inverter SN: ${cachedSerial}`);
  } catch (err) {
    console.error('❌ Failed to connect to Luxpower on startup:', err.message);
  }
}

function extractClientCookie(req) {
  const header = req.headers['x-lux-cookie'] || req.headers['authorization'];
  if (header) {
    return header.replace(/^Bearer\s+/i, '').trim();
  }
  return null;
}

function resolveSerial(req) {
  return req.query.serial || req.headers['x-lux-serial'] || cachedSerial;
}

// 0. Explicit Login endpoint for user authentication
app.post('/api/auth/login', async (req, res) => {
  try {
    const { account, password } = req.body;
    if (!account || !password) {
      return res.status(400).json({ success: false, error: 'Account and password required' });
    }
    const tempClient = new LuxpowerClient(process.env.LUX_BASE_URL || 'https://eu.luxpowertek.com');
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
app.get('/api/status', (req, res) => {
  const customCookie = extractClientCookie(req);
  const serial = resolveSerial(req);
  res.json({
    connected: !!(customCookie || client.cookie),
    hasEnvCredentials: !!(process.env.LUX_ACCOUNT && process.env.LUX_PASSWORD),
    account: process.env.LUX_ACCOUNT || null,
    defaultSerial: serial,
    plant: cachedPlant,
    deviceInfo: client.deviceInfo,
  });
});

// 2. Realtime runtime telemetry
app.get('/api/telemetry/live', async (req, res) => {
  try {
    const customCookie = extractClientCookie(req);
    const serial = resolveSerial(req);
    if (!serial) {
      return res.status(400).json({ error: 'No serial number available' });
    }
    const data = await client.getInverterRuntime(serial, customCookie);
    res.json(data);
  } catch (err) {
    const status = err.status || (err.response?.status === 401 ? 401 : 500);
    res.status(status).json({ error: err.message });
  }
});

// 3. Day MultiLine Chart Data
app.get('/api/telemetry/day-chart', async (req, res) => {
  try {
    const customCookie = extractClientCookie(req);
    const serial = resolveSerial(req);
    const dateText = req.query.date || new Date().toISOString().slice(0, 10);
    if (!serial) {
      return res.status(400).json({ error: 'No serial number available' });
    }
    const data = await client.getDayChart(serial, dateText, customCookie);
    res.json(data);
  } catch (err) {
    const status = err.status || (err.response?.status === 401 ? 401 : 500);
    res.status(status).json({ error: err.message });
  }
});

// 4. Day detailed table data
app.get('/api/telemetry/table', async (req, res) => {
  try {
    const customCookie = extractClientCookie(req);
    const serial = resolveSerial(req);
    const dateText = req.query.date || new Date().toISOString().slice(0, 10);
    const page = parseInt(req.query.page, 10) || 1;
    const rows = parseInt(req.query.rows, 10) || 500;
    if (!serial) {
      return res.status(400).json({ error: 'No serial number available' });
    }
    const data = await client.getDayDataTable(serial, dateText, page, rows, customCookie);
    res.json(data);
  } catch (err) {
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
});
