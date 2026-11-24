# AI Client Hunter · Phase 17 live acceptance

**Decision on 23 November 2026 (IST): Partial verification. Final live acceptance is withheld.** SerpApi discovery, independent city filtering, measured opportunity analysis and CRM persistence passed. Authenticated Gemini analysis, Google Places discovery and a live Overpass query remain open.

The inspected target was the running **local development** application on port 5173, its API on port 5000, and its configured PostgreSQL database `ai_client_hunter`. No hosted production deployment or cloud account was supplied. The request records include UTC timestamps, redacted Google responses, and per-city results. [Recorded evidence](phase17-live-evidence-2026-11-23.json)

## Provider outcomes

| Check | Result | Evidence |
| --- | --- | --- |
| Gemini model transport | Reachable; authenticated inference requires credentials | A credential-free GET for `gemini-2.5-flash` returned HTTP 403 `PERMISSION_DENIED`. The running health endpoint and a freshly loaded backend reported no configured Gemini key. Windows process, user and machine environment checks also found none. Zero generation requests were made for the business. |
| Gemini fallback | Verified working | A fresh HTTPS fetch of the selected business returned 200. The application ranked measured findings locally with `generatedBy=evidence_fallback`. Every recommended opportunity mapped to an observed finding. The unknown budget remained null. |
| Google Places API (New) | Failed live; underlying Cloud setting undetermined | Two Text Search requests for one Hyderabad place each returned identical HTTP 403 responses. The discovery adapter used its standard listing mask. The diagnostic request used only `places.id`. Both carried the backend API key in a header over HTTPS. |
| Overpass | Requires endpoint | The provider returned `missing_configuration` for `OSM_OVERPASS_URL`. There was no authorized interpreter URL to contact. Zero Overpass and zero Nominatim requests were made. |
| SerpApi | Verified working in all three cities | Three independent live Maps searches for the saved industry “Travel agencies” returned HTTP 200 and provider status `Success`. Each response contained 20 raw listings. The adapter sampled five per city. |

### Google Places denial

The live discovery request was `POST https://places.googleapis.com/v1/places:searchText`, with JSON content type, a populated `X-Goog-Api-Key` header, an explicit `X-Goog-FieldMask`, and page size one. The exact JSON error below was identical for the listing mask and the ID-only mask. Google supplied no `details`, reason code, project identifier or billing diagnosis.

```json
{"error":{"code":403,"message":"The caller does not have permission","status":"PERMISSION_DENIED"}}
```

