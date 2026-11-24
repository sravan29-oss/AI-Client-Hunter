# AI Client Hunter

AI Client Hunter is a freelance client acquisition workspace for finding businesses, managing leads, reviewing websites, drafting outreach, and estimating projects. It uses React, Express, Prisma, and PostgreSQL.

## Local setup

Use Node.js 20.19+ or 22.12+ and npm. For persistent data, use Docker or a PostgreSQL database.

Run these commands from the project root in PowerShell.

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run docker:db:up
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The API runs on port 5000 by default. For an existing PostgreSQL installation, set `DATABASE_URL` in `.env` and skip the Docker command. If the database container is still starting, rerun `npm run prisma:deploy` once it is ready.

On Windows, stop the running development server before regenerating the Prisma client. Prisma replaces its DLL during generation.

For a quick local preview, run `npm run prisma:generate` and `npm run dev`. If PostgreSQL is unavailable, development uses temporary storage that clears on restart. The full 18-package rate catalog is available in either mode.

### Existing database created with `prisma db push`

If the app already has data and Prisma has no migration history, back up the database and compare its schema with [the initial migration](prisma/migrations/20261121000000_initial_schema/migration.sql). If it matches that migration, record the baseline before applying the additive queue migration.

```powershell
npx prisma migrate resolve --applied 20261121000000_initial_schema
npm run prisma:deploy
```

