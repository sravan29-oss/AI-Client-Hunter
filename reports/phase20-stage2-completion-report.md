# Phase 20 Stage 2 completion report

AI Client Hunter · Lead Prioritization and Market Intelligence · 24 November 2026

Open **Business Intelligence → Lead priorities and markets**. The new view shares the existing date selection and keeps Stage 1 Performance and all-time analytics available. [Phase 20 assessment](phase20-implementation-assessment.md) · [Stage 1 completion report](phase20-stage1-completion-report.md)

## Implemented functionality

- **Lead Priority Overview** shows counts and a distribution for High, Medium, Low, and Insufficient Data. It covers open leads added in the selected range. Won, lost, archived, rejected, and not-interested leads remain in industry and location totals where applicable.
- **Recommended leads** shows up to eight open leads with their numeric score, documented increases and reductions, missing evidence, service opportunities, and an internal next action. Each card opens the existing CRM lead. The original CRM evidence panel also handles partial older records without crashing.
- **Industry performance** shows canonical lead counts, currently qualified leads, high priority, saved proposals, dated wins and losses, and evidence coverage. The time chart groups CRM creations by industry and reporting period.
- **Location intelligence** groups supported city and country values from existing provider evidence. Country-only and unverified locations are shown separately. It displays lead, qualification and priority counts. Location conversion outcomes require adequate dated evidence.

## Scoring methodology

Ruleset `crm-evidence-v1` calculates a score from 0 to 100. Two distinct evidence categories are required for a priority classification. With sufficient evidence, High starts at 70, Medium at 40, and lower values are Low. Candidates with documented communication restrictions or declines appear after unrestricted leads.

| Component | Maximum | Evidence and points |
| --- | ---: | --- |
| Profile fit | 35 | 15 for a configured service with a saved evidence match. 10 for an active target industry corroborated by a provider category. 10 for a verified city or country within a configured target. |
| Opportunity | 25 | 15 for actionable saved website measurements. 8 for recorded qualification. 2 for a structured directory reference. Multiple references add no extra points. |
| Sales activity | 25 | 10 for a linked question or expression of interest within 90 days. 10 for an open, manually delivered proposal. 5 for recorded manual delivery within 30 days. |
| Follow-up | 15 | 15 for an overdue or due pending reminder. 7 for a pending reminder due within seven days. Only the earlier pending reminder determines urgency. |

An explicit restriction or opt-out deducts 20 points. A recorded decline deducts 15 points when a restriction deduction has not applied. Missing evidence contributes zero points and appears separately on the card. The score is computed at read time and the stored CRM score remains available in its existing views.

## Evidence and service matching

- Website findings use saved successful inspections associated with the current site. A blank website field, failed crawl, or generic audit summary supplies no website development recommendation. Measured mobile, accessibility, navigation, metadata, HTTPS, and catalogue observations support specific review suggestions.
- Service matches must exist in the saved freelance business profile. Measured website findings can support website development, redesign and UI/UX, or an e-commerce workflow review. React, React Native, dashboards, APIs, database work, and AI can be recognized in valid manually delivered proposal scope. A proposal match describes a previously quoted service. The customer’s need still requires confirmation.
- Engagement uses validated, linked manual-response events and recorded timestamps. A contact restriction takes precedence over pending reminder and proposal review. Suggested actions stay within existing CRM and Engagement workflows.
- Location verification uses matching saved city and country evidence or exact matching components in a cited provider address. An explicit conflicting location stays unverified at that level. Search targets, manual city labels alone, and raw coordinate guesses supply no verification.
- Stage 2 uses deterministic evidence scoring. The API labels its provenance `evidence_fallback`. There was no live Gemini generation and the configured model and key stayed in place.

## Industry and location data coverage

The live last-90-days report contained 18 canonical leads. All 18 had a CRM industry label, zero had an exact matching provider category, one had a structured provider reference, and one had a provider-corroborated city and country. The priority distribution was one Medium and 17 Insufficient Data. There was one documented service match on the recommendation cards. These counts describe the saved workspace at verification time.

Qualification rates require 10 assessed leads per industry. Win rates require 10 dated closures in the industry or verified location. Location outcome details use the same minimum. Counts and sourced coverage remain visible for smaller groups. Zero location groups met the threshold in the live workspace. Group ordering is by lead count, with no performance ranking for small samples.

