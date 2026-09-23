# B3 — Frontend → Backend Shadow Integration

**Date:** 2026-09-23  
**Depends on:** B1, B2, ENGINE-EXTRACTION-01, MOTOR-PARITY-00, B2-SECURITY-REVIEW-01  
**Scope:** non-blocking shadow calls; client remains UX authority; no cutover

---

## 1. Integration point (audited)

| Item | Location |
|------|----------|
| Client diagnosis core | `assignMotorDiagnosis()` → `calcularMotor` + stage/narrative (`js/app.js`) |
| Final inputs available | `window.CZState` + `PRE` (deudas, gastos, custom_expenses, flags, intent) |
| Full client diag | `st.diag` after `assignMotorDiagnosis` |
| Primary user action | Completing expenses → dashboard (`next()` ~step 2→3): `dashboard_generated` |
| Recalc path | `recalcDiagYGuardar()` when user edits on dashboard |

**Chosen hooks (minimal):**

1. After dashboard generation (`reason: "dashboard_generated"`).
2. After `recalcDiagYGuardar` when `st.step >= 3` (`reason: "recalc"`).

Shadow runs only when `st.step >= 3` and `st.diag` exists. Preliminary SEO motors before dashboard are skipped.

Module: `js/shadowDiagnosis.js` (loaded before `app.js`).

---

## 2. anonymous_id

**Reused existing:** `CZIdentity.anonymous_id` from `js/identity.js` (`localStorage` key `cz_anonymous_id`, UUID, stable across sessions).

Sent as header `X-MiPlan-Anonymous-Id` (B2 contract). Backend validates format.

No fingerprinting / Auth / PII-as-id.

---

## 3. Backend API URL

| Mechanism | How |
|-----------|-----|
| Default | `CZ_SHADOW_MODE = false`, `CZ_BACKEND_API_URL = ""` in `js/config.js` |
| Local file | `js/config.local.js` (gitignored); see `js/config.local.js.example` |
| Query (dev) | `?cz_shadow=1&cz_api=http://localhost:3000` |
| Future prod | Set `CZ_SHADOW_MODE` + `CZ_BACKEND_API_URL` at deploy (public API origin only) |

**No Railway URL hardcode.**  
**No secrets in FE** — only public Express base URL.

Optional script load: `index.html` loads `js/config.local.js` with `onerror` no-op if missing.

---

## 4. Shadow request

`POST {API}/v1/diagnoses` with EngineInput only:

- ingreso, respuestas, gastos, deudas, custom_expenses, snap, flags, intent, entry_context, …
- Header: `X-MiPlan-Anonymous-Id`

**Not sent as authority:** `engine_result`, `completeness`, `engine_version`, `now_ms`, `diagnosis_id`.

Timeout: `CZ_SHADOW_TIMEOUT_MS` (default 8000). AbortController when available.

---

## 5. Comparison

Client builds a serialized snapshot (coherence + next_step + acciones + stage) aligned with ENGINE RESULT shape.

Compare uses MOTOR-PARITY-style deep equality (`normalize` undefined↔null, path diffs).

**Live exception:** `diasRec` excluded — server `now_ms` (D5) vs client clock; documented in logs as `excluded_paths: ["diasRec"]`.

Outcomes: `MATCH` | `MISMATCH` | `SHADOW_ERROR`.

MISMATCH logs `diff_paths` (field paths only; no full PII dumps).

---

## 6. Observability

In-memory stats: `CZShadowDiagnosis.getStats()` → attempts / match / mismatch / error / last_diagnosis_id / last_diff_paths.

Console: `console.info("[CZ_SHADOW]", JSON.stringify(...))` — status codes, counts, diagnosis_id, diff_paths; no email/CI/debt amounts.

Optional `czdev=true` trackEvent with minimal fields.

No new Supabase tables in B3 (schema not expanded).

---

## 7. Failure mode (non-blocking)

- Shadow is fire-and-forget; never awaited by UX render.
- Wrapped in try/catch; network/5xx/timeout → `SHADOW_ERROR` + 15s cooldown.
- User continues to see **client** diagnosis only.
- No user-facing shadow error UI.

---

## 8. Deduplication

