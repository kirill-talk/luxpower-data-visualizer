# AI Agent Context & Project Guidelines

This document provides essential context, architecture details, and runtime environments for AI agents working on the **Luxpower Data Visualizer** project.

---

## 🌐 Environments & Endpoints

| Environment | URL / Endpoint | Purpose / Description |
| :--- | :--- | :--- |
| **Dev Server (Self-hosted)** | `https://data-visualizer.kidev.uk/` | Self-hosted live environment managed via Docker Compose and Traefik reverse proxy. |
| **Dev API Base URL** | `https://data-visualizer.kidev.uk/api` | Direct API endpoint on the dev server for telemetry, authentication, and status. |
| **GitHub Pages (Production)** | `https://kirill-talk.github.io/luxpower-data-visualizer/` | Static SPA frontend deployed automatically via GitHub Actions from `main`. |
| **Cloudflare Worker Proxy** | `https://luxpower-proxy.kirill-talk.workers.dev/api` | Serverless CORS proxy used by GitHub Pages to interact directly with Luxpowertek Cloud. |
| **Local Docker Port** | `http://localhost:3001` | Local containerized backend server (`compose.yaml`). |
| **Local Dev Client** | `http://localhost:5173` | Local Vite dev server (`client/`). |

---

## 🏗 Architecture & Components

```
├── client/                     # Frontend SPA (React 18, Vite, Tailwind CSS, ECharts)
│   ├── src/
│   │   ├── components/         # UI Components (PowerFlow, BatteryDetails, Charts, AuthModal, etc.)
│   │   ├── utils/config.js     # API Base URL resolution (localStorage, dev detection, fallback)
│   │   └── api/                # API client calling /api/* endpoints
│   └── vite.config.js          # Handles VITE_BASE_PATH (set to /luxpower-data-visualizer/ on GH Pages)
├── server.js                   # Node.js Express Gateway Backend (manages Luxpower session & polling)
├── cloudflare-worker/          # Serverless Worker Proxy for static deployments (GitHub Pages)
│   └── worker.js               # Stateless CORS proxy handling auth and telemetry forwarding
├── compose.yaml                # Docker Compose config with Traefik routing
├── .github/workflows/deploy.yml# GitHub Pages CI/CD workflow
└── .env                        # Local credentials for Luxpower cloud (ignored by Git)
```

---

## 🔑 Authentication & API Behavior

1. **Self-hosted / Docker Mode**:
   - `server.js` maintains a persistent session with Luxpowertek Cloud (`https://eu.luxpowertek.com`).
   - If credentials are set in `.env` (`LUX_ACCOUNT`, `LUX_PASSWORD`), the server automatically logs in upon startup.
   - The frontend queries `/api/status` to check connection state. If `.env` credentials are present, no login prompt is required.
   - **Important**: Docker Compose does not reload `.env` on simple `restart`. If `.env` changes, recreate the container:
     ```bash
     docker compose down && docker compose up -d
     ```

2. **Serverless / GitHub Pages Mode**:
   - The frontend talks to `https://luxpower-proxy.kirill-talk.workers.dev/api` (or a custom URL configured by user).
   - The Cloudflare Worker is stateless:
     - `POST /api/auth/login` returns session cookies (`JSESSIONID`) and default inverter serial.
     - Frontend stores credentials/cookie in browser `localStorage`.
     - Subsequent requests include headers: `x-lux-cookie`, `x-lux-serial`, and optional `x-lux-server`.

---

## 📊 Core Features & Domain Rules

- **Power Flow Schematic**:
  - Live animated power flow: Solar PV, Grid, Inverter, Battery, Home Consumption.
  - Colors: Consumption = Amber (`#f59e0b`), Battery Charge = Emerald (`#10b981`), Battery Discharge / Grid Import = Rose (`#f43f5e`), Inverter = Purple (`#a855f7`).
- **Power Source Uptime & Battery Autonomy**:
  - Ticking timer tracking continuous time on battery vs on grid.
  - Estimated autonomy dynamically calculated based on discharge rate since grid disconnection.
- **Languages**: Dual-language support (English `en` and Ukrainian `ua`).
- **Telemetry Endpoints**:
  - `/api/telemetry/live`: Real-time inverter snapshot.
  - `/api/telemetry/day-chart`: 24-hour balance profile and energy integrals.
  - `/api/telemetry/table`: Historical parameter logs with pagination and search.

---

## 🛠 Commands Reference

- **Run Dev Frontend**: `cd client && npm run dev`
- **Build Frontend**: `cd client && npm run build`
- **Run Backend Locally**: `npm run dev`
- **Manage Docker**: `docker compose down && docker compose up -d`
- **View Docker Logs**: `docker compose logs -f app`
