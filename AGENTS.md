# AI Agent Context & Project Guidelines

This document provides essential context, architecture details, and runtime environments for AI agents working on the **Luxpower Data Visualizer** project.

---

## 🌐 Environments & Endpoints

| Environment | URL / Endpoint | Purpose / Description |
| :--- | :--- | :--- |
| **Dev Server (Self-hosted)** | `https://<APP_DOMAIN>/` | Self-hosted live environment managed via Docker Compose and Traefik reverse proxy (configured in `.env`). |
| **Dev API Base URL** | `https://<APP_DOMAIN>/api` | Direct API endpoint on the dev server for telemetry, authentication, and status. |
| **GitHub Pages (Production)** | `https://kirill-talk.github.io/luxpower-data-visualizer/` | Standalone static SPA frontend deployed via GitHub Actions from `main`. |
| **Cloudflare Worker Proxy** | `https://luxpower-proxy.kirill-talk.workers.dev/api` | Stateless CORS proxy and automatic fallback endpoint for static deployments. |
| **Local Docker Port** | `http://localhost:3001` | Local containerized backend server (`compose.yaml`). |
| **Local Dev Client** | `http://localhost:5173` | Local Vite dev server (`client/`). |

---

## 🏗 Architecture & Components

```
├── src/
│   └── api/
│       ├── dongle.js           # Strict Read-Only LAN TCP client (0x04 Input Registers, rolling buffer)
│       └── luxpower.js         # Luxpowertek Cloud HTTP client with auto re-authentication
├── client/                     # Frontend SPA (React 18, Vite, Tailwind CSS, ECharts)
│   ├── src/
│   │   ├── App.jsx             # Main application state, 15s live polling, 6m history sync, KPIs
│   │   ├── components/         # UI Components (PowerFlowDiagram, Charts, DataTable, AuthModal, mobile/)
│   │   └── utils/
│   │       ├── config.js       # API Base URL resolution, 5s timeout & Cloudflare Worker failover
│   │       ├── energyMath.js   # Energy integration, uptime/autonomy, dynamic cycles & SOH
│   │       ├── i18n.js         # Dual-language dictionary (EN / UA)
│   │       └── telemetryCache.js # IndexedDB persistent day-chart cache & concurrency pool
│   └── vite.config.js          # Handles VITE_BASE_PATH and local /api dev proxy
├── server.js                   # Node.js Express Gateway Backend (Hybrid Dongle + Cloud & multi-user isolation)
├── cloudflare-worker/          # Serverless Worker Proxy for static deployments
│   └── worker.js               # Stateless CORS proxy handling auth and telemetry forwarding
├── compose.yaml                # Docker Compose config with Traefik routing (${APP_DOMAIN})
├── .github/workflows/deploy.yml# Automated SPA build & deploy workflow
├── .env.example                # Template for environment variables
└── .env                        # Local credentials, dongle IP/serials & APP_DOMAIN (ignored by Git)
```

---

## 🔑 Authentication, Dongle & API Behavior

1. **Self-hosted / Docker Hybrid Mode (`server.js` + `src/api/dongle.js`)**:
   - **Direct LAN Dongle Polling (Strict Read-Only)**: When `LUX_DONGLE_HOST`, `LUX_DONGLE_SN`, and `LUX_INVERTER_SN` are configured in `.env`, `LuxpowerDongleClient` polls TCP port `8000` every 15 seconds using **only** Modbus function `0x04` (`Read Input Registers`) for banks `0..119`. Holding register reads (`0x03`) and writes (`0x06`/`0x10`) are never implemented.
   - **Rolling Daily Buffer**: `dongle.js` records snapshots in memory every 60s (table rows), every 5m (chart points), and immediately on Grid ↔ EPS transitions, merging newer points with Luxpower Cloud data for today's `/api/telemetry/table` and `/api/telemetry/day-chart`.
   - **Cloud Session**: `server.js` also logs into Luxpowertek Cloud (`https://eu.luxpowertek.com`) on startup using `.env` credentials (`LUX_ACCOUNT`, `LUX_PASSWORD`) to serve historical data and provide `/api/telemetry/live` fallback if the dongle is unreachable.
   - **Multi-User & Cross-Origin Isolation**: Requests from external origins (e.g., `github.io`) without `x-lux-cookie` receive `connected: false, hasEnvCredentials: false` on `/api/status` and `401` on `/api/telemetry/*`, requiring authentication. External authenticated requests for another user's inverter proxy directly to Luxpower Cloud without accessing the owner's dongle; external requests matching the owner's inverter SN only access the dongle after verifying the cookie against Luxpower Cloud.
   - **Important**: Docker Compose does not reload `.env` on simple `restart`. If `.env` changes, recreate the container:
     ```bash
     docker compose down && docker compose up -d --build
     ```

2. **Serverless / Failover Mode (`client/src/utils/config.js` + `cloudflare-worker/worker.js`)**:
   - `apiFetch()` applies a `5000ms` `AbortController` timeout on the primary API URL and automatically fails over to `VITE_FALLBACK_API_URL` / `https://luxpower-proxy.kirill-talk.workers.dev/api` on network/timeout errors or `HTTP >= 500` responses (with a 60s cooldown).
   - The Cloudflare Worker is stateless: `POST /api/auth/login` returns session cookies (`JSESSIONID`) and `defaultSerial`; the frontend stores credentials in `localStorage` and sends `x-lux-cookie`, `x-lux-serial`, and optional `x-lux-server`.

---

## 📊 Core Features & Domain Rules

- **Power Flow Schematic**:
  - Live animated power flow: Solar PV, Grid, Inverter, Battery, Home Consumption.
  - Colors: Consumption = Amber (`#f59e0b`), Battery Charge = Emerald (`#10b981`), Battery Discharge / Grid Import = Rose (`#f43f5e`), Inverter = Purple (`#a855f7`).
- **Dynamic Battery Health (`calculateBatteryHealth` in `client/src/utils/energyMath.js`)**:
  - For the owner's dual-module pack (when dongle telemetry is active and `bmsCycleCnt` is `0`), computes per-module cycles and SOH (`B1` / `B2` tooltip on the battery card title).
  - For other users or cloud-only fallback, computes generic LiFePO4 pack cycles (`bmsCycleCnt` or `eDisChgAll / packKwh`) and SOH dynamically.
- **Power Source Uptime & Battery Autonomy**:
  - Ticking timer tracking continuous time on battery vs on grid.
  - Estimated autonomy dynamically calculated based on discharge rate since grid disconnection.
- **Languages**: Dual-language support (English `en` and Ukrainian `ua`).
- **Telemetry Endpoints**:
  - `/api/status`: Connection state, `dataSource` (`dongle` | `cloud`), and dongle sync status (never exposes LAN IP/dongle SN).
  - `/api/telemetry/live`: Real-time inverter snapshot (dongle primary -> cloud fallback), polled every 15s on the frontend.
  - `/api/telemetry/day-chart`: 24-hour balance profile (cloud + newer dongle points for today).
  - `/api/telemetry/table`: Historical parameter logs (cloud + newer dongle rows for today).

---

## 🛠 Commands Reference

- **Run Dev Frontend**: `cd client && npm run dev`
- **Build Frontend**: `cd client && npm run build`
- **Run Backend Locally**: `npm run dev`
- **Manage Docker**: `docker compose down && docker compose up -d --build`
- **View Docker Logs**: `docker compose logs -f app`
