# Vehicle Brain — Unified Dashboard

A single React SPA that brings all 8 backend phases together: Health Score,
Predictive Maintenance, Digital Twin, OBD Diagnostics, Knowledge Base (RAG),
Assistant, Trip Planner, and Driver Behaviour.

## Run locally (without Docker)

Start each phase's backend on its own port (see the root `docker-compose.yml`
for the exact port each one expects: 8002-8009), then:

```bash
npm install
npm run dev
```

Vite's dev-server proxy (`vite.config.js`) forwards `/api/phaseN/...` to
`localhost:800N`, mirroring how the gateway routes things in Docker — so the
same code works in both setups with zero changes.

## Run via Docker Compose (recommended)

From the repo root:

```bash
docker compose up --build
```

Then open **http://localhost:8080** — the nginx gateway serves this
dashboard and proxies every `/api/phaseN/...` call to the right backend
container, so there's no CORS configuration needed anywhere.

## Design

Dark, automotive-instrumentation aesthetic (the `Gauge` component in
`src/components/Gauge.jsx` is the signature element — a 270° instrument-
cluster arc reused everywhere a 0-100 score needs to read at a glance).
Tokens live in `tailwind.config.js`; global styles in `src/index.css`.
