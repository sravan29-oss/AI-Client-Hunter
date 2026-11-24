# Phase 19 implementation assessment

Repository assessment dated 24 November 2026.

## Existing modules to reuse

| Area | Repository finding |
| --- | --- |
| CRM and pipeline | `routes/leads.ts`, `leadIdentity.ts`, and `salesActivity.ts` already manage canonical leads, conversion stages, and activity. The CRM detail endpoint already reads lead-linked activity from `ActivityLog`. |
| Pitch Studio and proposals | `Pitch` already holds drafts, approval and manual-delivery timestamps, provenance, follow-up text, and proposal snapshots. `routes/pitches.ts` is the existing approval and status entry point. `DraftActions` is shared by Pitch Studio, Projects, and Follow-ups. |
| Follow-ups and notifications | `LeadFollowUp` and the follow-up reminder worker already provide durable scheduling and in-app notifications. Campaign work can link to the current follow-up form. The external discovery-alert worker is separate from client communications. |
| AI | `generateProfileOutreach` already uses stored lead details, profile and portfolio proof, and Gemini with a labeled deterministic fallback. The existing WhatsApp channel has no dedicated message format. Existing Instagram drafts use a legacy channel mapping that requires care. |
| Analytics and permissions | `routes/analytics.ts` already counts pitch and proposal outcomes. Express authenticates the workspace API, and existing operator-only mutations use the admin and developer role gate. |

## Gaps

The workspace has no saved campaign segments or contact policies. Approval currently checks the draft version and stage. It has no consent decision for the recipient, channel, or lead, and a fresh approval is not required when a contact changes. Historical delivery status has no structured objection, operator-supplied response reference, or channel-specific suppression. Follow-up text is generated as a sequence and has no recommendation based on recorded lead activity. Analytics mixes stage-derived counts with recorded outreach counts and has no campaign breakdown.

## Proposed data and API changes

- Add `OutreachCampaign` for a named email or WhatsApp campaign with saved segment criteria. Preview current matches against existing CRM fields. Store each selected lead's campaign draft on the existing `Pitch` with a nullable campaign relation and a database uniqueness constraint per campaign and lead. Support one initial draft per campaign and lead.
- Add `LeadCommunicationPolicy` for operator-recorded consent, channel restriction, opt-out, and lead-wide suppression. Email and WhatsApp policies bind to a fingerprint of the current normalized CRM email or E.164 number, so edits cannot carry consent to a new recipient. Keep policy change history in `ActivityLog`. Use recipient-wide opt-out lookup for shared contacts.
- Add nullable approval-basis and delivery-deduplication fields to `Pitch`. Preserve existing records and history. Historical approvals require a current policy check and explicit reapproval before delivery can be recorded for an unsent draft.
- Add an engagement API for campaign previews, policy changes, manually recorded responses and objections, and read-only follow-up recommendations. Reuse existing pitch generation, draft editing, approval, manual delivery, and follow-up endpoints. Keep response records and objections in the existing activity log.
- Add an Engagement workspace with campaign editing, eligible leads, a lead-level policy editor, communication timeline, and follow-up recommendations. Link from CRM and use Pitch Studio for draft editing. Add analytics for verified operator records by channel and campaign. Show how the counts were obtained.

## Security and consent requirements

Treat missing consent or a missing usable contact as ineligible. Public contact details alone supply no evidence of consent. Require an explicit operator action with a factual source reference to record consent or change suppression. Recheck approval and eligibility under database locks when recording delivery. Block duplicate content for the same normalized destination and channel. A lead-wide stop or channel opt-out blocks the affected workflow. Preserve incoming records and earlier deliveries when a lead opts out.

No lead-facing transport, automatic dispatch, messaging links, delivery tracking pixels, or inbound webhooks are required. The workspace records delivery and responses only when an operator attests to the actual event. Existing workspace authentication applies to reads and role checks apply to writes. When PostgreSQL is unavailable, engagement changes and delivery recording fail closed. Phase 17 Gemini acceptance is independent.

## Milestones and acceptance

1. Add the schema and policy enforcement. Verify missing consent, channel and lead-wide suppression, changed recipients, stale approvals, duplicate deliveries, and read-only historical records.
2. Add saved campaigns and WhatsApp drafts through Pitch Studio. Verify segmentation, opt-out filtering, retry deduplication, and deterministic fallback with saved lead facts.
3. Add response and objection recording, the communication timeline, follow-up recommendations, and campaign reporting. Verify that only actual operator records count and that a suppressed lead cannot receive an outreach recommendation on the affected channel.
4. Run backend and frontend tests, TypeScript checks, builds, and a local workflow smoke test. Verify an additive migration and compare existing CRM records with a restored backup before applying the migration locally.
