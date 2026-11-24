# AI Client Hunter — Production Deployment Preparation Audit

**Date:** 24 November 2026  
**Auditor:** Senior Full-Stack Engineer & Security Auditor  
**Scope:** Phase 20 Stage 4 Verification & Production Deployment Preparation  
**Target Infrastructure:**  
- **Frontend:** Vercel (Single Page Application, React + Vite)  
- **Backend:** Render Web Service (Node.js + Express, 0.0.0.0 binding)  
- **Database:** Managed PostgreSQL (Render Managed DB / AWS RDS / Supabase)  
- **ORM:** Prisma 5.x (PostgreSQL adapter, strictly managed migrations)

---

## 1. Executive Summary

A comprehensive deployment readiness audit was performed on the **AI Client Hunter** workspace to prepare the repository for production deployment to **Vercel** and **Render**.

All 16 deployment audit objectives were investigated, verified, and resolved. Zero functional code was rewritten unnecessarily; only verified production deployment blockers were corrected. All 27 existing database tables, 18 leads, 17 pitches, 12 audits, 1 discovery-source row, and 2 daily reports remain protected with zero data loss. Automated test suites pass at 100% (16/16 client tests, 113/113 active server tests), TypeScript typechecks pass cleanly across both client and server with 0 errors, and both client and server production builds complete successfully.

---

## 2. Monorepo Architecture & Directory Inventory

The workspace is structured as an npm workspaces monorepo:

```
D:\AI ASSISTANT-SK\
├── client/                     # Frontend Application (React 18 + Vite + Tailwind CSS)
│   ├── src/
│   │   ├── api/client.ts       # Axios API client (configured for dynamic VITE_API_URL)
│   │   ├── components/         # UI Components (BusinessIntelligence, CRM, Leads, etc.)
│   │   ├── vite-env.d.ts       # TypeScript environment declarations
│   ├── package.json
│   ├── tsconfig.json
│   ├── vercel.json             # Vercel SPA rewrites configuration
│   └── vite.config.ts
├── server/                     # Backend Application (Node.js + Express + Prisma)
│   ├── src/
│   │   ├── index.ts            # Entrypoint (0.0.0.0 binding, PORT, health check, CORS)
│   │   ├── config.ts           # Centralized environment variable validation
│   │   ├── routes/             # Express API routers (analytics, leads, discovery, etc.)
│   │   └── services/           # Business logic & provider adapters
│   ├── package.json
│   └── tsconfig.json
├── prisma/
│   ├── schema.prisma           # Prisma 5.x schema defining 27 models
│   └── migrations/             # 13 verified, linear SQL migrations
├── render.yaml                 # Render Blueprint (Infrastructure-as-Code)
├── vercel.json                 # Root Vercel project configuration
├── package.json                # Monorepo root package.json (workspaces: client, server)
├── .gitignore                  # Git exclusion rules (secrets, dist, node_modules, dumps)
└── reports/                    # Historical phase audits and deployment reports
```

### Verified Root Directories:
- **Frontend Root:** `client/`
- **Backend Root:** `server/`
- **Database Migrations:** `prisma/migrations/`
- **Distribution Outputs:** `client/dist/` (client bundle), `server/dist/` (server transpiled JavaScript)

---

## 3. Package Scripts & Production Build Verification

The root `package.json` coordinates both workspaces:

```json
{
  "name": "ai-client-hunter-workspace",
  "private": true,
  "workspaces": ["server", "client"],
  "scripts": {
    "build": "npm run build --workspace=server && npm run build --workspace=client",
    "build:server": "npm run build --workspace=server",
    "build:client": "npm run build --workspace=client",
    "start": "npm run start --workspace=server",
    "typecheck": "npm run typecheck --workspace=server && npm run typecheck --workspace=client",
    "test": "npm run test --workspace=server && npm run test --workspace=client"
  }
}
```

### Build Commands Verified:
1. **Server Build (`npm run build:server`):**
   - Command: `tsc` within `server/`.
   - Result: Emits JavaScript into `server/dist/` with zero TypeScript compiler diagnostics.
2. **Client Build (`npm run build:client`):**
   - Command: `tsc && vite build` within `client/`.
   - Result: Emits production HTML, CSS, and JS into `client/dist/` with zero type errors.
3. **Monorepo Build (`npm run build`):**
   - Executes both builds in sequence cleanly.

---

## 4. Server Binding, Port Handling & Proxy Trust (Render)

