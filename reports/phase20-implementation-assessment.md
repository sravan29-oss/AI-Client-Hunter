# Phase 20 implementation assessment

AI Client Hunter • 24 November 2026 • Read-only assessment and implementation plan

**Recommendation.** Extend the existing Analytics workspace into Business Intelligence. Start with a shared reporting service that defines each metric, date window, and evidence source. Build the dashboard and deterministic next actions on those results. Add optional Gemini summaries after the reporting contract is tested. The initial release can use the existing schema.

## 1. Existing architecture and reusable components

| Area | Repository evidence and reuse |
| --- | --- |
| Frontend | React, TypeScript, and Vite. `App.tsx` already lazy-loads Overview, Analytics, CRM, Pitch Studio, Engagement, Follow-ups, Projects, and Automation. Keep Overview as a compact operational view and extend the existing Analytics route. Reuse Recharts, the current dark design tokens, the authenticated API client, CRM deep links, and the INR/USD formatter. [App](../client/src/App.tsx) · [Analytics](../client/src/pages/AnalyticsPage.tsx) · [Overview](../client/src/pages/DashboardPage.tsx) |
| Backend | Express mounts the existing analytics, CRM, pitches, rate cards, engagement, follow-ups, and automation routers behind workspace authentication. Add the reporting capability under the existing analytics router. Share metric definitions with Overview as its cards are migrated. [API wiring](../server/src/index.ts) · [Analytics route](../server/src/routes/analytics.ts) |
| Phase 18 | `Lead` is the canonical opportunity. `Pitch` holds both outreach and typed-by-convention proposal JSON. `LeadFollowUp` links to a lead and optionally a pitch. CRM stage transitions and manual outcomes write activity. Reuse these records for pipeline, proposals, and reminders. [Phase 18 report](phase18-completion-report.md) · [Stage changes](../server/src/services/salesActivity.ts) · [Proposals](../server/src/routes/ratecards.ts) · [Follow-ups](../server/src/routes/followups.ts) |
| Phase 19 | Campaigns link to existing pitches. `ActivityLog` holds operator-recorded replies, objections, and delivery metadata. Contact decisions live in `LeadCommunicationPolicy`. The Engagement route already recommends holding, reviewing a reply, or reviewing a follow-up. Reuse that logic and its eligibility checks for action cards. [Phase 19 report](phase19-completion-report.md) · [Engagement route](../server/src/routes/engagement.ts) · [Contact policy](../server/src/services/engagementPolicy.ts) |
| Discovery and AI | `LeadDiscoverySource` stores a canonical lead link, provider reference, and first and last observation. Discovery stores qualification and measured website evidence. `profileMatching.ts` scores profile fit, and the Gemini evidence-ranking path validates finding IDs. The daily report service has IANA time zone boundary handling and CSV escaping. [Prisma schema](../prisma/schema.prisma) · [Profile scoring](../server/src/services/discovery/profileMatching.ts) · [Opportunity analysis](../server/src/services/discovery/opportunityAnalysis.ts) · [Daily reports](../server/src/services/dailyReportService.ts) |

## 2. Existing analytics and local data availability

`GET /api/analytics` returns current CRM counts, source distribution, stage counts, opportunity lists, proposal totals by currency, follow-up status counts, and channel and campaign metrics. The stage bar chart is a current inventory view. The current response has no reporting window or comparisons. Certain overview counters infer outreach or meetings from a lead's stage, and legacy currency summary fields are hard-coded to zero. The sales section separately computes quote totals from valid proposal snapshots. Existing daily reports count directory search results and summarize discovery operations for a local calendar day. Their search-result total measures a different population from unique CRM leads. [Analytics route](../server/src/routes/analytics.ts) · [Automation report routes](../server/src/routes/automation.ts) · [Daily report service](../server/src/services/dailyReportService.ts)

The following sample was checked in local PostgreSQL in read-only transactions. It describes this workspace's data coverage at assessment time.

