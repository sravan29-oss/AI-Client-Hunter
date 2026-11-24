# AI Client Hunter ? Phase 17 Gemini model availability

**Recommended replacement: gemini-3.8-flash.** It appears in the catalog returned for the currently configured key and advertises `generateContent`. Google documents it as a stable text-output model with structured-output support. This is a compatibility recommendation. Authenticated generation and project quota remain unverified. [Gemini 3.8 Flash model documentation](https://aistudio.google.com/docs/models/gemini-3.8-flash)

## Authenticated catalog result

The backend key was used for one read-only `GET https://generativelanguage.googleapis.com/v1beta/models` at **23 November 2026 at 22:26:01 IST**. Google returned **HTTP 200** with a complete catalog of **65 IDs**, of which **49** advertise `generateContent`. [Gemini Models API](https://aistudio.google.com/api-reference/models) ? [Sanitized catalog evidence](phase17-gemini-model-availability-2026-11-23T16-56Z.json)

The catalog also lists `gemini-2.5-flash` with `generateContent`. The preceding authenticated generation request returned HTTP 404 and said the model was unavailable to new users. A catalog method indicates an advertised capability. Project-specific generation access still requires a successful request. [Prior generation evidence](phase17-gemini-live-generation-2026-11-23T16-49-35Z.json)

## Compatibility with the existing backend

- The backend sends text to `v1beta/models/{model}:generateContent` and requests `application/json`. The readiness path requires a response with finish reason `STOP` and validates a strict `{ orderedEvidenceIds: string[] }` object. Every ID must correspond to a measured finding and appear exactly once. [Readiness implementation](../server/src/services/providerReadiness.ts)
- Google documents structured outputs for Gemini 3.8 Flash. The model's catalog entry advertises `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent`. The app supplies the JSON MIME type and validates its schema locally. Its current request body does not send a provider-side JSON schema. [Gemini 3.8 Flash capabilities](https://aistudio.google.com/docs/models/gemini-3.8-flash) ? [Structured output documentation](https://aistudio.google.com/docs/structured-output)
- The catalog also contains image, speech, preview, and embedding entries. A `generateContent` method alone does not establish support for text-only structured ranking across those entries. The stable Gemini 3.8 Flash model is the recommendation for ranking the existing measured website evidence.

No generation requests were sent. The configured model remains `gemini-2.5-flash`. CRM rankings and deterministic fallback were left intact, and external alerts stayed disabled. Any configuration switch or generation test requires approval. Phase 18 remains on hold.

## Returned model IDs and advertised methods

| Model ID | Advertised methods |
| --- | --- |
| `antigravity-preview-05-2026` | `generateContent`, `countTokens` |
| `antigravity-preview-09-2026` | `generateContent`, `countTokens` |
| `antigravity-preview-latest` | `generateContent`, `countTokens` |
| `aqa` | `generateAnswer` |
| `deep-research-max-preview-04-2026` | `generateContent`, `countTokens` |
| `deep-research-preview-04-2026` | `generateContent`, `countTokens` |
| `gemini-2.5-computer-use-preview-10-2025` | `generateContent`, `countTokens` |
| `gemini-2.5-flash` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-2.5-flash-image` | `generateContent`, `countTokens`, `batchGenerateContent` |
| `gemini-2.5-flash-lite` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-2.5-flash-native-audio-latest` | `countTokens`, `bidiGenerateContent` |
| `gemini-2.5-flash-native-audio-preview-09-2025` | `countTokens`, `bidiGenerateContent` |
| `gemini-2.5-flash-native-audio-preview-12-2025` | `countTokens`, `bidiGenerateContent` |
| `gemini-2.5-flash-preview-tts` | `countTokens`, `generateContent` |
| `gemini-2.5-pro` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-2.5-pro-preview-tts` | `countTokens`, `generateContent`, `batchGenerateContent` |
| `gemini-3-flash-preview` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-3-pro-image` | `generateContent`, `countTokens`, `batchGenerateContent` |
| `gemini-3-pro-image-preview` | `generateContent`, `countTokens`, `batchGenerateContent` |
| `gemini-3.1-flash-image` | `generateContent`, `countTokens`, `batchGenerateContent` |
| `gemini-3.1-flash-image-preview` | `generateContent`, `countTokens`, `batchGenerateContent` |
| `gemini-3.1-flash-lite` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-3.1-flash-lite-image` | `generateContent`, `countTokens`, `batchGenerateContent` |
| `gemini-3.1-flash-lite-preview` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-3.1-flash-live-preview` | `bidiGenerateContent` |
| `gemini-3.1-flash-tts-preview` | `generateContent`, `countTokens`, `batchGenerateContent` |
| `gemini-3.1-pro-preview` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-3.1-pro-preview-customtools` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-3.5-flash` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-3.5-flash-lite` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-3.5-live-translate-preview` | `bidiGenerateContent` |
| `gemini-3.5-transcribe` | `generateContent`, `countTokens` |
| `gemini-3.5-transcribe-live` | `bidiGenerateContent` |
| `gemini-3.6-flash` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-3.7-flash` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-3.8-flash` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-3.8-flash-lite-tts` | `generateContent`, `countTokens`, `batchGenerateContent` |
| `gemini-3.8-flash-tts` | `generateContent`, `countTokens`, `batchGenerateContent` |
| `gemini-3.8-live` | `bidiGenerateContent` |
| `gemini-3.8-live-extended-thinking` | `bidiGenerateContent` |
| `gemini-4-argon` | `generateContent`, `countTokens`, `batchGenerateContent` |
| `gemini-4-carbon` | `generateContent`, `countTokens`, `batchGenerateContent` |
| `gemini-4-hydrogen` | `generateContent`, `countTokens`, `batchGenerateContent` |
| `gemini-4-neon` | `generateContent`, `countTokens`, `batchGenerateContent` |
| `gemini-decision-1` | `createDecision` |
| `gemini-embedding-001` | `embedContent`, `countTextTokens`, `countTokens`, `asyncBatchEmbedContent` |
| `gemini-embedding-2` | `embedContent`, `countTextTokens`, `countTokens`, `asyncBatchEmbedContent` |
| `gemini-embedding-2-preview` | `embedContent`, `countTextTokens`, `countTokens`, `asyncBatchEmbedContent` |
| `gemini-flash-latest` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-flash-lite-latest` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-nano-banana-2.1` | `generateContent`, `countTokens`, `batchGenerateContent` |
| `gemini-omni-1.1-flash` | `generateContent`, `countTokens` |
| `gemini-omni-1.2-flash` | `generateContent`, `countTokens` |
| `gemini-omni-flash-preview` | `generateContent`, `countTokens` |
| `gemini-pro-latest` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-robotics-er-2-preview` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` |
| `gemini-robotics-er-2-streaming-preview` | `bidiGenerateContent` |
| `gemma-4-26b-a4b-it` | `generateContent`, `countTokens` |
| `gemma-4-31b-it` | `generateContent`, `countTokens` |
| `genie-4` | `bidiGenerateContent` |
| `lyria-3-clip-preview` | `generateContent`, `countTokens` |
| `lyria-3-pro-preview` | `generateContent`, `countTokens` |
| `lyria-3.5` | `generateContent`, `countTokens` |
| `lyria-realtime-exp` | `bidiGenerateMusic` |
| `nano-banana-pro-preview` | `generateContent`, `countTokens`, `batchGenerateContent` |