### Port & Address Binding
In `server/src/index.ts`:
- The server reads `config.PORT || 5000`. Render injects `PORT=10000`.
- In production (`NODE_ENV === 'production'`), the server explicitly binds to `0.0.0.0`:
  ```typescript
  const host = config.NODE_ENV === 'production' ? '0.0.0.0' : undefined;
  app.listen(PORT, host, () => {
    logger.info(`Server listening on ${host || 'localhost'}:${PORT}`);
  });
  ```
  This prevents Render deployment timeouts caused by binding exclusively to `127.0.0.1` or `localhost`.

### Reverse Proxy Hops (`trust proxy`)
Render web services terminate TLS at an edge reverse proxy and forward traffic to the container. `server/src/index.ts` configures:
```typescript
if (config.NODE_ENV === 'production') {
  app.set('trust proxy', config.TRUST_PROXY_HOPS || 1);
}
```
This ensures:
- `req.ip` reflects the true client IP from `X-Forwarded-For`.
- Rate limiting (`express-rate-limit`) applies per actual client IP, preventing rate limit collisions across different users behind the Render proxy.

---

## 5. Health Check & Database Readiness Endpoint

### Health Endpoint (`GET /api/health`)
- Located in `server/src/index.ts`.
- Validates database connectivity by issuing an active query `SELECT 1` through Prisma.
- Status responses:
  - When database is healthy: returns HTTP 200 with `{ status: 'ok', database: 'connected', timestamp: ... }`.
  - In production, if database connectivity is broken: returns HTTP 503 with `{ status: 'error', database: 'disconnected' }`.
- Configured in `render.yaml` under `healthCheckPath: /api/health` for automated zero-downtime rolling deploys and health monitoring.

### Bootstrap Startup Guard
In `server/src/index.ts`, the `bootstrap()` function validates database connectivity and Prisma schema readiness before calling `app.listen()`. If database migrations are pending or the database is unreachable, the server refuses to accept traffic and logs the exact error, preventing half-operational deployments.

---

## 6. Prisma Database Migrations & Safe Deployment Sequence

### Migration Audit
- The repository contains 13 linear, committed SQL migrations in `prisma/migrations/`.
- The most recent migration (`20261124010000_business_reports/migration.sql`) establishes the immutable `BusinessReport` table with PostgreSQL update/delete prevention triggers and integrity indexes.

### Safe Production Migration Execution Rule
- **NEVER** run `prisma db push` or `prisma migrate dev` in staging or production.
- Production deployments must strictly execute:
  ```bash
  npx prisma migrate deploy
  ```
- This command applies only pending migrations without generating schema drift or dropping columns/tables.
- Configured in `render.yaml` as the `preDeployCommand`:
  ```yaml
  preDeployCommand: npx prisma migrate deploy
  ```
  Render runs this step before swapping the new container version into the live routing mesh. If a migration fails, the deployment halts safely without terminating the previous running container.

---

## 7. Environment Variables Inventory

### Backend Required Environment Variables (Render Web Service)

| Variable | Required | Example / Default | Description | Secret? |
| --- | :---: | --- | --- | :---: |
| `NODE_ENV` | Yes | `production` | Enables production security mode and binds 0.0.0.0 | No |
| `PORT` | Yes | `10000` | Injected automatically by Render | No |
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/dbname` | Managed PostgreSQL connection string | **YES** |
| `API_SECRET` | Yes | `[64-character hex or alphanumeric]` | Secret token for workspace authentication | **YES** |
| `CORS_ORIGIN` | Yes | `https://ai-client-hunter.vercel.app` | Allowed frontend origin(s) | No |
| `APP_PUBLIC_URL` | Yes | `https://ai-client-hunter-api.onrender.com` | Public URL of Render web service | No |
| `TRUST_PROXY_HOPS`| Yes | `1` | Number of upstream proxy hops | No |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` (15 min) | Rate limiter sliding window | No |
| `RATE_LIMIT_MAX` | No | `100` | Max requests per IP per window | No |
| `GEMINI_API_KEY` | Optional | `[Google Gemini API Key]` | Backend Gemini generative model access | **YES** |
| `GEMINI_MODEL` | No | `gemini-3.8-flash` | Selected Gemini model | No |
| `GOOGLE_PLACES_API_KEY` | Optional | `[Google Places API Key]` | Google Places New API access | **YES** |
| `SERPAPI_API_KEY` | Optional | `[SerpApi Key]` | SerpApi Google search engine access | **YES** |
| `OSM_OVERPASS_DAILY_REQUEST_LIMIT` | Yes | `0` | Hard disable for OpenStreetMap Overpass | No |
| `DISCOVERY_EXTERNAL_ALERTS_ENABLED`| Yes | `false` | Hard disable for external outreach alerts | No |

### Frontend Required Environment Variables (Vercel Project)

| Variable | Required | Example | Description | Secret? |
| --- | :---: | --- | --- | :---: |
| `VITE_API_URL` | Yes | `https://ai-client-hunter-api.onrender.com/api` | Full URL to Render backend API | No |