| Signal | Observed coverage |
| --- | --- |
| CRM leads | 18 stored leads. One meets the current qualification rule. Eleven have a stored qualification score. Current stages include 15 New, one Qualified, one Ready to Contact, and one Contacted. There are zero Won and zero Lost. |
| Discovery | One distinct lead has a structured provider source reference. All 18 leads have a discovery date, which the schema can populate by default. There are 21 discovery search records, one existing daily report, and 12 audits. |
| Proposals and engagement | 16 pitch records, zero saved proposal snapshots, zero accepted proposals, one pitch with a delivery timestamp, and zero campaigns. Seven delivery activity rows exist. Only one links to an existing pitch with a delivery timestamp. There are zero recorded replies or objections. |
| Workflow history | One structured stage transition links to a current lead and has both stage values. There are zero saved follow-ups. |
| Actual revenue and loss reasons | The inspected schema and routes have no payment ledger, recognized revenue records, separate deal amount, or standardized lost-deal reason. A quote, a Won stage, and free-form lead notes provide different evidence. |

## 3. Missing capabilities and feasibility

| Capability | Assessment |
| --- | --- |
| Business Growth Dashboard | Feasible now. Add date-filtered acquisition, qualification coverage, proposal creations, follow-up outcomes, and evidenced closures. Label current open opportunity and due-reminder counts as snapshots. Use a cohort funnel when timestamped transitions support it. |
| Lead intelligence | Feasible now. Existing qualification, profile match, website findings, proposals, reminders, and engagement records can drive explainable priority. Manual leads with default scores need an evidence-coverage label. |
| Sales and revenue | Saved proposal value, confirmed accepted quote value, and open-pipeline scenarios are feasible on suitable records. Distinct deal value needs a confirmed amount or an unambiguous accepted quote. Actual revenue is unavailable until a verified payment or accounting source exists. |
| Opportunity insights | Compare industry, city within country, and acquisition provider using consistent denominators and coverage. Phase 19 supports objection categories. Historical loss reasons require operator confirmation. The current sparse data supports an activity summary and coverage guidance. Reliable underperformance claims need sufficient samples. |
| Business reports | Weekly and monthly in-app reports are feasible on demand from the same reporting service. Generate a complete deterministic summary and optionally let Gemini prioritize or explain the supplied findings. |

## 4. Proposed reporting architecture and metric definitions

Add a typed reporting service behind the existing analytics router. Give it a validated filter, a single `asOf` instant, and shared metric definitions. Query PostgreSQL with bounded date predicates and field projections. Aggregate in the database where practical and read related report inputs from a consistent snapshot. Return values with units, denominators, evidence coverage, and whether each is a period event or a current snapshot. Preserve the existing `GET /api/analytics` response for its current consumers while the new view is introduced.

Use local calendar ranges with an inclusive start and exclusive end at the start of the next local date. Default to the configured reporting zone and fall back to Asia/Kolkata when the workspace setting is absent or invalid. Display the selected zone and dates. Weekly reports use Monday through Sunday, and monthly reports use calendar months. Bound custom ranges initially to 366 days. Mark current incomplete weeks or months and compare them with equivalent elapsed periods. Include country, city within country, industry, and acquisition source filters. Keep outreach channels separate from acquisition providers.

