# Luxpower Data Visualizer

A modern, high-precision web dashboard and telemetry visualization interface for **Luxpower** hybrid inverters (including SNA 5000 / SNA 6000 Wide PV and other Luxpowertek ecosystem units).

Live Instance: **[data-visualizer.kidev.uk](https://data-visualizer.kidev.uk/)**

---

## ⚡️ Key Features

- **Interactive Power Flow Schematic**:
  - Real-time visualization of energy flow between Solar Panels (PV), Grid (220V), Inverter, Home Consumption, and Battery Storage (BESS LiFePO4).
  - Animated flow lines with unified semantic color palette:
    - **Consumption (Home Load)**: Amber (`#f59e0b`)
    - **Battery**: Emerald (`#10b981`) when charging, Rose (`#f43f5e`) when discharging
    - **Grid Import**: Rose (`#f43f5e`) during active import, Emerald when bypass / normal
    - **Inverter & Losses**: Purple (`#a855f7`)
  - Full interactive view for desktop displays (1200px+) and a streamlined mobile-first layout for phones and tablets (<1200px).
- **Telemetry Instrument Strip (KPIs)**:
  - **Power Source Uptime Timer**: Real-time ticking stopwatch (`HH:MM:SS`) tracking continuous duration of current mode (*"On Battery"* vs *"On Grid"*), with cumulative 24-hour totals for each source.
  - **Estimated Battery Autonomy**: Projected remaining runtime (`~Xh Ym`) dynamically computed from the battery's real discharge burn-rate and home consumption since the outage began.
  - Complete state metrics: SOC %, battery charge/discharge wattage, current (A), pack voltage, heatsink/inverter temperatures.
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
  - Full bilingual support with one-click toggle (**EN** / **UA**).
  - Native dark and light themes with smooth transitions.

---

## 🛠 Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, Apache ECharts.
- **Backend / Gateway**: Node.js, Express, Axios.
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
Access the application at `http://localhost:3000` (or through your configured reverse proxy).

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
3. Credentials and session tokens are preserved securely in the user's browser `localStorage`.
4. No central backend or dedicated server is required!

---

## 📄 License

MIT License.
