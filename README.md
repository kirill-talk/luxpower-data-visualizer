# Luxpower Data Visualizer

A modern, high-precision web dashboard and telemetry visualization interface for **Luxpower** hybrid inverters (including SNA 5000 / SNA 6000 Wide PV and other Luxpowertek ecosystem units), supporting **hybrid LAN Wi-Fi dongle + Luxpower Cloud** telemetry and standalone multi-user access.

Live Demo: **[GitHub Pages](https://kirill-talk.github.io/luxpower-data-visualizer/)**

---

## ⚡️ Key Features

- **Hybrid LAN Dongle + Cloud Telemetry**:
  - **Direct Read-Only Dongle Polling**: Connects directly to the Luxpower Wi-Fi dongle over LAN (TCP port `8000`) every 15 seconds for low-latency live power, SOC, voltage, BMS current, and cumulative energy counters — even during internet outages.
  - **Automatic Proxy Failover**: Frontend requests apply a 5-second timeout and automatically fail over to the stateless Cloudflare Worker proxy on network errors, timeouts, or `HTTP >= 500` responses, enabling standalone cloud access for any user.
  - **Multi-User Isolation**: External requests from static origins require valid Luxpower session cookies (`x-lux-cookie`); only verified owner sessions matching the configured inverter SN access local dongle acceleration, while all other users proxy directly to Luxpower Cloud for their own inverters.
- **Interactive Power Flow Schematic**:
  - Real-time visualization of energy flow between Solar Panels (PV), Grid (220V), Inverter, Home Consumption, and Battery Storage.
  - Animated flow lines with unified semantic color palette:
    - **Consumption (Home Load)**: Amber (`#f59e0b`)
    - **Battery**: Emerald (`#10b981`) when charging, Rose (`#f43f5e`) when discharging
    - **Grid Import**: Rose (`#f43f5e`) during active import, Emerald when bypass / normal
    - **Inverter Consumption**: Purple (`#a855f7`)
  - Full interactive schematic for desktop displays (`1200px+`) and a streamlined mobile-first layout for phones and tablets.
- **Dynamic Battery Health & Autonomy Analytics**:
  - **Dynamic Cycle & SOH Calculation (`calculateBatteryHealth`)**: Tracks cumulative discharge (`eDisChgAll`) and BMS cycle counts (`bmsCycleCnt`) to estimate full equivalent cycles and State of Health (SOH), including module-level breakdown (`B1` / `B2` tooltip) for expanded dual-module packs and generic LiFePO4 pack support for any user.
  - **Power Source Uptime Timer**: Real-time ticking stopwatch (`HH:MM:SS`) tracking continuous duration of current mode (*"On Battery"* vs *"On Grid"*), with cumulative 24-hour totals for each source.
  - **Estimated Battery Autonomy & Charge Time**: Projected remaining runtime down to a **15% BMS cutoff threshold**, plus 2-stage charge completion estimation (bulk up to 85% SOC, absorption taper from 85% to 100%).
- **Period Statistics & Energy Analytics**:
  - Period overview with quick filters (**1d**, **1w**, **1m**, or custom date range).
  - Aggregate metrics: Total Consumption, Total Grid Import, Total Battery Discharge, and Inverter Consumption.
  - **Dual-Tariff Electricity Cost Calculator**: Dynamic calculation for 2-zone power tariffs:
    - Night rate (23:00 – 06:59): **2.16 ₴ / kWh**
    - Day rate (07:00 – 22:59): **4.32 ₴ / kWh**
- **Client-Side High Performance Caching**:
  - **IndexedDB Persistent Cache**: Completed historical days are cached in browser `IndexedDB` (`luxpower_db`), eliminating redundant requests.
  - **Concurrency Pool with Auto-Retry**: Missing historical dates are fetched in staggered batches (max 2 parallel requests, 60ms delay).
- **24-Hour Energy Balance, Charts & Logs**:
  - Interactive 24-hour power balance chart with brush/zoom integration, battery SOC/voltage/current/temperature charts, grid stability charts, and a searchable 90+ column telemetry log with CSV export.
- **UX & Localization**:
  - Tab navigation: **Dashboard**, **Consumption**, **Battery & BMS**, **Grid & Temperature**, **Telemetry Logs**.
  - Bilingual (**EN** / **UA**) with light & dark themes.

---

## 🛠 Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, Apache ECharts, IndexedDB API.
- **Backend / Gateway**: Node.js, Express, Axios, TCP Modbus client (`src/api/dongle.js`).
- **Serverless Proxy**: Cloudflare Worker (`cloudflare-worker/worker.js`).
- **Deployment**: Docker, Docker Compose, Traefik.

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/kirill-talk/luxpower-data-visualizer.git
cd luxpower-data-visualizer
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your Luxpower Cloud credentials (and optional LAN dongle settings):
```bash
cp .env.example .env
```
```env
LUX_BASE_URL=https://eu.luxpowertek.com
LUX_ACCOUNT=your_luxpower_login
LUX_PASSWORD=your_luxpower_password
PORT=3001
```
*If credentials are not set in `.env`, the dashboard will prompt users to sign in via the login modal.*

### 3. Run with Docker Compose (Recommended)
```bash
docker compose up -d --build
```
Access the application at `http://localhost:3001` (or through your configured Traefik reverse proxy domain via `APP_DOMAIN`).

### 4. Local Development

**Backend API:**
```bash
npm install
npm run dev
```

**Frontend:**
```bash
cd client
npm install
npm run dev
```

---

## 📡 Direct LAN Wi-Fi Dongle Setup (Read-Only Hybrid Mode)

For self-hosted deployments on the same local network as your Luxpower Wi-Fi dongle, the backend can poll live inverter telemetry directly over TCP port `8000` instead of waiting for 2–6 minute cloud upload intervals.

### 1. Reserve a Static LAN IP on Your Router
In your router's DHCP settings, bind the MAC address of your Luxpower Wi-Fi dongle (e.g., `DG...` / `ESP_...`) to a static local IP address (for example, `192.168.0.x`) so the IP never changes after router or power restarts.

### 2. Add Dongle Variables to `.env`
`.env` is excluded by `.gitignore` so your network IP and serial numbers stay out of Git:
```env
# Local Wi-Fi Dongle (Strict Read-Only LAN Telemetry)
LUX_DONGLE_HOST=192.168.0.x
LUX_DONGLE_PORT=8000
LUX_DONGLE_SN=YOUR_DONGLE_SN
LUX_INVERTER_SN=YOUR_INVERTER_SN
```
*(Optional: set `LUX_TIMEZONE_OFFSET=2` if cloud login is disabled; otherwise the inverter timezone is auto-detected from Luxpower plant metadata.)*

Recreate the Docker container to load updated `.env` values:
```bash
docker compose down && docker compose up -d --build
```

### 3. Strict Read-Only Guarantee
The LAN client ([`src/api/dongle.js`](src/api/dongle.js)) implements **only** Modbus function `0x04` (**Read Input Registers**) across telemetry banks `0..119` (`0–39`, `40–79`, `80–119`) with CRC-16 validation. Holding register reads (`0x03`) and all write commands (`0x06`, `0x10`) are intentionally omitted — inverter configuration cannot be modified.

### 4. How Hybrid Data Routing Works
- **`GET /api/telemetry/live`**: Reads cached dongle registers (polled every 15 seconds in the background) for real-time power, SOC, voltage, BMS current (`bmsBatCurrent`), temperatures, daily counters (`eChgDay`, `eDisChgDay`, `eEpsDay`, `eToUserDay`), and lifetime counters (`eChgAll`, `eDisChgAll`). If the dongle is unreachable, it automatically falls back to Luxpower Cloud.
- **`GET /api/telemetry/table` & `GET /api/telemetry/day-chart`**: Fetches historical curves/tables from Luxpower Cloud and merges newer rolling points recorded in memory from the dongle (sampled every 60s for table rows, every 5m for chart points, and immediately on Grid ↔ EPS state transitions). If the cloud is unreachable during an internet outage, today's locally recorded dongle points are still served.

---

## 📄 License

MIT License.
