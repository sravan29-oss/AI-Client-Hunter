# AI Client Hunter ? Phase 17 provider resilience and acceptance

**Phase 17 acceptance is withheld.** Google Places works with the replacement key. Old-key revocation remains unconfirmed, Gemini has no passing live ranking for the approved model, and Overpass returned no verified OSM IDs. Phase 18 remains on hold. [Sanitized evidence](phase17-provider-resilience-2026-11-23T17-22-11Z.json)

## Implemented resilience

- Settings uses the dedicated, direct Gemini transport. It sends one HTTP request with redirects disabled and no automatic retry. Repeating a Settings request with the same idempotency token returns the recorded readiness state without dispatching again. The production ranking worker and acceptance checks coordinate in PostgreSQL.
- Persistent discovery first stores the deterministic qualification and draft. A separately queued Gemini result is appended only after strict JSON and evidence-ID validation. Production rankings do not advance the manual acceptance check. The CRM shows Pending, Available, Temporarily unavailable, or Failed for queued ranking work.
- Production retries are limited to HTTP 429, 502, 503 and 504. The queue allows four total attempts, uses exponential backoff with jitter, and respects HTTP Retry-After. Requests are spaced by at least 13 seconds per configuration. Three consecutive transient failures open the shared circuit for at least five minutes. Invalid credentials, unsupported models, malformed requests and invalid JSON or finding IDs stop the job.
- PostgreSQL deduplicates jobs by lead, model and measured findings. A crashed worker?s undispatched job can be reclaimed. A lost response after dispatch is recorded as unknown and is never replayed automatically. Queue updates do not create leads or replace their historical rankings.
- Overpass accepts an authorized hosted or self-hosted interpreter URL. Its existing bounded queries, timeouts, daily request limit and spacing now also enforce a cooldown after retryable upstream failures. Discovery can continue through eligible Google Places and SerpApi providers, and each provider is attempted at most once by the fallback selector. No unauthorized endpoint was substituted. [Overpass operator guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)

## Live evidence

**Google Places.** At 23 Nov 2026, 22:52:12 IST, the running backend?s replacement key returned **HTTP 200** from Places API (New) Text Search. The verification record matches the replacement configuration and returned Hyderabad place ID ChIJC0YLTmGXyzsRlhNidNMcDh8. Old-key revocation is **unconfirmed** because no Google Cloud confirmation was supplied. [Google Cloud key rotation](https://docs.cloud.google.com/docs/authentication/api-keys#rotate)

**Gemini.** The approved model remains gemini-3.8-flash. The most recent authorized live request returned **HTTP 503 UNAVAILABLE**. This implementation and its regression suite made zero live generation requests. Mocked ranking success and retry behavior are test results only. [Last live acceptance attempt](phase17-gemini-3-8-manual-retry-2026-11-23T17-09-57Z.json)

**Overpass.** One bounded query per target ran against the configured overpass-api.de interpreter.

| City | Completion time | Upstream result | OSM object ID |
| --- | --- | --- | --- |
| Hyderabad | 23 Nov 2026, 22:52:12 IST | HTTP 502 | None |
| Karimnagar | 23 Nov 2026, 22:52:44 IST | HTTP 502 | None |
| Warangal | 23 Nov 2026, 22:53:23 IST | Timeout before an HTTP response | None |

Overpass remains unverified for all three cities. Recheck with an authorized healthy endpoint before using it for recurring discovery.

## Regression and data integrity

- **114 backend tests and 3 frontend tests passed**, with zero failures and skips. Both TypeScript checks and both production builds passed. Backend integration tests used migrated disposable PostgreSQL and controlled provider responses.
- The additive migration was verified on disposable PostgreSQL with no Prisma schema difference, then applied to the running local app. The verified pre-migration backup is before-provider-resilience-2026-11-23T17-12-34.683Z.dump.
- Before-and-after contents matched all 18 CRM leads, 16 pitches, 12 audits, 15 prior provider verification records, and the saved source reference. The real Gemini job queue and notification delivery queue remained empty. External outreach and the discovery scheduler stayed disabled.
- The local scan found no configured credentials in 36 production frontend files, 25 logs, or 117 selected database diagnostic records.

## Remaining acceptance gates

1. Obtain Google Cloud confirmation that the exposed key has been revoked.
2. Complete an authorized Gemini 3.8 Flash live ranking with valid JSON, evidence-backed IDs, and successful CRM readback.
3. Record actual Overpass object IDs for Hyderabad, Karimnagar, and Warangal from a healthy authorized interpreter.