## Configuration

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection. `POSTGRES_PORT` controls the Docker port binding. Keep the port in the URL in sync. |
| `PORT` and `CORS_ORIGIN` | API port and allowed origins for cross-origin clients. |
| `TRUST_PROXY_HOPS` | Defaults to `0`. Behind a controlled reverse proxy, set the exact trusted hop count and restrict direct access to the Node port. Use explicit origins in `CORS_ORIGIN`. |
| `APP_PUBLIC_URL` | Browser URL used for CRM links in email and Telegram alerts. Set this to the deployed HTTPS URL in production. |
| `API_SECRET` | Workspace key required in production. Enter it on the browser sign-in screen. API clients can send `Authorization: Bearer <key>` or `X-API-Key: <key>`. |
| `GEMINI_API_KEY` and `GEMINI_MODEL` | Enable Gemini-generated analysis and outreach. Built-in templates work without Gemini. |
| `OSM_OVERPASS_URL` | Full interpreter URL for an Overpass service whose operator permits your planned recurring searches. Leave blank until you have an authorized service. [Overpass usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) |
| `OSM_OVERPASS_MIN_INTERVAL_MS` | Minimum interval between Overpass requests per app process. Defaults to 10 seconds. Set it to match the selected operator’s limits. Across replicas, enforce any shared quota at your gateway or service. |
| `OSM_NOMINATIM_URL` | Optional authorized Nominatim base URL for individual address lookups through `POST /api/discovery/geocode`. Public Nominatim is blocked. [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) |
| `GOOGLE_PLACES_API_KEY` | Backend key for Google Places. For new Google Cloud projects, enable Places API (New), configure billing, and allow the server key to call it. [Google Places setup](https://developers.google.com/maps/documentation/places/web-service/get-api-key) |
| `SERPAPI_API_KEY` | Backend key for SerpApi. The connection test checks account access and available search quota. |
| `GOOGLE_PLACES_DAILY_REQUEST_LIMIT`, `OSM_OVERPASS_DAILY_REQUEST_LIMIT`, `SERPAPI_DAILY_REQUEST_LIMIT`, `OSM_NOMINATIM_DAILY_REQUEST_LIMIT` | App-side UTC daily outbound request ceilings, shared across workers in PostgreSQL. Defaults are 100, 120, 40, and 60. Set a limit to `0` to disable the provider. Health probes, retries and Google pagination count. Cloud billing controls are managed separately. |
| `DISCOVERY_MAX_GEMINI_REQUESTS_PER_RUN` | Defaults to 8 outbound attempts. SDK and REST attempts both count. Set to `0` to use measured scoring and local drafts exclusively. |
| `DISCOVERY_WEBSITE_CACHE_HOURS` | Reuse successful page measurements for 24 hours by default. Set to `0` to fetch each time. |
| `DISCOVERY_EXTERNAL_ALERTS_ENABLED` | Defaults to `false`. Discovery creates in-app alerts and saves outreach drafts. An operator can separately enable existing internal delivery channels after configuring their credentials and recipients. |
| `SMTP_*`, `NOTIFICATION_EMAIL`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID` | Optional run notifications. Turn on the configured channels in Auto Hunter. |

Use the backend `.env` or your host's environment settings for credentials. Browser sign-in keeps the workspace key for the current tab session.

Configure at least one directory before running automatic searches. Use **Test Connection** on a provider card in Find Clients or Settings to verify it after configuration.

## Main workflows

- **Find Clients and Leads** support provider discovery, manual entry, CSV import and export, duplicate checks, and pipeline tracking.
- **Website Analyzer** reviews public websites and can save a report against a CRM lead.
- **AI Outreach and Follow-ups** help compose and review drafts. Mark as Sent records outreach you sent separately.
- **Projects and Rate Calculator** show won leads and estimate work from 18 service packages across six categories. EUR and GBP amounts use fixed planning conversions.
- **Auto Hunter and Analytics** provide scheduling, run history, acquisition reports, and pipeline metrics. Auto Hunter starts disabled.

## Business profile and project knowledge

Open **Settings** to edit the business name, role, services, technologies, currency preference, and personal portfolio. The initial profile and project links come from the Phase 16 brief. PostgreSQL keeps edits across restarts. Local preview labels temporary storage in Settings.

In **Project knowledge base**, add claims about a project and record the evidence for each one. Screenshot claims use an evidence URL. Approve a claim and enable sharing on the project before a matching draft can use it. Archive a project to exclude it from new drafts. Pitch Studio and Auto Hunter add the saved sender identity and one relevant approved project or the personal portfolio. Each draft stores a snapshot with the reference used.

## Ideal Client Profiles

In **Settings → Ideal Client Profiles**, save, edit, duplicate, or activate targeting profiles. Enter countries as names or ISO alpha-2 codes. Add each city under its country. Overpass requires an officially mapped city. Radius targeting uses Overpass and requires a city, coordinates, and a radius in kilometres.

Each location can inherit the Auto Hunter schedule or use its own daily, Monday weekly, or manual schedule in an IANA time zone. Auto Hunter's enable switch controls scheduled discovery. **Run now** can use the next target or a selected profile location. When all profiles are inactive, Auto Hunter uses its existing settings. The PostgreSQL queue persists location schedules and fences work for superseded profile revisions.

Targeted discovery checks source evidence for location, industry, and categories. Known company size and same-currency budget values can disqualify a listing. Missing values remain unknown, and preferred business types contribute only when supported by listing data. Qualified leads show a six-factor score in the CRM and preserve their discovery source and timestamp. Outreach stays in the existing draft workflow.

### Automatic discovery

Auto Hunter polls the PostgreSQL queue every five seconds. **Run now** accepts a job and returns immediately. One queued or running discovery job is allowed per workspace. A worker that loses its lease can be replaced. Provider failures retry with increasing delays for up to three attempts. Daily and Monday schedules use the configured time zone. A run that became due during downtime is picked up after restart. For custom cities in a multi-country search, enter names as `City (Country)`, separated by commas.

Use **Pause schedule** to pause new scheduled runs and **Resume schedule** to enable them again. **Stop** cancels a queued run or fences the writes of an in-flight job. Qualified leads, their drafts, source history, evidence and in-app alerts are saved together. New runs show the effective provider, inspection failures, qualification decisions and usage in **Run history**. The optional internal delivery worker retries confirmed temporary failures when it is explicitly enabled.

### Discovery evidence and qualification

Profile jobs use Google Places API (New) Text Search, or Nearby Search for supported categories and radii up to 50 km. Overpass remains the default radius provider when Nearby Search does not apply. Settings shows actual request outcomes, the request count and the remaining configured allowance. Review provider terms for your deployment and use storage and attribution only as authorized. [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)

Website inspection fetches a bounded public page and records the HTTP outcome. Public mail and telephone links can supplement listing contacts when the inspected page stays on the listed site. Gemini can prioritize measured opportunities and receives a constrained set of supporting observations. A single page inspection leaves private workflows, project budgets and broader functionality unknown. The CRM preserves evidence references and each rediscovered provider source. Score labels are descriptive and qualification uses the active profile threshold.

New daily reports use the Auto Hunter time zone and store their exact UTC window for exports. Historical reports keep their original UTC dates. Directory counts come from provider search results. Qualification counts use recorded qualification scores.

Overpass searches use a mapped city boundary inside the selected country. Set a city for each Auto Hunter country. Find Clients supports named categories and up to six exact OSM tag filters. Contact details come from source tags and are treated as unverified. Search history retains the original OSM object and coordinates, address tags, and attribution. Saved leads retain the discovery date and an identity key for the OSM object. [OpenStreetMap attribution](https://www.openstreetmap.org/copyright)

Overpass caches successful queries for 15 minutes per server process, combines concurrent identical requests, and respects `Retry-After`. Existing `openstreetmap` provider preferences resolve to Overpass. Nominatim has its own connection check and serves address lookups only.

The main API resources are `/api/leads`, `/api/discovery`, `/api/audit`, `/api/pitches`, `/api/ratecards`, `/api/automation`, `/api/notifications`, and `/api/analytics`. `/api/health` is public. `/api/session` verifies workspace access.

### Upgrade an existing database

Back up the target PostgreSQL database before applying migrations. The hardening migration adds a unique identity registry, a notification delivery queue, and report time-zone fields. The outreach migration validates new draft bodies while retaining historical rows.

The identity backfill assigns each shared domain, email, or name-and-country key to the oldest matching lead. Review shared identities with an operator and compare notes, pitches, audits, notifications, and downstream links before approving any manual merge. Existing lead records and their history are retained. `POST /api/leads` returns `201` for a new lead and `200` with `duplicate: true` and the canonical lead for an existing identity. CSV import accepts raw `csvText` or structured `rows` and reports invalid fields by row.

## Build and verify

### Gemini verification and production rankings

Use `gemini-3.8-flash` for the Phase 17 acceptance check. Settings uses a single direct request with an idempotency token. The HTTP attempt has redirects disabled and no automatic retries. A verified ranking requires structured JSON and evidence IDs that match the stored website findings.

Persistent Auto Hunter runs save deterministic qualification and drafts, then queue a separate Gemini ranking for eligible findings. The database deduplicates by lead, model, and measured findings. The worker uses up to four attempts for HTTP 429, 502, 503 and 504, exponential delay with jitter, the provider's `Retry-After` delay, and a shared circuit that cools down for five minutes after three transient failures. A worker can reclaim a job interrupted before dispatch. An interruption after dispatch records an unknown outcome and ends that job. The CRM displays Pending, Available, Temporarily unavailable or Failed for ranking jobs. Successful production rankings are appended with provider provenance and do not advance the manual acceptance check.

Provide the full `/interpreter` URL for an authorized hosted or self-hosted Overpass instance. The readiness check sends a bounded city query and requires a returned OSM object ID for each configured city. Discovery can fall back to the other eligible providers when Overpass fails. Review your selected operator’s quotas before enabling recurring searches. [Overpass usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)

Google Places Text Search verifies the replacement key's functionality. Cloud-side revocation is a separate acceptance requirement. A successful provider request does not confirm revocation.

### Commands

```powershell
npm run typecheck
npm test
npm run test --workspace=client
npm run build
```

To include queue integration tests, set `DISCOVERY_TEST_DATABASE_URL` to a fresh, migrated disposable PostgreSQL database before running `npm test`. The tests create records in that database.
Set `GEMINI_QUEUE_TEST_DATABASE_URL` to a separate fresh, migrated disposable database named with the `phase17_gemini_queue_` prefix to run the Gemini queue integration tests. These tests use controlled provider responses.

For a production deployment, provide a migrated PostgreSQL database and set `NODE_ENV=production` and `API_SECRET` in the environment. Run `npm run prisma:generate`, `npm run prisma:deploy`, `npm run prisma:seed`, `npm run build`, and `npm start`. The server serves both the built browser app and `/api` on the configured port. Use an always-on Node service behind HTTPS so a worker can claim jobs even when no browser is open. Docker Compose supplies the local database.

At deployment, restrict outbound traffic to the database, DNS, expected providers, and the configured mail service. Give website analysis a public-only egress route and block access to metadata services and private networks on that route. Apply an explicit override only for trusted infrastructure such as a private, configured Nominatim service. Confirm the reverse proxy strips untrusted forwarding headers and run live provider and notification checks in private staging.