| Metric | Proposed source and inclusion rule |
| --- | --- |
| Total discovered leads | Count canonical lead IDs whose earliest valid provider observation falls in the range. Assign a single first acquisition source per lead using a stable tie-breaker. Keep directory result volume and all CRM creations as separate metrics. Show acquisition attribution coverage and surface legacy source labels as a distinct breakdown. |
| Qualified leads and rate | Count members of the selected acquisition cohort with confirmed current qualification. Publish qualification coverage and calculate the rate among assessed members. Label it as current qualification of that cohort. A historical qualified-in-period chart can use explicitly timestamped qualification events once coverage supports it. |
| Active opportunities | Use a documented open-stage allowlist beginning with Qualified or Reviewed and including Ready to Contact, Contacted, Replied, Interested, Meeting Scheduled, and Negotiation. Keep New and Analysed visible in the overall current-stage chart. This count is a current snapshot, scoped by the selected dimensions. |
| Won, lost, and win rate | Use validated activity transitions into Won or Lost to place closures in a period. Count the latest valid closing outcome per lead in that period and flag a subsequent reopening in the window. Use `won / (won + lost)` with visible numerator and denominator. A separate cohort conversion rate uses confirmed wins among cohort members and discloses the observation cutoff. A zero denominator displays unavailable. Current legacy Won and Lost stages remain visible in all-time snapshots. |
| Proposals and follow-ups | Count saved proposal-bearing pitches by creation date. Count manual proposal delivery from eligible timestamped records. Show current pending and overdue reminders using `dueAt`. Count distinct completed follow-up IDs from validated completion events during the period. Preserve missing event time as unknown. |
| Engagement and objections | Use persisted timestamped pitches and validated response events linked to their pitch and lead. Treat orphaned delivery logs as coverage issues. Count distinct delivered pitches with a reply for response rate, and categorize objections from explicit operator records. Keep raw activity count separate from unique respondents. |
| Industry and acquisition insight | Group by normalized existing dimensions, retain Unknown, and surface sample size, assessed leads, evidenced closures, and provider failure counts as distinct signals. Compare the same cohort and observation window. Use an initial minimum sample rule of 10 eligible observations per compared rate and disclose it. Below the threshold, show counts and coverage without an underperformance ranking. |

Treat lead creation, first provider observation, qualification, and close timestamps as distinct facts. Include incomplete-source and incomplete-transition notes in browser views and exports. Avoid reconstructing a historical funnel from current stages.

### Amounts and projections

- Use validated `Pitch.proposal` snapshots for saved quote face value and operator-recorded delivery for delivered quote value. Store and sum integer minor units, keep INR and USD in separate rows and chart series, and use currency-aware formatting. Exclude unpriceable or invalid snapshots with a visible count.
- Show **confirmed accepted quote value** when an accepted proposal has a valid amount and the operator outcome links that proposal to the CRM lead. Show **unvalued wins** separately. Where multiple accepted quotes could represent the same opportunity, flag the ambiguity and exclude it from a unique-deal total until an operator can reconcile it.
- Show **open quote exposure** using at most one latest eligible delivered quote per open lead. Label low, base, and high forecasts as scenarios. Use explicit user-selected stage weights and display the basis, covered leads, excluded amounts, and assumptions. Use low data confidence by default where closure history is sparse. Forecasts have no actual-revenue label.
- Show **actual revenue unavailable** until an authoritative payment or accounting source is approved. A future payments view can distinguish recorded collections, refunds, and recognized revenue if the source supports each. Keep those measures separate from quotes and pipeline amounts.

### Explainable lead priority

Use a versioned ruleset that combines saved profile fit, measured opportunity evidence, active sales signals, and follow-up urgency. Start with published component caps of 35, 25, 25, and 15 respectively. Award points from validated observations and show missing evidence separately. Display the evidence used, age, score contribution, and data coverage. Let existing saved opportunities or stage signals contribute once per component. Treat the default lead score as unverified input unless supporting evidence exists. Use a stable tie-breaker and omit closed, rejected, and archived leads from the active priority queue.

Reuse the Phase 19 recommendation rules for reply and reminder handling. Put policy review, suppression, and explicit opt-out ahead of any draft suggestion. Link next actions to existing CRM, Engagement, Projects, or Follow-ups screens for human review. Calculate campaign, industry, and location summaries from recorded lead data of known provenance.

## 5. Database plan

Use `Lead`, `LeadDiscoverySource`, `DiscoverySearch`, `AutoHunterLog`, `Pitch`, `LeadFollowUp`, `OutreachCampaign`, `ActivityLog`, and `AutoHunterConfig` for the first release. The weekly and monthly reports can be computed on demand. `DailyReport` remains the discovery operations snapshot. Measure query plans on representative data before proposing an additive index such as `ActivityLog(action, createdAt)`.

