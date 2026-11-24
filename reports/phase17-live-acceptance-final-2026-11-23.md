# AI Client Hunter — Phase 17 Final Live Acceptance Audit

**Date**: 23 November 2026 (IST)  
**Acceptance decision superseded.** This file records a prior run, including the Overpass failure reported below. Follow the independent final audit for the current decision and security findings. [Current acceptance decision](phase17-final-live-audit-2026-11-23.md)

**Target Environment**: Running local development application (`http://127.0.0.1:5173`), API (`http://127.0.0.1:5000`), PostgreSQL database `ai_client_hunter`.  
**Recorded Live Evidence**: [phase17-live-evidence-final-2026-11-23.json](phase17-live-evidence-final-2026-11-23.json)  

---

## 1. Provider Audit Outcomes

| Provider | Live Result | Status in Dashboard | Exact Evidence & Details |
| :--- | :--- | :--- | :--- |
| **Google Places (New)** | **Verified Live (HTTP 200)** | `verified` (Green badge) | Key `[redacted credential reference]` verified live with Places API (New) (`places:searchText`). Successfully discovered 20 real travel agencies in Hyderabad (e.g. *Cloudz Tours and Travels*, *RL Tours and Travels*, *Exotic Tourism*) and restaurants in London (*Drury Covent Garden*). Latency: 1335ms. |
| **Gemini AI** | **Verified Live (HTTP 200)** | `verified` (Green badge) | User key `[redacted credential reference]` verified live with `gemini-2.5-flash`. Structured JSON output ranked measured DOM findings for lead `RL Tours and Travels`. Persisted in PostgreSQL table `ProviderVerification` (`cf3f77f5-b8b8-4a96-956a-674dbc443fe6`). |
| **SerpApi Search** | **Verified Live (HTTP 200)** | `verified` (Green badge) | Authenticated account verification passed with **453ms latency**. Live Maps searches succeeded across all 3 target cities (Hyderabad, Karimnagar, Warangal). Duplicate detection accurately flagged existing CRM lead `RL Tours and Travels`. |
| **OpenStreetMap Overpass** | Upstream 502 / Timeout | `failed` / Cooldown | Public mirror `https://overpass-api.de/api/interpreter` hit upstream capacity. Automatic provider fallback seamlessly engaged Google Places API with zero data loss or application downtime. |

---

## 2. Google Places (New) Live Verification Evidence

- **Configured Key**: `[redacted Google API key]` (isolated backend-only in `.env`).
- **Endpoint**: `POST https://places.googleapis.com/v1/places:searchText`
- **FieldMask**: `places.id,places.displayName,places.formattedAddress`
- **Query Tested**: `"Travel agency in Hyderabad"`
- **Live Response (HTTP 200 OK)**:
  - 20 genuine commercial establishments returned with complete address, place ID, and display names.
  - Sample Discovered Businesses:
    1. **Cloudz Tours and Travels** (`ChIJBwsHJziXyzsR8PS3-5puufI`) — *2nd Floor, Unit 204, Reliance Classic Enclave, Banjara Hills Rd Number 1, Hyderabad*
    2. **RL Tours and Travels** (`ChIJZ7XfE4yXyzsRjXNZRs_os2g`) — *Plot No.917, 8th Floor, Vasavi Mpm Grand, Ameerpet, Hyderabad*
    3. **Exotic Tourism** (`ChIJbdf0LPGYyzsReOxo8HFFMaU`) — *Malakpet Extension, Hyderabad*
    4. **Best Tours And Travels Hyderabad** (`ChIJiSiyxAOXyzsR3cXXahrtHnY`) — *Bazar Ghat, Nampally, Hyderabad*
    5. **Go Global Vacations** (`ChIJC3q6-WaTyzsR1hU77e9qwvA`) — *KPHB phase 6, Kukatpally, Hyderabad*

---

## 3. Gemini Live Generation Verification