> [!IMPORTANT]
> Frontend environment variables prefixed with `VITE_` are embedded into public client JavaScript bundles. **NEVER** expose `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`, `SERPAPI_API_KEY`, `API_SECRET`, or `DATABASE_URL` as `VITE_` variables.

---

## 8. Frontend `VITE_API_URL` & Localhost Dependency Removal

### Blocker Identified & Resolved
Previously, `client/src/api/client.ts` defaulted to `/api` without checking `import.meta.env.VITE_API_URL`. Under Vercel deployment where the frontend domain (`ai-client-hunter.vercel.app`) differs from the backend domain (`ai-client-hunter-api.onrender.com`), requests to `/api` would route to Vercel's serverless edge and return 404s.

### Fix Implemented
In `client/src/api/client.ts`:
```typescript
const envApiUrl = 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_API_URL) ||
  '';

const baseURL = envApiUrl
  ? (envApiUrl.endsWith('/api') ? envApiUrl : `${envApiUrl.replace(/\/+$/, '')}/api`)
  : '/api';

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});
```
- In development: when `VITE_API_URL` is omitted, requests use Vite's local dev server proxy at `/api`.
- In production: when `VITE_API_URL=https://ai-client-hunter-api.onrender.com/api` is configured in Vercel, requests dispatch directly to the Render backend service.
- Added `client/src/vite-env.d.ts` declaring `VITE_API_URL` on `ImportMetaEnv` to maintain strict TypeScript compilation compliance.

---

## 9. CORS Architecture & Multi-Origin Support

In `server/src/index.ts`:
```typescript
const allowedOrigins = (config.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-workspace-token', 'X-Requested-With'],
}));
```
- Supports comma-separated origins, allowing staging, production, and preview URLs:  
  `CORS_ORIGIN="https://ai-client-hunter.vercel.app,https://ai-client-hunter-preview.vercel.app"`
- Allows standard credentials (`withCredentials: true`) and workspace authentication tokens.

---

## 10. SPA Routing & Vercel Configuration

Because the client is a Single Page Application using client-side routing, direct visits or refreshes to nested routes (e.g., `/reports`, `/leads`, `/intelligence`) would result in a 404 unless routed to `/index.html`.

### Configurations Added:
1. **Root `vercel.json`**:
   ```json
   {
     "$schema": "https://openapi.vercel.sh/vercel.json",
     "buildCommand": "npm run build:client",
     "outputDirectory": "client/dist",
     "rewrites": [
       {
         "source": "/(.*)",
         "destination": "/index.html"
       }
     ]
   }
   ```
2. **Client `client/vercel.json`**:
   Ensures seamless builds whether Vercel is connected to the monorepo root or to the `client/` subdirectory.

---

## 11. Security & Isolation Audit

1. **Secret Scanning:**
   - Audited `.gitignore`: line 44 ignores `.env`, `.env.local`, `server/.env`, and `client/.env`.
   - Verified via `git check-ignore -v .env` that local environment secrets are strictly ignored.
   - Audited 41 frontend bundle files emitted in `client/dist/`: confirmed zero presence of `API_SECRET`, `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`, or `DATABASE_URL`.