For structured loss reasons, prefer a later operator-confirmed activity entry tied to a validated Lost transition. Reuse `ActivityLog` and enforce idempotence with a stable reference to that outcome. Leave historical free text uncategorized unless reviewed by an operator. Consider a small normalized payment ledger only after source ownership, reconciliation, amount semantics, and permissions are agreed. Require a durable source reference, currency, amount, event time, correction or reversal handling, and an idempotent import key before exposing any actual-revenue value.

## 6. Proposed APIs

| Endpoint | Responsibility |
| --- | --- |
| `GET /api/analytics/business-growth` | Return filtered KPI cards, acquisition and closure series, current pipeline snapshot, supported funnel measures, cohorts, quote amounts, scenario inputs, and data coverage. Run read-only and independently of Gemini. |
| `GET /api/analytics/business-growth/priorities` | Return cursor-paginated ranked lead references and their evidence, component scores, coverage, and suggested next steps. Use the same dimensions and a stable sort. |
| `GET /api/analytics/business-growth/reports` | Produce an in-app deterministic weekly or monthly summary from the shared reporting contract. Support a matching CSV presentation if included in the rollout. Preserve metric definitions and date boundaries across formats. |
| `POST /api/analytics/business-growth/insights` | Generate optional recommendations for an explicit operator request. Recompute the bounded evidence payload server-side from validated filter input. Return provenance and evidence references beside the measured report. |

Report effective date range, zone, as-of time, metric definition version, and missing-data reasons. Return validation errors for invalid windows or filter values and an unavailable state when PostgreSQL is down. Keep traffic bounded with limits on range, grouping, priority page size, and optional AI requests.

## 7. Frontend plan

Rename the current Analytics navigation label to **Business Intelligence** when the existing view is extended. Use the existing dark palette, typography, badges, and chart components. Keep a compact date and dimension filter above a small set of KPI cards. Organize pipeline and conversion, acquisition and industry, proposals and recorded amounts, and outreach and follow-up insights as sections with clear metric definitions. Link priority rows directly to the relevant lead workflow. Present weekly and monthly report controls within this workspace.

Use stacked cards and compact date controls on mobile. Provide accessible labels, visible focus, text summaries or tables for charts, logical reading order, and loading, error, and coverage states. Use neutral coverage indicators where an empty state needs explanation. Keep AI recommendations visibly separate from the measured cards and totals.

## 8. Gemini and deterministic fallback

Reuse the backend-only direct JSON transport and the existing sanitized error and evidence-validation patterns. Use the configured model as supplied by the environment. Send compact, allowlisted aggregates and opaque evidence IDs. Exclude contact addresses, URLs, free-form reply text, raw scraped content, and credentials from the provider prompt. Have Gemini select or prioritize supported insight and action IDs. Validate the schema and reject unknown IDs, invalid action types, and unsupported claims. Render metric values and exact statements from server-controlled evidence templates.

Produce useful deterministic insights even with an empty or sparse dataset. For example, identify a due reminder, an unresolved recorded objection, or missing evidence coverage. Mark provenance as `gemini` or `evidence_fallback` and include the report evidence version. Use a bounded operator-triggered request with no automatic retry. Deduplicate concurrent requests for the same evidence snapshot, apply a short cache and cooldown, and fall back on quota errors, timeouts, unavailable models, invalid output, and provider errors. Keep the established lead ranking worker and Phase 17 verification endpoints separate.

## 9. Security and data integrity