## API, security, and database

- `GET /api/analytics/business-growth/intelligence` is the new authenticated endpoint. It accepts the existing range presets or validated custom dates and returns `Cache-Control: no-store`. Responses include aggregate data and the business name and CRM ID required to open recommendation cards. Contact fields, addresses, coordinates, provider URLs, quote bodies, and raw activity notes stay outside the response.
- The Stage 1 aggregation keeps its existing response format. The reporting calendar and linked stage closure logic are shared. There are zero migrations, new tables, stored priority scores, or data edits from the report.
- All 26 table fingerprints matched immediately before and after the report reads. The original 18 leads, 16 pitches, 12 audits, and one structured source were preserved. The local workspace also appended one unsent outreach draft, two activity records, and discovery records through existing workflows during the work. A comparison by original row IDs showed those earlier activity, pitch, and discovery rows were intact. The existing workspace also recorded a preferred-provider and run status update and one notification read flag change.
- The external delivery table remained empty. External alerts stayed disabled and the Overpass request limit stayed at zero.

## Verification results

| Check | Result |
| --- | --- |
| Backend tests | 130 passed, zero failed or skipped. Coverage includes deterministic scores, missing signals, duplicate provider references, service matching, verified locations, sample thresholds, and protected HTTP responses. |
| Frontend tests | 13 passed, zero failed or skipped. Tests include empty market reports, evidence and service rendering, and original lead details with partial evidence. |
| TypeScript and production builds | Both workspace type checks passed. The backend TypeScript build and frontend Vite production build passed. |
| Responsive browser | The built app passed Chromium checks at 1440, 768, 390, and 320 CSS pixels. The test covered the shared date filter, score evidence, service matches, known and unknown locations, empty states, and opening the original CRM lead. It also opened the Stage 1 performance views and the existing all-time engagement report. |
| Authorization and privacy | The production app returned HTTP 401 for an unauthenticated request. Invalid filters returned HTTP 400. HTTP regression fixtures verified that report responses omit contacts and raw evidence. The frontend bundle scan found zero matches for the configured backend secret values checked. |
| Existing workflows | Phase 18 approval, proposal conversion, and follow-up tests passed. Phase 19 campaign, consent, opt-out, fallback, and manual response tests passed. Stage 1 amount separation, timezone boundaries, date filtering, KPI rules, and unavailable revenue tests passed. |

## Files created and modified

| Change | Files |
| --- | --- |
| Created backend services | [leadPriority.ts](../server/src/services/leadPriority.ts), [marketIntelligence.ts](../server/src/services/marketIntelligence.ts) |
| Created frontend component and types | [MarketIntelligence.tsx](../client/src/components/MarketIntelligence.tsx), [marketIntelligence.ts](../client/src/types/marketIntelligence.ts) |
| Created tests and report | [Backend market intelligence tests](../server/src/tests/marketIntelligence.test.ts), [Frontend market intelligence tests](../client/src/tests/marketIntelligence.test.ts), this report |
| Updated backend | [analytics.ts](../server/src/routes/analytics.ts), [businessGrowth.ts](../server/src/services/businessGrowth.ts), [businessGrowthCalendar.ts](../server/src/services/businessGrowthCalendar.ts), [salesConversion.test.ts](../server/src/tests/salesConversion.test.ts) |
| Updated frontend | [App.tsx](../client/src/App.tsx), [API client](../client/src/api/client.ts), [BusinessIntelligence.tsx](../client/src/components/BusinessIntelligence.tsx), [LeadDiscoveryEvidence.tsx](../client/src/components/LeadDiscoveryEvidence.tsx) |

## Remaining limitations

- Priority is the current review priority of a selected creation cohort. Historical scores and historical stages cannot be reconstructed from the current record alone.
- Radius-only targets supply no location fit points in this view without corroborated radius evidence. Existing discovery targeting remains available through its own workflow.
- Older records without linked manual responses, website measurements, or provider evidence can remain Insufficient Data. Industry labels are visible with sourced coverage even when they originated as a CRM default.
- Stage 1 continues to label actual revenue unavailable. Phase 17 Gemini live acceptance remains pending. Stage 3 awaits review.