2. **SSRF & Network Boundary Protection:**
   - `server/src/services/websiteAudit.ts` enforces private IP, loopback, and cloud metadata blocking (`169.254.169.254`, `127.0.0.1`, `::1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
   - Audit fetches cannot be weaponized against internal Render services or cloud provider metadata endpoints.
3. **Authentication & Production Bypass Prevention:**
   - In production (`NODE_ENV === 'production'`), fallback development authentication bypasses are disabled.
   - Requests without valid `x-workspace-token` or Authorization Bearer header return HTTP 401.
4. **Safety Defaults Enforced:**
   - `OSM_OVERPASS_DAILY_REQUEST_LIMIT=0`: Hard disabled to eliminate brittle external Overpass calls.
   - `DISCOVERY_EXTERNAL_ALERTS_ENABLED=false`: External email/SMS/outreach remains strictly disabled in configuration and code.

---

## 12. Accidental Data Loss Prevention (27 Database Tables)

- **Table Inventory:** All 27 existing public tables are declared in `prisma/schema.prisma`.
- **Pre-existing Data Protected:** 18 leads, 17 pitches, 12 audits, 1 discovery source, 2 daily reports, and immutable `BusinessReport` table records are preserved.
- **Migration Policy:** `prisma migrate deploy` is strictly forward-compatible. No `DROP TABLE`, `DROP COLUMN`, or `TRUNCATE` operations exist in migration scripts.
- **Backup Verification:** Automated backup script `scripts/backup-db.ps1` produces PostgreSQL dumps in `tmp/database-backups/`. `.gitignore` excludes `*.dump` to prevent database records from being committed.

---

## 13. File Uploads & Ephemeral Filesystem Compatibility

- **Stateless Architecture:** The application does not rely on local persistent disk writes for core operations.
- **Report & CSV Generation:**
  - CSV exports (`GET /api/analytics/business-growth/reports/:id/export.csv`) stream directly from database records to HTTP response in-memory.
  - PDF exports use browser-native print rendering.
- **Container Ephemerality:** Safe for Render's ephemeral filesystem where containers restart, scale, or redeploy without data persistence on local disks.

---

## 14. Deployment Readiness Checklist & Step-by-Step Operator Guide

### Phase A: Database Setup (Managed PostgreSQL)
1. In Render Dashboard, click **New > PostgreSQL**.
2. Name: `ai-client-hunter-db`.
3. Plan: Starter (or Standard).
4. Copy the **Internal Database URL** (for Render services) and **External Database URL** (for local migrations/admin).

### Phase B: Backend Setup (Render Web Service)
1. In Render Dashboard, click **New > Web Service**.
2. Connect GitHub repository `https://github.com/sravan29-oss/AI-Client-Hunter.git`.
3. Configure settings (or deploy automatically using `render.yaml` Blueprint):
   - **Name:** `ai-client-hunter-api`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npx prisma generate && npm run build:server`
   - **Pre-Deploy Command:** `npx prisma migrate deploy`
   - **Start Command:** `npm run start --workspace=server`
   - **Health Check Path:** `/api/health`
4. Configure Environment Variables:
   - `NODE_ENV`: `production`
   - `PORT`: `10000`
   - `DATABASE_URL`: `[Internal connection string from ai-client-hunter-db]`
   - `API_SECRET`: `[Generate high-entropy 64-char string]`
   - `CORS_ORIGIN`: `https://ai-client-hunter.vercel.app` (update once Vercel URL is known)
   - `APP_PUBLIC_URL`: `https://ai-client-hunter-api.onrender.com`
   - `TRUST_PROXY_HOPS`: `1`
   - `GEMINI_API_KEY`: `[Your Google Gemini API Key]`
   - `GEMINI_MODEL`: `gemini-3.8-flash`
   - `OSM_OVERPASS_DAILY_REQUEST_LIMIT`: `0`
   - `DISCOVERY_EXTERNAL_ALERTS_ENABLED`: `false`
5. Deploy and verify `/api/health` returns HTTP 200 with `{"status":"ok","database":"connected"}`.

### Phase C: Frontend Setup (Vercel)
1. In Vercel Dashboard, click **Add New > Project**.
2. Import repository `sravan29-oss/AI-Client-Hunter`.
3. Project Settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `./` (or `client`)
   - **Build Command:** `npm run build:client`
   - **Output Directory:** `client/dist`
4. Configure Environment Variables:
   - `VITE_API_URL`: `https://ai-client-hunter-api.onrender.com/api`
5. Deploy.
6. Copy the assigned Vercel URL (e.g. `https://ai-client-hunter.vercel.app`) and update `CORS_ORIGIN` in Render.

---

## 15. Summary of Automated Verification Results

| Suite | Target | Tests / Checks | Result |
| --- | --- | :---: | :---: |
| Client Tests | Vitest / Testing Library | 16 / 16 | **PASS (100%)** |
| Server Tests | Jest / Supertest | 113 / 113 (1 skipped) | **PASS (100%)** |
| Client TypeScript | `tsc --noEmit` | 0 errors | **PASS** |
| Server TypeScript | `tsc --noEmit` | 0 errors | **PASS** |
| Server Production Build | `npm run build:server` | `dist/index.js` generated | **PASS** |
| Client Production Build | `npm run build:client` | `client/dist/` generated | **PASS** |
| Git Secrets Check | `git check-ignore -v .env` | Ignored | **PASS** |
| Database Integrity | 27 tables | 0 data loss | **PASS** |

The AI Client Hunter workspace is 100% prepared and verified for production deployment to Render and Vercel.
