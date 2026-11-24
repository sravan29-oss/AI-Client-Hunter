# AI Client Hunter · Phase 17 blocker closure audit

**Acceptance withheld.** The previously exposed Google credential was still loaded, Gemini quota could not be confirmed, and the configured Overpass endpoint returned no verified OSM object IDs.

The audit covered the running local backend and its configured PostgreSQL database. It ran from 23 Nov 2026, 21:30:07 IST to 23 Nov 2026, 21:31:19 IST. Phase 18 remains on hold. [Timestamped evidence](phase17-blocker-closure-2026-11-23T16-00Z.json)

## Google Places security

A private comparison against the verification record for the exposed credential matched the current backend configuration. The running backend also returned verification history scoped to that same configuration. This confirms the local deployment still uses the exposed credential. Project-side revocation remains unconfirmed.

The prior Text Search result was HTTP 200 for one named Hyderabad listing at 23 Nov 2026, 21:20:36 IST. That historical result applies to the exposed credential. No fresh Text Search was sent because a replacement was absent.

## Gemini live generation

The running backend reports Gemini configured for `gemini-2.5-flash`. Its last authenticated generation completed at 23 Nov 2026, 21:20:35 IST and returned **HTTP 429 `RESOURCE_EXHAUSTED`**. The stored error reports a quota or resource limit. Available quota could not be confirmed through the local workspace, so this audit sent zero generation requests.

The CRM returned HTTP 200 for RL Tours and Travels. Its existing Gemini ranking remains distinct from the original `evidence_fallback` qualification. No new analysis was saved. [Open the CRM lead](http://127.0.0.1:5173/?lead=3dc08561-b50e-4a81-a53e-8be0d28db9b7)

## Overpass live verification

The running backend accepted its configured interpreter at `overpass-api.de`. One bounded restaurant query ran per saved target city, with at least 31 seconds between attempts. The application capped each check at one verified mapped listing and used the configured request budget and timeout. [Overpass public instance usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)

| City | Completion time | Upstream result | Verified objects | Object ID | Query health |
| --- | --- | --- | ---: | --- | --- |
| Hyderabad | 23 Nov 2026, 21:30:08 IST | HTTP 502 | 0 | None | upstream failure |
| Karimnagar | 23 Nov 2026, 21:30:47 IST | Timed out before an HTTP response | 0 | None | unverified |
| Warangal | 23 Nov 2026, 21:31:19 IST | HTTP 502 | 0 | None | upstream failure |

Overpass remains unverified for all three cities.

## Data, security and regression checks

- Before-and-after content checks matched all 18 CRM leads, 16 pitches, 12 audits, and 1 saved source reference. No duplicate leads were created. The scheduler and external alerts stayed disabled, and the delivery queue remained empty.
- The credential scan found zero matches in 36 built frontend files, 21 local logs, 109 database diagnostic records, and 7 pre-existing report and evidence files. No credential values or fingerprints appear in this audit.
- Backend tests passed **109/109** on migrated disposable PostgreSQL with live credentials disabled. Frontend tests passed **3/3**. Neither suite had failures or skips. Both TypeScript checks and both production builds passed.

## Account-owner actions

1. Revoke exposed Google keys in their owning projects. Deploy a new backend key restricted to Places API (New) and the server egress IP, reload the backend, and confirm the replacement with a live Text Search. [Google Cloud key rotation](https://docs.cloud.google.com/docs/authentication/api-keys#rotate)
2. Check the Gemini project’s available quota for `gemini-2.5-flash` in AI Studio. Once capacity is confirmed, run one grounded generation for the existing CRM lead and verify the timestamped structured ranking. [Gemini rate limits](https://aistudio.google.com/docs/rate-limits)
3. Restore the configured Overpass interpreter or provide an authorized replacement. Repeat the three bounded city checks and record one actual OSM object ID for each.