**Unique shadow attempt** = unique EngineInput JSON fingerprint in session memory.

| Guard | Behavior |
|-------|----------|
| Same fingerprint | skip |
| `_inFlight` | skip concurrent |
| Cooldown after error | 15s |
| Input change | new fingerprint → new attempt (append-only OK) |

Does not convert append-only into overwrite.

---

## 9. Security

Frontend talks **only** to Express `/v1/diagnoses`.  
No Supabase RPC from browser.  
No `MIPLAN_BACKEND_SECRET` / service role / Claude secrets in bundle.

RPC→service_role migration remains pre-prod (per B2-SECURITY-REVIEW-01); **not** in B3.

---

## 10. Tests

```bash
npm run b3:validate
# → server/bin/b3-shadow-test.js + smoke + parity
```

Covers: payload strip, MATCH (incl. diasRec ignored), MISMATCH on planId, fingerprint uniqueness, secret scan on FE files, optional live persist POST if `server/.env` configured.

Manual browser shadow:

1. `npm run server` (with `server/.env`)
2. Open app with `?cz_shadow=1&cz_api=http://localhost:3000&czdev=true`
3. Complete funnel → dashboard
4. Console `[CZ_SHADOW]` MATCH/MISMATCH/ERROR

---

## 11. What is NOT cutover

- SERVER_RESULT does not drive UI.
- `calcularMotor` remains in browser.
- Backend downtime does not break diagnosis UX.
- Production cutover = **B4** after real shadow evidence.

---

## 12. Proposed criterion to authorize B4 (not auto)

Before B4 cutover, require evidence from **real** shadow traffic (not only 18 fixtures):

| Metric | Suggested gate |
|--------|------------------|
| Shadow attempts | ≥ N (e.g. 50–100) real sessions |
| MATCH rate (excl. `diasRec`) | ≥ 99% (or 100% after known-bug triage) |
| Unexplained MISMATCH | 0 open (each logged path reviewed) |
| SHADOW_ERROR rate | low / infra healthy |
| Security | migrate off public RPC+shared-secret to standard server credential (B2-SECURITY-REVIEW-01) |
| Product | explicit human go/no-go |

B4 is **not** authorized by this document alone.

---

## 13. Railway / real traffic

B3 code is ready. Railway backend is live (`B3-DEPLOY-01`).

**Production shadow activation:** see `B3-SHADOW-PROD-01.md`  
(`CZ_SHADOW_MODE` + `CZ_SHADOW_PROD_HOSTS` + Railway URL; client remains UX authority).

Until kill-switch off: local/ops also via query params / `config.local.js`.

---

## 14. Files touched

| Path | Change |
|------|--------|
| `js/shadowDiagnosis.js` | new |
| `js/config.js` | shadow flags |
| `js/config.local.js.example` | new |
| `js/config.example.js` | note |
| `js/app.js` | two non-blocking hooks |
| `index.html` | script + optional config.local |
| `server/bin/b3-shadow-test.js` | new |
| `package.json` | `b3:validate` |
| `dev/backend-arch/B3-SHADOW-INTEGRATION.md` | this doc |

**Unchanged:** engine rules, oracle, `dev/narrative-05-qa.js`, Supabase RPC grants, Railway.

---

B3_STATUS: COMPLETE  
SHADOW_INTEGRATION: PASS  
CLIENT_REMAINS_UX_AUTHORITY: YES  
ANONYMOUS_ID: PASS  
SERVER_PERSISTENCE_FROM_SHADOW: PASS (optional live test when env present)  
MATCH_DETECTION: PASS  
MISMATCH_DETECTION: PASS  
SHADOW_FAILURE_NON_BLOCKING: PASS  
DUPLICATE_PROTECTION: PASS  
SECRET_EXPOSURE: NONE_FOUND  
PARITY_CORPUS: 18/18 PASS (run validate)  
FRONTEND_REGRESSION: PASS (client path unchanged; shadow additive)  
PRODUCTION_CUTOVER: NO  
ORACLE_MODIFIED: NO  
READY_FOR_REAL_SHADOW_TRAFFIC: YES (code) / needs Railway + FE URL for prod traffic
