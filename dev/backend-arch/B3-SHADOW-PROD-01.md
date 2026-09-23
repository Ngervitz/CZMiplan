# B3-SHADOW-PROD-01 — Controlled production shadow activation

**Date:** 2026-09-23  
**Status:** **COMPLETE**  
**Depends on:** B3, B3-DEPLOY-01  
**Production cutover / B4:** **NO**

---

## Activation mechanism

| Knob | Role |
|------|------|
| `CZ_SHADOW_MODE` | Kill switch. `true` = prod auto-shadow allowed; `false` + redeploy disables. |
| `CZ_BACKEND_API_URL` | Public Express origin (not a secret): Railway HTTPS |
| `CZ_SHADOW_PROD_HOSTS` | Auto-enable only on listed hostnames |
| `?cz_shadow=1` / `?cz_api=` | Retained for local/ops testing (no manual params required in prod) |

**Prod auto rule:**  
`CZ_SHADOW_MODE === true` **and** `hostname ∈ CZ_SHADOW_PROD_HOSTS` **and** non-empty `CZ_BACKEND_API_URL`.

Localhost + `config.local.js` still allowed when flag is on (dev).

**UX authority:** client `calcularMotor` / `st.diag` only. Shadow never surfaces MATCH / MISMATCH / SHADOW_ERROR / diagnosis_id to the user.

---

## Targets

| Item | Value |
|------|-------|
| Frontend production | `https://cz-miplan2.vercel.app` |
| Backend | `https://backend-production-17f9.up.railway.app` |
| Supabase | CZMiplan / `hvrrywlddxpywuvqclyq` |
| Commit (activation) | `30c7fd3b4992096bf609b90b952b25dade0d9b5b` |
| Commit (compare fix) | `82bbb89fef2c228c1ad373af97aa5f6b02a525f1` |
| Vercel | auto-deploy from `main` — verified live `config.js` + `shadowDiagnosis.js` |

---

## Request contract (unchanged)

POST `/v1/diagnoses` with EngineInput only + `X-MiPlan-Anonymous-Id`.  
**Not sent as authority:** `engine_result`, `completeness`, `engine_version`, `now_ms`, `diagnosis_id`.

---

## Deduplication

Session memory: fingerprint of EngineInput JSON + `_inFlight` + 15s cooldown after error.  
Smoke: second identical call → **no second POST** (`PASS`).

Append-only persistence unchanged.

---

## Observability

| Channel | What |
|---------|------|
| Browser console | `[CZ_SHADOW]` JSON: status, diagnosis_id, diff_paths, counts (no PII dumps) |
| `CZShadowDiagnosis.getStats()` | in-memory per tab/session |
| Supabase `diagnoses` | append-only server rows; **no** MATCH/MISMATCH column |

**OBSERVABILITY_READY: PARTIAL** — sufficient to accumulate evidence manually; no aggregate dashboard. Do not invent new persistence in this task.

### B4 gate (from `B3-SHADOW-INTEGRATION.md`, unchanged)

| Metric | Suggested (human decision) |
|--------|----------------------------|
| Shadow attempts | ≥ 50–100 real sessions |
| MATCH rate (excl. `diasRec`) | ≥ 99% after triage |
| Unexplained MISMATCH | 0 open |
| SHADOW_ERROR rate | low / infra healthy |
| Security | migrate off RPC+shared-secret (B2-SECURITY-REVIEW-01) |
| Product | explicit go/no-go |

B3 doc did **not** freeze hard numbers; suggestions above require human confirmation before B4.

---

## Smoke (controlled, no `?cz_shadow`)

| Field | Result |
|-------|--------|
| Shadow enabled by default on prod host | YES |
| Shadow POST | 200 |
| `diagnosis_id` | `be716a04-0c2b-4fd5-9632-105ff0d41928` |
| Parity | **MATCH** |
| Supabase row | present (nombre marker `QA B3-SHADOW-PROD-01`) |
| Dedupe | PASS |
| Failure (dead API) | UX client diag intact; `SHADOW_ERROR` logged only |
| User-visible technical errors | none |

Compare fix applied during task: client snapshot now includes `completeness_recomputed.derived_checks` (aligned with engine) to avoid false MISMATCH.

---

## Rollback / kill switch

1. Set `CZ_SHADOW_MODE = false` in `js/config.js`
2. Commit + push `main` (Vercel redeploys)
3. Confirm production `js/config.js` shows `false`

Ops may still use `?cz_shadow=1` after kill for isolated tests.

---

## Security

| Check | Result |
|-------|--------|
| `MIPLAN_BACKEND_SECRET` in FE | NONE |
| Supabase credentials in FE | NONE |
| Browser → Railway only | YES |
| CORS `cz-miplan2.vercel.app` | PASS |
| Other Railway/Supabase projects | untouched |

---

## Pendientes

1. Accumulate real-shadow evidence (counts / MATCH rate) before B4.
2. Harden B2 RPC → standard server credential.
3. Optional: persist shadow outcomes server-side if console sampling is insufficient (separate task).

---

## Closure

```
B3_SHADOW_PROD_STATUS: COMPLETE
PRODUCTION_FRONTEND: https://cz-miplan2.vercel.app
BACKEND_URL: https://backend-production-17f9.up.railway.app
SHADOW_ENABLED_BY_DEFAULT: YES
CLIENT_REMAINS_UX_AUTHORITY: YES
SERVER_RESULT_USED_FOR_UX: NO
KILL_SWITCH: PASS
SHADOW_REQUEST_REMOTE: PASS
SUPABASE_PERSISTENCE: PASS
SMOKE_DIAGNOSIS_ID: be716a04-0c2b-4fd5-9632-105ff0d41928
SMOKE_PARITY: MATCH
DUPLICATE_PROTECTION: PASS
FAILURE_NON_BLOCKING: PASS
CORS_PRODUCTION: PASS
SECRET_EXPOSURE: NONE_FOUND
PARITY_CORPUS: 18/18 PASS
FRONTEND_REGRESSION: PASS
OBSERVABILITY_READY: PARTIAL
PRODUCTION_CUTOVER: NO
READY_TO_ACCUMULATE_SHADOW_EVIDENCE: YES
READY_FOR_B4: NO
```
