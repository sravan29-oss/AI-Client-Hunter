# AI Client Hunter · Phase 18 implementation assessment

Phase 18 will extend the existing workspace from qualified lead to reviewed outreach, saved quotation, follow-up and recorded conversion. Phase 17 Gemini live acceptance remains pending.

## Repository findings

| Area | Existing behavior | Phase 18 gap |
| --- | --- | --- |
| CRM and scoring | `Lead` already stores lifecycle stages, discovery provenance, deterministic qualification and Gemini ranking history. CRM edits and pitch actions already update stages. | Connect the lead to its saved proposals and scheduled follow-ups. Make stage history consistent across write paths and expose it in lead detail. |
| Pitch Studio | The existing generator builds drafts from verified website findings, the developer profile and approved portfolio evidence. It records Gemini or deterministic provenance. | Add explicit approval for the current draft content before recording manual outreach. Record replies and conversions as activity. |
| Proposals and quotations | The rate-card API and calculator provide catalog pricing, deliverables, timeline estimates and copyable statement-of-work text. Projects currently infers contracts from general lead status. | Save a lead-linked proposal snapshot with server-calculated prices and verified lead information. Show actual drafts and outcomes in Projects. |
| Follow-ups and notifications | Pitches contain suggested follow-up text. The existing Notifications center and PostgreSQL scheduler can display and retain in-app reminders. | Persist due dates, task status and reschedules. Create one in-app reminder per due schedule. Keep follow-up text as a draft unless the operator approves or manually records an outcome. |
| Analytics | The workspace already reports lead stages, activity and outreach totals. | Report conversion outcomes, win rate, proposal counts and quoted values grouped by currency, with clear denominators. |
| Integration and permissions | Express routes use the existing authenticated workspace. PostgreSQL already holds CRM relationships. The existing setup uses a shared operator credential and does not implement tenant-level database isolation. | Keep new writes operator-only and transactional. Validate associations and ignore client-supplied totals or approval metadata. Use the existing fallback and services. |

## Data changes

- Extend `Pitch` with nullable approval and proposal snapshot fields. Use the existing pitch-to-lead relationship and lifecycle for proposals.
- Add a single lead-linked follow-up table for due dates, status and revision tracking. Use the existing `Notification` and `ActivityLog` models for reminders and history.
- Use additive PostgreSQL migration statements. Preserve existing lead, pitch, audit, ranking, source and activity records.

## Implementation sequence and acceptance criteria

1. **Pipeline and draft safety.** Operators can approve and record outreach or replies without dispatching a message. Editing the draft clears its prior approval. Stage changes, their timestamps and activity records are consistent even when requests are repeated.
2. **Proposals and follow-ups.** Proposals snapshot persisted lead facts and selected catalog packages at server-calculated totals. The operator can schedule, reschedule, complete or cancel a lead follow-up. A due reminder appears once in the existing Notifications center.
3. **Connected UI and reporting.** Lead detail links to Pitch Studio, Projects and follow-up management. Projects shows saved proposals and the manual commercial outcome. Analytics reports conversions and keeps currency totals separate. Gemini and deterministic output stay distinguishable.
4. **Verification.** Run authenticated workflow checks, isolated PostgreSQL integration tests, frontend tests, TypeScript checks and production builds. Confirm record contents are preserved and external delivery and Overpass are disabled. Google Places and SerpApi stay available through their existing adapters.
