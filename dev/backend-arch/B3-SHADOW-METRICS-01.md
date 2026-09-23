# B3-SHADOW-METRICS-01 — Objective shadow parity measurement

**Date:** 2026-09-23  
**Status:** COMPLETE (awaiting first post-deploy report fill-in)  
**Depends on:** B3-SHADOW-PROD-01, B3-DEPLOY-01  
**B4 / cutover:** NO

---

## 1. Prior observability (gap)

| Location | Survives browser close? | Central? |
|----------|-------------------------|----------|
| `CZShadowDiagnosis.getStats()` | NO (in-memory) | NO |
| `console [CZ_SHADOW]` | NO | NO |
| Supabase `diagnoses` | YES | YES — but **no** MATCH/MISMATCH |
| Railway logs | short retention | NO aggregate parity |

**Answer:** with prior state alone, **NO** reliable centralized historical MATCH rate.

---

## 2. Solution (minimal)

### Table `public.shadow_results`

| Column | Type | Notes |
|--------|------|-------|
| diagnosis_id | uuid PK/FK → diagnoses | one row per diagnosis |
| shadow_status | text | `MATCH` \| `MISMATCH` \| `SHADOW_ERROR` |
| diff_fields | jsonb array | path strings only (≤40) |
| is_technical | boolean | smoke/QA exclusion |
| compared_at | timestamptz | first write |
| updated_at | timestamptz | |

RLS enabled, no anon policies (Data API closed).  
**Does not** store CLIENT_RESULT / PII / engine_result copies.

### RPC `miplan_upsert_shadow_result`

Same secret gate as B2 (`MIPLAN_BACKEND_SECRET` / `b2_persist`).  
**First write wins** (`ON CONFLICT DO NOTHING`) — retries do not inflate or flip metrics.  
Never UPDATE `diagnoses.*`.

### HTTP

`POST /v1/diagnoses/:diagnosis_id/shadow-result`

Body: `{ status, diff_fields?, is_technical? }`  
Response: `{ diagnosis_id, shadow_status, inserted, compared_at }`

### Frontend

After local compare, fire-and-forget telemetry when `diagnosis_id` exists.  
Non-blocking; failures ignored for UX.

Auto `is_technical` heuristics: `CZ_SHADOW_TECHNICAL`, `?cz_shadow_tech=1`, nombre `QA…`, email `@example.test`.

---

## 3. Authority

Browser reports **telemetry**, not business truth.  
Server diagnosis (`engine_result`, `now_ms`, `completeness`, `engine_version`) remains immutable via this path.

---

## 4. SHADOW_ERROR

| Case | Centralized? |
|------|----------------|
| Error **after** `diagnosis_id` exists | YES (rare) |
| Error **before** diagnosis created (timeout/5xx/network) | **NO** — client-only (documented limitation) |

`SHADOW_ERROR_COUNT_AVAILABLE: PARTIAL`

---

## 5. Technical exclusion

1. `shadow_results.is_technical = true`  
2. SQL also excludes QA markers on `diagnoses.input_snapshot` (nombre/email).  
3. Pre-metrics smokes (e.g. `be716a04-…`) have **no** `shadow_results` row — they do not enter the rate until telemetry exists.

Query: `dev/backend-arch/shadow-metrics-query.sql`

---

## 6. Migrations / files

| Path | Role |
|------|------|
| MCP migration `b3_shadow_results_telemetry` | applied on `hvrrywlddxpywuvqclyq` |
| `server/migrations/20260923196000_b3_shadow_results_telemetry.sql` | local mirror |
| `server/.../repository|service|routes` | upsert + route |
| `js/shadowDiagnosis.js` | report telemetry |
| `server/bin/b3-shadow-metrics-test.js` | API tests |
| `npm run b3:metrics-validate` | suite |

---

## 7. B4 criterion (unchanged from B3-SHADOW-INTEGRATION)

Suggested: ~50–100 real compared sessions, ≥99% MATCH, triage mismatches, security hardening, human go/no-go.  
**Not auto-authorized.** Small sample at 100% ≠ READY_FOR_B4.

---

## 8. First report

Filled after production deploy + controlled smoke (see closure section in final commit).
