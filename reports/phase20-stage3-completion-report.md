# Phase 20 Stage 3 completion report

AI Client Hunter · 24 November 2026

Weekly and monthly reports are available under **Business Intelligence → Business Reports**. The dashboard measures data from the existing CRM and saves a separate snapshot each time you generate a report. CSV and browser print/PDF are available from every saved report.

## 1. Weekly report

- The selected date identifies a Monday–Sunday week in the workspace reporting time zone. If the week is in progress, the report ends at the time it is generated. A blank date uses today.
- Acquisition shows first dated provider discoveries, deduplicated by lead, and CRM records created. The report also shows qualified leads, open opportunities, priority distribution, proposals, dated wins and losses, follow-ups due and completed, recorded deliveries, distinct pitches with responses, and recorded objection categories.
- Industry and location sections show their covered cohorts. The report lists up to eight open opportunities with their scores, next actions and links to the original CRM records. Recommended actions also link to Leads, Find Clients, Projects, Follow-ups and Engagement.
- A current-week comparison uses the same elapsed local part of the previous week. Differences appear only where both periods contain supporting records for the metric. Closed weekly reports use the entire prior week when the data supports a comparison.

## 2. Monthly report

- A date selects its whole calendar month or the elapsed portion of the current month. A partial month compares through the equivalent prior day and time when the prior month supports it.
- The report shows acquisition, the assessed and qualified cohort, lead priorities, industry and location performance, proposal creation and recorded delivery, open pipeline stages, dated closures, engagement, and follow-up activity.
- INR and USD quote values are summed in their original minor units and displayed in their original currencies. The amounts are the face value of recorded proposals. The app has no verified payment records, so **actual revenue is unavailable**.

## 3. Optional Gemini interpretation

An authenticated operator can request an interpretation from a saved report in production when the existing backend Gemini configuration is available. The prompt contains only templated aggregate evidence and evidence identifiers. The existing direct generation transport makes one HTTPS call for that operation. The server validates that each supplied insight ID appears exactly once and that its emphasis is either impact or coverage. The resulting snapshot uses the server’s original observations, figures, implications, actions and quality labels, with the chosen order and emphasis. It shows its Gemini model, generation time and source snapshot.

The endpoint coalesces simultaneous requests for the same report within one process and applies a one-minute process-wide cooldown. A database uniqueness constraint allows only one saved Gemini interpretation per base snapshot. The Gemini key and model configuration were preserved. No live Gemini request was sent for Stage 3.

## 4. Deterministic reports

Weekly and monthly generation use one consistent PostgreSQL snapshot and reuse the Stage 1 and 2 measurement logic. Every insight includes an observation, supporting counts, a business implication, an internal CRM action, and a data-quality qualification. Empty reports show zero recorded activity and explain the evidence gaps. Missing Gemini configuration, provider failure, or invalid output leaves the deterministic report usable. CRM records and outbound actions are outside the reporting workflow.

## 5. Report history

The history is paginated in groups of 50. Each entry shows the reporting range, generation time and provenance. Opening an entry loads the original saved snapshot. Generating the same period again creates another entry, and a Gemini interpretation links to the deterministic source. The measured time stays the same when an interpretation is added. Older measurements can be reopened even when the underlying CRM data has since changed.

## 6. Export

- **CSV** exports the saved measurements, comparison values, original-currency amounts in labeled minor units, provenance and data availability. Exports exclude CRM lead names, contacts and notes. The existing CSV encoder escapes formula-triggering cells.
- **Print or save PDF** uses the browser print dialog and an A4 print layout. It prints the report, including recommended actions as text, and omits dashboard navigation and controls. PDF creation was exercised using the production Chrome renderer.

## 7. Files

| Area | Files |
| --- | --- |
| Reporting services and API | [Business report service](../server/src/services/businessReports.ts), [calendar](../server/src/services/businessReportCalendar.ts), [Gemini interpretation](../server/src/services/businessReportAi.ts), [report routes](../server/src/routes/businessReports.ts), [analytics routes](../server/src/routes/analytics.ts), [growth measurements](../server/src/services/businessGrowth.ts), [market measurements](../server/src/services/marketIntelligence.ts) |
| Dashboard | [Business Intelligence](../client/src/components/BusinessIntelligence.tsx), [report interface](../client/src/components/BusinessReports.tsx), [print styles](../client/src/components/BusinessReports.css), [app entry](../client/src/main.tsx), [API client](../client/src/api/client.ts), [report types](../client/src/types/businessReports.ts), [shared amount formatter](../client/src/utils/reportAmounts.ts) |
| Database | [Prisma schema](../prisma/schema.prisma), [additive migration](../prisma/migrations/20261124010000_business_reports/migration.sql) |
| Tests | [Backend report tests](../server/src/tests/businessReports.test.ts), [PostgreSQL and HTTP workflow tests](../server/src/tests/salesConversion.test.ts), [frontend report tests](../client/src/tests/businessReports.test.ts), [frontend growth test](../client/src/tests/businessGrowth.test.ts) |

