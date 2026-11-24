# AI Client Hunter · Phase 17 Gemini quota diagnosis

**Gemini generation remains unverified.** Google rejected the last authenticated generation with HTTP 429 `RESOURCE_EXHAUSTED`. The specific quota, rate limit, or billing condition could not be determined from the saved error and available account access.

## Confirmed evidence

| Check | Result |
| --- | --- |
| Backend configuration | The running local backend returned HTTP 200 from its health endpoint and reported Gemini configured for `gemini-2.5-flash`. The loaded key and model configuration matched the stored verification record for the earlier 429. The app uses the Gemini Developer API and has no explicit Google Cloud project ID configured. |
| Historical generation | On 23 November 2026 at **21:20:35 IST**, the authenticated `generateContent` request received HTTP 429 `RESOURCE_EXHAUSTED` from Google. PostgreSQL verification record `1453e253-3e3b-4c41-9e25-06b455ad7fe9` contains the sanitized provider classification. It contains no failed quota metric or billing detail. |
| Live model metadata | On 23 November 2026 at **21:55:51 IST**, one authenticated `GET /v1beta/models/gemini-2.5-flash` returned HTTP 200. The response identified `models/gemini-2.5-flash` and included `generateContent` in its supported methods. This verifies metadata access. Generation capacity remains unknown. [Gemini Models API](https://aistudio.google.com/api-reference/models) |
| App-side request cap | The discovery budget was configured for eight Gemini requests per run. The recorded 429 came from the dedicated verification request to Google. That path makes one direct provider request outside the discovery budget. |
| Google project diagnostics | The workspace had no usable Google Cloud CLI, application-default credentials, configured project identifier, or authorized account connector. The key’s owning project, active model limits, recent usage, remaining quota, billing tier and account standing were inaccessible. [Gemini rate limits](https://aistudio.google.com/docs/rate-limits) · [Gemini billing](https://aistudio.google.com/docs/billing) |

The audit made **one metadata request and zero generation requests**. It made no changes to Google Places, historical Gemini rankings, or deterministic fallback results. External outreach stayed disabled. Phase 18 remains on hold.

## Evidence needed from the account owner

Open the Gemini key’s owning project in AI Studio. Compare requests per minute, input tokens per minute, and requests per day for `gemini-2.5-flash` against the usage around **21:20 IST on 23 November**. Check the project’s billing status and any applicable spend limits. A redacted screenshot or export showing the active project, model, limit or billing status, and relevant time window is sufficient for follow-up diagnosis. Keep the API key private. [AI Studio rate limits](https://aistudio.google.com/rate-limit) · [AI Studio billing documentation](https://aistudio.google.com/docs/billing)

A fresh authenticated generation must succeed before Gemini can be marked verified for Phase 17.
