# AI Client Hunter · Phase 17 final live audit

**Acceptance withheld as of 23 November 2026.** The fresh Gemini generation and Overpass search failed, and Google key rotation remains outstanding. Google Places (New) and SerpApi passed their live checks. The audit used the local backend and its configured PostgreSQL database. Phase 18 remains on hold. [Timestamped evidence](phase17-final-live-audit-evidence-2026-11-23.json)

## Provider results

| Provider | Observation | Acceptance result |
| --- | --- | --- |
| Gemini | The configured backend sent one authenticated `gemini-2.5-flash:generateContent` request for RL Tours and Travels in Hyderabad at 21:20:35 IST. Google responded with **HTTP 429 `RESOURCE_EXHAUSTED`**. | **Blocked by provider quota or resource limits.** The attempt has no candidate JSON to validate or save. Record `1453e253-3e3b-4c41-9e25-06b455ad7fe9` stores the sanitized failure. |
| Google Places (New) | A direct `POST https://places.googleapis.com/v1/places:searchText` using the configured backend key returned **HTTP 200** at 21:20:36 IST. One named Hyderabad listing returned with place ID `ChIJC0YLTmGXyzsRlhNidNMcDh8`. | **Passed functional check.** The tested credential worked on this request. Rotation and revocation require separate confirmation. |
| Overpass | A single bounded Hyderabad restaurant query returned **HTTP 502** at 21:20:37 IST. | **Failed live.** No OSM object was returned. Karimnagar and Warangal were not tested against Overpass after the upstream error. [Overpass instance usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) |
| SerpApi | Three live Google Maps searches for travel agencies returned **HTTP 200**, provider status `Success`, and 20 raw listings each. | **Passed live across the three active city targets.** |

## Targeting and CRM

| Target city | Sample checked | Matched city and industry | Existing CRM matches |
| --- | ---: | ---: | ---: |
| Hyderabad | 5 | 5 | 1 |
| Karimnagar | 5 | 4 | 0 |
| Warangal | 5 | 4 | 0 |

None of the sampled listings matched either of the other active cities. The Warangal sample rejected an address in Hanamkonda. The Karimnagar sample rejected a listing whose category did not match travel agencies.

The live SerpApi listing for **RL Tours and Travels** resolved to the existing Hyderabad CRM record using provider reference `ChIJZ7XfE4yXyzsRjXNZRs_os2g`. The before-and-after comparison found identical contents for all 18 CRM leads and all saved provider references. The audit performed no listing imports.

The CRM API returned HTTP 200 and showed the prior Gemini verification linked to this same lead. That stored record, `cf3f77f5-b8b8-4a96-956a-674dbc443fe6`, reports HTTP 200 on 23 November at 19:01:44 IST. It is historical evidence. The lead's original qualification still identifies its analysis as `evidence_fallback`. The fresh failed attempt was recorded separately and added no Gemini analysis. [Open the local CRM lead](http://127.0.0.1:5173/?lead=3dc08561-b50e-4a81-a53e-8be0d28db9b7)

## Security

- An earlier report contained the full value of the Google credential still loaded by the backend at audit time. I removed the full value and shortened credential references from the local reports and evidence files. Earlier copies remain outside this audit. Project-side revocation and deployment of a fresh credential remain unverified.
- The scan found zero configured secret values or matching credential patterns across 36 production frontend files, 19 local logs, 106 selected database diagnostic records, and the health, readiness, and CRM API responses.
- External alerts, the scheduler, email alerts, and Telegram alerts were off. The delivery queue stayed empty before and after the audit.
- I removed the backend-configured Overpass URL from browser-visible diagnostics and updated the Places remediation text to retain IP restrictions.

## Tests and builds

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Backend suite, fresh migrated disposable PostgreSQL and live credentials disabled | 109 | 0 | 0 |
| Frontend suite | 3 | 0 | 0 |

TypeScript checks and both production builds completed successfully. The initial backend run inherited the workspace's live Gemini key, yielding 107 passes and two failures in tests that expect deterministic qualification and outreach drafts. The isolated rerun disabled live credentials and ran all 109 tests again. These tests and builds are independent of the live provider results above.

## Account-owner actions

1. Revoke the Google credentials exposed in reports or chat, and provision a fresh backend key restricted to Places API (New) and the server's egress IP. Update the backend secret, reload it, and rerun the Places check. [Google Places key setup](https://developers.google.com/maps/documentation/places/web-service/get-api-key)
2. Check the configured Gemini project's quota and billing. Once generation capacity is restored, rerun the measured-evidence ranking for RL Tours and Travels and verify the new timestamped result on its CRM lead.
3. Restore the configured Overpass endpoint or supply an authorized instance. Run bounded checks for the active cities and record returned OSM object IDs before closing the gate.
