# AI Client Hunter · Phase 17 Gemini 3.8 Flash HTTP 503 investigation

**Gemini generation remains unverified.** Google attributed the approved request's HTTP 503 to high demand. The public status dashboard showed normal service afterward, and the authenticated model metadata endpoint returned HTTP 200. Generation recovery for this project is still unconfirmed.

## Confirmed observations

| Evidence | Observation |
| --- | --- |
| Approved generation request | At **22:33:19.756 IST on 23 November 2026** (`17:03:19.756Z`), one authenticated request for `gemini-3.8-flash` returned **HTTP 503 `UNAVAILABLE`** in **1,347 ms**. Google said the model was experiencing high demand. The response contained neither a `Retry-After` header nor a structured retry delay or quota violation. [Sanitized request evidence](phase17-gemini-3-8-live-acceptance-2026-11-23T17-03-17Z.json) |
| Model status | At **22:35:35 IST**, a read-only authenticated `GET /v1beta/models/gemini-3.8-flash` returned **HTTP 200** and advertised `generateContent`, `countTokens`, `createCachedContent`, and `batchGenerateContent`. Google lists the model as stable and documents structured output. [Official model documentation](https://aistudio.google.com/docs/models/gemini-3.8-flash) |
| Public service status | At **22:36:41 IST**, Google's AI Studio and Gemini API dashboard showed **All Systems Operational** with **All Tiers** selected. No incident dated 23 November appeared in the displayed history. The public aggregate cannot confirm capacity for this particular model or project at the earlier request time. [Official service status](https://aistudio.google.com/status) |
| CRM and outreach | Read-only checks found 18 leads, 16 pitches, 12 audits and an empty delivery queue. RL Tours and Travels still had its prior verified Gemini ranking and its original `evidence_fallback` analysis. The scheduler, external alerts, email alerts and Telegram alerts were disabled. |

The provider's high-demand message is the confirmed explanation it supplied for this request. It establishes neither a project quota problem nor a broader outage. Temporary model-level contention is consistent with the message, but the duration, affected traffic tiers, and recovery time remain unknown.

## Existing retry behavior

- **Provider Readiness** makes one direct Axios request for Gemini. It disables redirects, sets a 15-second timeout, and records the outcome in PostgreSQL. The 30-second cooldown prevents immediate repeated checks. It does not enqueue a retry. [Provider readiness service](../server/src/services/providerReadiness.ts)
- **General Gemini analysis** can make up to two provider calls through `callGemini`. It tries the SDK first and then makes an immediate REST attempt if the SDK fails or returns no text and budget remains. The installed SDK performs one fetch per call. This application path has no provider-aware delay, jitter, or `Retry-After` handling. [Gemini service](../server/src/services/gemini.ts)
- **Auto Hunter** has durable scheduling and exponential delay for retryable discovery searches. Its queue runs discovery jobs and may process multiple leads. The readiness route accepts a lead ID for an immediate check, and its table stores outcomes. There is no due-time or one-attempt job for a scheduled Gemini acceptance recheck. [Discovery jobs](../server/src/services/discovery/discoveryJobs.ts) · [Provider readiness route](../server/src/routes/providerReadiness.ts)

## One future retry

The application can perform one operator-approved retry through Provider Readiness, using the approved model, the existing lead, and the same stored measurements. A delayed automatic retry would need a dedicated one-shot trigger outside the existing readiness flow or a new persisted job. Either approach would need to bind the approval to the model, lead, and evidence timestamp, record that the attempt was consumed before dispatch, and stop on any failure or ambiguous timeout. This prevents a restart or duplicate invocation from initiating another request. The acceptance check should continue to require valid JSON, evidence-backed IDs, and CRM readback.

Google recommends backoff for transient 503s. This request supplied no recovery estimate, so the dashboard and metadata checks cannot establish a safe retry time. Another live request requires explicit approval. [Google retry guidance](https://aistudio.google.com/docs/troubleshooting#retry-strategy)

This investigation sent zero generation requests and scheduled none. The configured model and CRM were untouched. **Phase 18 remains on hold.**
