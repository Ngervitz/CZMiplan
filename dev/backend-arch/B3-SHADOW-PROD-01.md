# B3-SHADOW-PROD-01 — Controlled production shadow activation

**Date:** 2026-09-23  
**Status:** IN_PROGRESS (pending Vercel deploy + smoke)  
**Depends on:** B3, B3-DEPLOY-01

---

## Activation mechanism

| Knob | Role |
|------|------|
| `CZ_SHADOW_MODE` | Kill switch (prod auto-shadow). `false` + redeploy disables. |
| `CZ_BACKEND_API_URL` | Public Express origin (not a secret) |
| `CZ_SHADOW_PROD_HOSTS` | Auto-enable only on these hostnames |
| `?cz_shadow=1` / `?cz_api=` | Retained for local/ops testing |

**Prod auto rule:** `CZ_SHADOW_MODE && hostname ∈ CZ_SHADOW_PROD_HOSTS && CZ_BACKEND_API_URL`.

**UX authority:** client `calcularMotor` / `st.diag` only. Shadow never renders MATCH/MISMATCH/ERROR.

---

## Targets

| Item | Value |
|------|-------|
| Frontend | `https://cz-miplan2.vercel.app` |
| Backend | `https://backend-production-17f9.up.railway.app` |
| Supabase | `hvrrywlddxpywuvqclyq` |

---

## Observability (limitation)

| Channel | What |
|---------|------|
| Browser console | `[CZ_SHADOW]` JSON: status, diagnosis_id, diff_paths, counts |
| `CZShadowDiagnosis.getStats()` | in-memory per session |
| Supabase `diagnoses` | append-only rows (server truth); **no** MATCH/MISMATCH column |

**PARTIAL:** no aggregated MATCH rate dashboard. Evaluate B4 via console sampling + Supabase row volume + manual triage of mismatches.

### B4 gate (from B3-SHADOW-INTEGRATION.md — not invented here)

| Metric | Suggested |
|--------|-----------|
| Shadow attempts | ≥ 50–100 real sessions |
| MATCH rate (excl. `diasRec`) | ≥ 99% (or 100% after triage) |
| Unexplained MISMATCH | 0 open |
| SHADOW_ERROR rate | low / infra healthy |
| Security | migrate off RPC+shared-secret (B2-SECURITY-REVIEW-01) |
| Product | human go/no-go |

**Numbers are suggestions in B3 doc — human decision required; B4 not authorized by this task.**

---

## Rollback / kill switch

1. Set `CZ_SHADOW_MODE = false` in `js/config.js`
2. Commit + push `main` → Vercel redeploy
3. Confirm `config.js` on production shows `false`

Query `?cz_shadow=1` remains available for ops tests after kill.

---

## Smoke / deploy fields (filled after verification)

| Field | Value |
|-------|-------|
| Commit | TBD |
| Vercel deployment | TBD |
| Smoke diagnosis_id | TBD |
| Smoke parity | TBD |
| Dedupe | TBD |

---

## Security

- No `MIPLAN_BACKEND_SECRET` / Supabase keys in FE
- Browser → Railway only (not Supabase RPC)
- CORS remain restricted
- No other Railway/Supabase projects touched

---

## Closure (draft)

See final report after smoke.
