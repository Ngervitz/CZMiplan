# B3-SHADOW-METRICS-01 — Objective shadow parity measurement

**Date:** 2026-09-23  
**Status:** **COMPLETE**  
**Depends on:** B3-SHADOW-PROD-01, B3-DEPLOY-01  
**Deployed commit:** `7be8c780c6fe9be06dd8ee5aafb9fb7966fcb780`  
**B4 / cutover:** **NO**

---

## 1. Prior observability (gap)

| Location | Survives browser close? | Central? |
|----------|-------------------------|----------|
| `CZShadowDiagnosis.getStats()` | NO (in-memory) | NO |
| `console [CZ_SHADOW]` | NO | NO |
| Supabase `diagnoses` | YES | YES — **no** MATCH/MISMATCH |
| Railway logs | ephemeral | NO aggregate parity |

**Central historical MATCH rate before this task: NO.**

---

## 2. Solution

### Table `public.shadow_results`

| Column | Notes |
|--------|-------|
| `diagnosis_id` | PK/FK → `diagnoses` (one row per diagnosis) |
| `shadow_status` | `MATCH` \| `MISMATCH` \| `SHADOW_ERROR` |
| `diff_fields` | jsonb string array (paths only, ≤40) |
| `is_technical` | smoke/QA exclusion |
| `compared_at` | first write |

Telemetry only — no CLIENT_RESULT, no PII dump, no copy of `engine_result`.

### RPC `miplan_upsert_shadow_result`

Secret-gated (same B2 secret). **First write wins** (`ON CONFLICT DO NOTHING`). Never mutates `diagnoses.*`.

### HTTP

`POST /v1/diagnoses/:diagnosis_id/shadow-result`  
Body: `{ status, diff_fields?, is_technical? }`

### Frontend

After compare, fire-and-forget POST when `diagnosis_id` exists. Non-blocking.

`is_technical` auto: `CZ_SHADOW_TECHNICAL`, `?cz_shadow_tech=1`, nombre `QA…`, `@example.test`.

---

## 3. Authority

Browser report = **shadow telemetry**, not business truth.  
`engine_result` / `now_ms` / `completeness` / `engine_version` unchanged by this path.

---

## 4. SHADOW_ERROR

| Case | Centralized? |
|------|----------------|
| After `diagnosis_id` exists | YES (rare) |
| Before diagnosis created | **NO** — client-only |

→ `SHADOW_ERROR_COUNT_AVAILABLE: PARTIAL`

---

## 5. Metrics query

File: `dev/backend-arch/shadow-metrics-query.sql` (operator / MCP only — **no** public analytics endpoint).

Excludes `is_technical` + QA nombre/email markers.

---

## 6. Technical tests

| Kind | Handling |
|------|----------|
| Local API tests | `is_technical=true` |
| Prod smoke `QA B3-SHADOW-PROD-01` | auto technical |
| Pre-metrics smokes (`be716a04-…`) | no `shadow_results` row → not in rate |

Append-only diagnoses **not** deleted.

---

## 7. First report (2026-09-23 post-deploy)

| Bucket | TOTAL | MATCH | MISMATCH | ERROR |
|--------|-------|-------|----------|-------|
| TECHNICAL | 3 | 2 | 1 | 0 |
| **REAL** | **0** | **0** | **0** | **0** |

Observation window (all rows): `2026-09-23T20:12:17Z` → `2026-09-23T20:16:06Z`

Prod smoke after metrics deploy:

- `diagnosis_id`: `3452e918-2202-4b00-845c-9e0299329e14`
- parity: MATCH
- telemetry: inserted `true` (`is_technical`)

`REAL_SHADOW_MATCH_RATE`: **N/A** (denominator 0).  
Small technical sample at high MATCH ≠ READY_FOR_B4.

---

## 8. B4 criterion (from B3-SHADOW-INTEGRATION — unchanged)

Suggested ~50–100 **real** compared sessions, ≥99% MATCH, triage mismatches, security hardening, human go/no-go.  
Not auto-authorized by this document.

---

## Closure

```
B3_SHADOW_METRICS_STATUS: COMPLETE
CENTRAL_METRICS_AVAILABLE: YES
METRICS_PERSISTED: YES
MATCH_COUNT_AVAILABLE: YES
MISMATCH_COUNT_AVAILABLE: YES
SHADOW_ERROR_COUNT_AVAILABLE: PARTIAL
DIFF_FIELDS_AVAILABLE: YES
DUPLICATE_COUNTING_PROTECTED: YES
TECHNICAL_TESTS_EXCLUDABLE: YES
REAL_SHADOW_TOTAL: 0
REAL_SHADOW_MATCH: 0
REAL_SHADOW_MISMATCH: 0
REAL_SHADOW_ERROR: UNKNOWN
REAL_SHADOW_MATCH_RATE: N/A
PARITY_CORPUS: 18/18 PASS
FRONTEND_REGRESSION: PASS
SECRET_EXPOSURE: NONE_FOUND
CLIENT_REMAINS_UX_AUTHORITY: YES
PRODUCTION_CUTOVER: NO
READY_TO_MEASURE_B4_CRITERION: YES
READY_FOR_B4: NO
```