The response establishes that Google denied permission for this caller. The selected fields alone do not explain the denial. The local workspace has no Google Cloud CLI, application-default credential or standard gcloud login store with which to read the key’s owning project, enabled services, billing linkage, or application and API restrictions. No restriction was changed. An operator with Cloud read access should identify the project that owns this backend key, confirm active billing and that `places.googleapis.com` is enabled and allowed on the key, then check the backend’s public egress IP against the key’s application restriction. Repeat the ID-only probe from that backend. [Google Places setup](https://developers.google.com/maps/documentation/places/web-service/get-api-key) · [Google API key management](https://docs.cloud.google.com/docs/authentication/api-keys)

## Targeting and data provenance

With operator approval, revision 2 of **WEB APPLICATION** was corrected through the profile API. It had a single city value of `Hyderabad , Karimanagar , Warangal`. Revision 3 has separate entries for **Hyderabad, Karimnagar and Warangal, India**, each keeping the existing daily 09:00 Asia/Calcutta schedule. The API and PostgreSQL independently returned the corrected values. Auto Hunter stayed disabled. Another existing profile entry combines five industries into one label. The verified searches used the separate, valid “Travel agencies” industry.

| City queried | Listings checked | Matched own profile location and industry | Matched either other target |
| --- | ---: | ---: | ---: |
| Hyderabad | 5 | 5 | 0 |
| Karimnagar | 5 | 4 | 0 |
| Warangal | 5 | 3 | 0 |

The rejected Karimnagar listing and one Warangal listing were classified as car rental agencies. Another Warangal result had a Hanamkonda address and failed the city filter. These checks use actual provider listing addresses and categories with the saved profile and the same matcher Auto Hunter calls. They do not establish a global restriction on manual CRM entry, CSV import or manual discovery. The Overpass adapter relies on its queried administrative boundary and can retain an object's more specific locality tag. Its live city behavior remains unverified.

**Pune investigation.** Neither Spice Kitchen nor George Restaurant nor Pune appeared in any current lead, saved discovery search, Auto Hunter job or activity record in the inspected database. The prior Pune probe was a provider-only check. This run added just one Hyderabad lead. Of the 17 pre-existing records, 16 were labeled Bengaluru and one had no city. All have a source label, but none has a Phase 17 discovery-source reference or target snapshot. The manual record “Apex Digital Health” also matches a fixture name in the scraper tests. The match alone cannot establish how that row was created. Historical test-data isolation and full per-lead provenance cannot be certified from these records.

## CRM evidence

With operator approval, **RL Tours and Travels | Travel agency in Hyderabad** was saved with its fallback assessment. The live SerpApi listing identified an Ameerpet, Hyderabad address in India, provider reference `ChIJZ7XfE4yXyzsRjXNZRs_os2g`, discovery timestamp `2026-11-23T06:39:05.977Z`, and website `rltours.in`. The application's guarded inspector fetched the page afresh at `2026-11-23T06:39:11.973Z`.

- Eight image elements had missing or empty alternative text. The recommendation calls for checking which images are decorative.
- Two navigation anchors had empty or placeholder destinations in the downloaded HTML. Their behavior in an interactive browser would need separate testing before calling them broken links.

The profile score was **73/100** against a minimum of **60**. The approved one-lead write used the application's transactional identity and source-recording service. An independent HTTP GET returned the committed provider reference, target location and both findings. Chrome opened the CRM deep link and displayed the business, “Measured evidence,” both findings and “SerpApi Local (Hyderabad).” It was a targeted save of the reviewed result, and no Auto Hunter job or outreach draft was created. [Open the local CRM record](http://127.0.0.1:5173/?lead=3dc08561-b50e-4a81-a53e-8be0d28db9b7)

## Database and security

| Evidence | Result |
| --- | --- |
| Existing data | Before-and-after content digests matched for all original 17 leads, 15 pitches, 12 audits, 3 portfolio projects, the developer profile, all jobs, saved searches, notifications and delivery records. The final CRM served 18 leads. The approved changes added one lead, one provider reference and two activity events, and advanced the targeting profile by one revision. Provider counters and website inspection caching were used during the live checks. |
| Backup | `tmp/database-backups/before-phase17-2026-11-22T18-07-25.455Z.dump` exists, 70,401 bytes. `pg_restore --list` succeeded and listed data entries for leads, pitches, audits, profiles and projects. SHA-256 is `260c849f01163427826d44ac0f21851f6ac1cf1ee77a625ace44c4410c5af36e`. This pass checked the archive catalog. |
| Secret scan | No exact configured provider credentials or matching credential patterns were found in 36 frontend build files, 15 workspace logs, or 84 local database diagnostic records. External infrastructure and chat history are outside that scan. |
| Outreach | The external-alert master switch, email alerts, Telegram alerts and scheduler were off. The running backend reported mail and Telegram unconfigured. The delivery table was empty before and after. This acceptance run sent no email, SMS, WhatsApp message or call. The historical database contains one email pitch marked SENT and seven manual “marked sent” actions. These actions record an operator confirmation, so they cannot prove historical transport or external activity either way. |
| Regression checks | Fifteen focused tests passed, zero failed or skipped. The three suites covered Gemini provenance and fallback, discovery qualification, and ideal-client-profile matching. Model success/failure fixtures in these suites are distinct from the live results above. |

## Outstanding acceptance gates

1. Configure `GEMINI_API_KEY` in the backend secret store, reload the service, and run one authenticated analysis of the existing Hyderabad lead. Verify the model-selected finding IDs against its website evidence and confirm the committed CRM result.
2. Resolve the Google Cloud permission denial using the owning project's settings, then record a successful Places API (New) discovery response.
3. Configure an authorized `OSM_OVERPASS_URL` under that server's usage policy, then record an independent health check and one small city query with its returned OSM object identity.
4. If acceptance requires every historical lead to have verifiable source and location, review the 17 legacy records with an operator. Keep unknown provenance explicit. The earlier Google and SerpApi keys were pasted into chat and should be rotated in their provider accounts and replaced only on the backend.

Phase 18 was not started.