- Use the existing authenticated Express middleware and its production credential requirement. Apply the operator role gate to paid AI generation and any future outcome annotation. The current shared workspace authentication defines the access boundary.
- Keep reports scoped to authorized CRM data. Use parameterized queries, minimal response fields, and private or no-store caching for sensitive reports. Use the existing CSV escaping helper and verify formula protection before enabling downloads. Keep provider errors sanitized and credentials server-side.
- Keep external communication and notification dispatch disabled, keep Overpass disabled, and leave the Gemini key and model configuration in place. Use the existing application stack. The assessment used aggregate database reads and generated no Gemini requests.
- Keep existing CRM and communication history intact. Compare the pre-change backup and record fingerprints during rollout. Validate any future index or optional migration on a disposable copy and use additive deployment.

## 10. Testing and acceptance criteria

| Test area | Acceptance check |
| --- | --- |
| Metric definitions | Cover canonical deduplication, multiple provider references, manual leads, missing dates, reopened outcomes, orphaned activity, campaign linkage, and zero denominators. Prove the UI distinguishes current snapshots from period flows. |
| Time and money | Test local midnight, Asia/Kolkata, a DST zone, leap day, weekly and monthly boundaries, and comparison windows. Verify independent INR/USD minor-unit totals, malformed amounts, quote revisions, unvalued wins, scenario assumptions, and absent payment evidence. |
| Lead intelligence and AI | Assert deterministic priority and stable ties. Check suppression, missing evidence, and recommendation ordering. Mock transport success, missing key, quota, capacity failure, timeout, invalid JSON, and invented evidence. Require identical measured metrics for AI and fallback. Live Gemini acceptance requires separate approval. |
| Security and data | Exercise production authorization, invalid filters, rate limits, minimized payloads, CSV safety, sanitized errors, and database outage. Use an isolated PostgreSQL fixture for joins and aggregations. Compare a restored backup and check for unintended data or configuration changes. |
| UI and regressions | Verify filters, drill-downs, responsive layout, keyboard use, and empty states. Run `npm test`, `npm run test --workspace=client`, `npm run typecheck`, and `npm run build`. Rerun Phase 18 conversion, Phase 19 engagement, discovery, and Gemini fallback suites. Verify the built app with a disposable browser workflow. |

The repository contains 12 migrations through `20261124000000_client_engagement`. The Phase 19 completion report records 120 backend tests, eight frontend tests, TypeScript and build passes, and a restored-backup comparison. Those results are prior baseline evidence. This assessment reviewed the tests and reports and performed only read-only data checks. [Migration history](../prisma/migrations) · [Backend tests](../server/src/tests) · [Frontend tests](../client/src/tests) · [Phase 19 results](phase19-completion-report.md)

## 11. Implementation sequence

1. **20A · Reporting foundation.** Approve metric definitions and date policy. Implement typed aggregations and evidence coverage over the existing schema. Deliver date-filtered KPIs, acquisition and stage views, and documented empty states.
2. **20B · Opportunities and sales.** Add explainable lead priority, industry and location performance, quote and accepted-value breakdowns by currency, and explicit pipeline scenarios. Connect actions to the existing CRM workflows.
3. **20C · Reports and insights.** Ship deterministic weekly and monthly reports. Add optional bounded Gemini recommendations backed by the same evidence. Verify fallback and provenance in browser and API tests.
4. **20D · Verification and rollout.** Run the full regressions, mobile workflow checks, secret scan, and backup comparison. Review coverage with the owner before interpreting closed-deal trends or expanding data capture.

## 12. Risks, dependencies, and approval

- **Sparse history.** The local workspace can demonstrate coverage, filters, and safe empty states. Financial and channel-performance conclusions depend on future verified events.
- **Inconsistent historical timestamps and sources.** Date-filtered results will be narrower than all-time CRM counts. Validate relationship links and expose gaps rather than filling them with guessed values.
- **Quote and outcome ambiguity.** Payment-backed revenue, a unique deal amount when quotes overlap, and standardized historical loss reasons depend on authoritative data or operator review. They do not block the initial dashboard.
- **Gemini availability.** Phase 17 live acceptance remains pending. The reporting service and deterministic reports can ship independently of live Gemini.
- **Approval.** This deliverable is the assessment and plan. Phase 20 implementation awaits the owner's approval.