## 8. API

All routes use workspace authentication and set `Cache-Control: no-store`. Generating a snapshot or requesting Gemini also requires the existing admin or developer role.

| Method and path | Result |
| --- | --- |
| `GET /api/analytics/business-growth/reports` | History, reporting time zone, local date and whether the deployment can request Gemini. Accepts optional `after` cursor. |
| `POST /api/analytics/business-growth/reports` | Creates a snapshot. Accepts `kind` as `weekly` or `monthly`, and optional local ISO `date`. |
| `GET /api/analytics/business-growth/reports/:id` | Reads the saved snapshot. |
| `GET /api/analytics/business-growth/reports/:id/export.csv` | Downloads saved structured metrics. |
| `POST /api/analytics/business-growth/reports/:id/insights` | Requests a grounded interpretation or returns the deterministic snapshot with the applicable status. |

## 9. Database

The single additive migration creates the `BusinessReport` table, its history index and optional self-reference. A PostgreSQL trigger rejects updates and deletes of snapshot rows. Existing tables and relationships are preserved. A custom PostgreSQL backup was restored successfully into an isolated database before the migration. Prisma’s schema diff check on the migrated test database reported no difference.

## 10. Tests

| Command or check | Result |
| --- | --- |
| `npm test` | **136 passed**, 0 failed, 0 skipped, including all configured PostgreSQL integration suites. |
| `npm run test --workspace=client` | **15 passed**, 0 failed, 0 skipped. |
| Backend report coverage | Weekly and monthly boundaries, leap day, India time and DST, partial comparisons, validation, deterministic fallback, mocked structured Gemini selections, verified engagement aggregation, auth and roles, CSV, immutable readback, and pagination. |
| Chrome production workflow | Authenticated weekly and monthly creation, saved history readback, CRM navigation, unavailable Gemini status, separated currency amounts, CSV, and A4 PDF. The generated PDF was four pages and 157,142 bytes. |
| Local startup | Dashboard, backend health, report history, Stage 1 growth and Stage 2 market endpoints all returned HTTP 200. The reporting time zone was Asia/Kolkata. The smoke check used read-only requests. |

## 11. Builds

- `npm run typecheck` passed for the Express and React workspaces.
- `npm run build` passed for the Express server and Vite frontend.

## 12. Security and data integrity

HTTP tests verified 401 without workspace authentication and 403 when a read-only role attempted to create or interpret a report. The report excludes contact fields, raw activity notes, coordinates and raw source references. The workspace-authenticated opportunity review shows business names and links to existing leads. Automated verification created fixtures and reports only in disposable PostgreSQL databases.

The local migration was applied after verifying the backup restore. Row counts and normalized row fingerprints matched the backup for all 26 pre-existing tables. This included **18 leads, 17 pitches, 12 audits, one discovery-source row, and two daily reports**. The migration history gained the Stage 3 entry. The new history table was empty after deployment. A scan of 41 built frontend files found zero matches for the five configured credential values checked. The Stage 3 report and seven verification logs also had zero credential matches. Overpass retained a zero request budget. External notification settings were disabled and the delivery table contained zero records.

## 13. Mobile responsiveness

The production report passed viewport tests at 1440, 768, 390 and 320 CSS pixels. Wide report tables scroll within their panels. The document and dashboard main area stayed within the viewport.

## 14. Stage 1 and Stage 2 regression

Existing date-filtered business KPIs, timezone behavior, quote formatting, unavailable revenue, evidence-based scoring, provider evidence, verified location grouping and service recommendations passed their test suites. The Chrome run opened both existing Business Intelligence tabs before using Business Reports.

## 15. Phase 18 and Phase 19 regression

The PostgreSQL HTTP suite exercised approval and manual delivery, proposal scope, conversion, follow-up persistence and reminders. It also verified campaigns, WhatsApp draft deduplication, channel consent, suppression, and manual response tracking. The Stage 3 code adds no outbound dispatch path.

## 16. Remaining limitations

- Historical periods use dated events where the CRM has them. Current qualification, open stages, priority and pending reminders reflect the available CRM record state when the snapshot is generated. The report cannot reconstruct undocumented past states, loss reasons, or responses.
- Group rates need the existing minimum sample. Unsupported rates and actual revenue are shown as unavailable. No exchange conversion is performed.
- PDF is produced by the browser. Page rendering was verified in Chrome.
- Gemini interpretation was verified with fixtures. Live provider acceptance is separate and remains pending from Phase 17. The cooldown is process-local, while uniqueness of the saved interpretation is enforced by PostgreSQL.

Stage 4 awaits review.