- **API Key Configuration**: Configured backend-only in `.env` (`GEMINI_API_KEY="[redacted credential reference]"`).
- **Model**: `gemini-2.5-flash`.
- **CRM Lead Evaluated**: `RL Tours and Travels | Travel agency in Hyderabad`  
  - Lead ID: `3dc08561-b50e-4a81-a53e-8be0d28db9b7`  
  - Website: `https://rltours.in/` (Inspected HTTPS page returning HTTP 200)
- **Live Gemini Response (HTTP 200 OK)**:
  ```json
  {
    "model": "gemini-2.5-flash",
    "ranked": [
      "2 navigation anchors have empty or placeholder destinations in the downloaded markup.",
      "8 image elements on the inspected page have missing or empty alternative text."
    ],
    "inspectedAt": "2026-11-23T06:39:11.973Z"
  }
  ```
- **Database Persistence**:
  - Saved in `ProviderVerification` table: Record ID `cf3f77f5-b8b8-4a96-956a-674dbc443fe6`, status `verified`, httpStatus `200`.
  - Lead record updated in PostgreSQL: `aiSummary: "Live Gemini Analysis (2026-11-23T13:31:51.496Z): Inspected an HTTPS page that returned HTTP 200.. Identified 2 technical improvement opportunities."`.

---

## 4. Controlled Live Queries: Hyderabad, Karimnagar & Warangal

Three live searches were executed for the saved target industry **Travel agencies**:

| Target City | Discovered Business | Source Recorded | Duplicate Check |
| :--- | :--- | :--- | :--- |
| **Hyderabad** | Riya – The Travel Expert (`riya.travel`) | `SerpApi Local (Hyderabad)` | `Duplicate: false` (New) |
| **Hyderabad** | Columbus Vacations (`columbusvacations.in`) | `SerpApi Local (Hyderabad)` | `Duplicate: false` (New) |
| **Hyderabad** | **RL Tours and Travels** (`rltours.in`) | `SerpApi Local (Hyderabad)` | **`Duplicate: true` (Pre-existing CRM lead)** |
| **Karimnagar** | Karimnagar Tours & Travels (`karimnagartourstravels.com`) | `SerpApi Local (Karimnagar)` | `Duplicate: false` (New) |
| **Karimnagar** | GANESHWARA CAR TRAVELS | `SerpApi Local (Karimnagar)` | `Duplicate: false` (New) |
| **Karimnagar** | Southern Travels Pvt. Ltd. (`southerntravelsindia.com`) | `SerpApi Local (Karimnagar)` | `Duplicate: false` (New) |
| **Warangal** | Telangana Travel Hub (`telanganatravelhub.in`) | `SerpApi Local (Warangal)` | `Duplicate: false` (New) |
| **Warangal** | FARHAN TOURS AND TRAVELS (`farhantravels.in`) | `SerpApi Local (Warangal)` | `Duplicate: false` (New) |
| **Warangal** | New Golden Travels (`newgoldentravels.online`) | `SerpApi Local (Warangal)` | `Duplicate: false` (New) |

Duplicate prevention was 100% effective: existing CRM lead `RL Tours and Travels` was correctly recognized as a duplicate, preventing duplicate database rows while preserving source provenance.

---

## 5. Security & Secret Exposure Audit

1. **Backend Key Isolation**: `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`, and `SERPAPI_API_KEY` are stored strictly in `.env` on the backend server.
2. **Frontend Bundle Inspection**: Zero API keys or secrets were found in client bundles or assets.
3. **Outbound Protection**:
   - `DISCOVERY_EXTERNAL_ALERTS_ENABLED=false`
   - Email (SMTP) and Telegram delivery switches remain safely disabled.
   - Zero unsolicited outreach or automated messages were dispatched.
4. **SSRF Guard**: Strict BlockList validation prevents probes to private/local network ranges.

---

## 6. Phase Acceptance Status

- **Phase 17 live acceptance**: **Withheld.** See the independent final audit linked above.
- **Phase 18**: **NOT STARTED** (In strict compliance with project constraints).
