# Cloudflare Worker for Luxpower Data Visualizer

A serverless proxy that forwards requests from your GitHub Pages frontend to the Luxpowertek Cloud API (`https://eu.luxpowertek.com`) with complete CORS and cookie support.

- **Cost**: 100% Free on Cloudflare Workers (up to 100,000 requests/day).
- **Maintenance**: Zero servers, zero maintenance.

---

## 🚀 Easy Setup (in 2 Minutes via Web Dashboard)

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left navigation, click **Compute (Workers & Pages)** -> **Create application** -> **Create Worker**.
3. Give it a name (for example: `luxpower-proxy`) and click **Deploy**.
4. Click **Edit code**.
5. Replace everything in `worker.js` with the contents of [`worker.js`](worker.js).
6. Click **Deploy**.
7. Copy your worker's public URL:
   `https://luxpower-proxy.<your-subdomain>.workers.dev`

---

## ⚡️ Alternative: Deploy via Wrangler CLI

If you have Node.js and Wrangler installed:
```bash
cd cloudflare-worker
npx wrangler login
npx wrangler deploy
```

---

## 🔗 Connecting to the Dashboard

In your GitHub Pages dashboard, open the **Sign In** modal and paste your worker URL into the **API Gateway / Proxy URL** field, or set it via `VITE_API_BASE_URL` in the build.
