# Luxpower Data Visualizer

A modern, high-precision web dashboard and telemetry visualization interface for **Luxpower** hybrid inverters (including SNA 5000 / SNA 6000 Wide PV and other Luxpowertek ecosystem units).

Live Demo: **[GitHub Pages](https://kirill-talk.github.io/luxpower-data-visualizer/)**

---

## ⚡️ Key Features

- **Interactive Power Flow Schematic**:
  - Real-time visualization of energy flow between Solar Panels (PV), Grid (220V), Inverter, Home Consumption, and Battery Storage (BESS LiFePO4).
  - Animated flow lines with unified semantic color palette:
    - **Consumption (Home Load)**: Amber (`#f59e0b`)
    - **Battery**: Emerald (`#10b981`) when charging, Rose (`#f43f5e`) when discharging
    - **Grid Import**: Rose (`#f43f5e`) during active import, Emerald when bypass / normal
    - **Inverter Consumption**: Purple (`#a855f7`)
  - Full interactive schematic for desktop displays (1200px+) and a streamlined mobile-first layout for phones and tablets.
- **Telemetry Instrument Strip (KPIs)**:
  - **Power Source Uptime Timer**: Real-time ticking stopwatch (`HH:MM:SS`) tracking continuous duration of current mode (*"On Battery"* vs *"On Grid"*), with cumulative 24-hour totals for each source.
  - **Estimated Battery Autonomy**: Projected remaining runtime (`~Xh Ym`) dynamically computed from the battery's real discharge burn-rate and home consumption, with an enforced **15% BMS cutoff threshold** (useful runtime strictly calculated down to BMS shutdown point).
  - **Estimated Time to Full Charge**: Real-time projected time until 100% battery charge with a realistic 2-stage charging model (bulk constant current charging up to 85%, and absorption power taper down to ~1 kW from 85% to 100%).
  - Complete state metrics: SOC %, battery charge/discharge wattage, current (A), pack voltage, heatsink/inverter temperatures.
- **Period Statistics & Energy Analytics**:
  - Period overview with quick filters (**1d**, **1w**, **1m**, or custom date range).
  - Aggregate metrics: Total Consumption, Total Grid Import, Total Battery Discharge, and Inverter Consumption.
  - **Dual-Tariff Electricity Cost Calculator**: Dynamic calculation for Ukrainian 2-zone power tariffs:
    - Night rate (23:00 – 06:59): **2.16 ₴ / kWh**
    - Day rate (07:00 – 22:59): **4.32 ₴ / kWh**
    - Financial breakdown for total grid import and internal inverter consumption costs.
  - Autonomy share indicators showing the percentage of load supplied by battery vs grid.
- **Client-Side High Performance Caching**:
  - **IndexedDB Persistent Cache**: Historical completed days are cached in local browser storage (`luxpower_db`), eliminating redundant network calls and making month/week loads instantaneous.
  - **Concurrency Pool with Auto-Retry**: Requests for missing historical dates are fetched in staggered batches (max 2 parallel requests with 60ms delay) to prevent Luxpower cloud rate-limiting.
- **24-Hour Energy Balance & Profiles**:
  - Interactive 24-hour area chart with brush/zoom selection to calculate integrated energy sums (kWh) over any custom period.
  - Comprehensive battery charts (SOC, charge/discharge current, BMS voltage, temperature).
  - Grid voltage and heatsink thermal monitoring.
- **Telemetry History & Logs**:
  - Full table with instant search and pagination covering 90+ inverter parameters.
  - One-click CSV telemetry export.
- **Cloud Authentication & GitHub Pages Ready**:
  - Automated login from `.env` credentials for dedicated host deployments.
  - On-screen modal login with server selection (`eu.luxpowertek.com`, `server.luxpowertek.com`, `us.luxpowertek.com`) and browser session storage (`localStorage`), ready for static hosting and serverless proxy configurations.
- **UX & Localization**:
  - Tab navigation: **Dashboard (Головна)**, **Consumption (Споживання)**, **Battery & BMS (Батарея та BMS)**, **Grid & Temperature (Мережа та Температура)**, **Telemetry Logs (Журнал телеметрії)**.
  - Full bilingual support with one-click toggle (**EN** / **UA**).
  - Native dark and light themes with smooth transitions.

---

## 🛠 Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, Apache ECharts, IndexedDB API.
- **Backend / Gateway**: Node.js, Express, Axios.
- **Serverless Proxy**: Cloudflare Worker (`cloudflare-worker/worker.js`).
- **Deployment**: Docker, Docker Compose, Traefik, GitHub Actions (GitHub Pages).

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/kirill-talk/luxpower-data-visualizer.git
cd luxpower-data-visualizer
```

### 2. Configure Environment (Optional)
Create a `.env` file in the project root if you want automatic login for a fixed inverter:
```env
LUX_BASE_URL=https://eu.luxpowertek.com
LUX_ACCOUNT=your_luxpower_login
LUX_PASSWORD=your_luxpower_password
PORT=3001
```
*If credentials are not set in `.env`, the dashboard will display a login button in the header, allowing users to authenticate via the modal dialog.*

### 3. Run with Docker Compose (Recommended)
```bash
docker compose up -d --build
```
Access the application at `http://localhost:3001` (or through your configured reverse proxy).

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

## 🌐 Deploying to GitHub Pages

This repository includes a preconfigured GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and publishes the React client to GitHub Pages on every push to `main`.

When hosted on GitHub Pages:
1. The app runs completely client-side.
2. User authentication and telemetry requests are routed through the serverless Cloudflare Worker (`https://luxpower-proxy.kirill-talk.workers.dev/api`).
3. Historical day charts are cached client-side in **IndexedDB**.
4. Credentials and session tokens are preserved securely in the user's browser `localStorage`.
5. No central backend or dedicated server is required!

---

## 📄 License

MIT License.
