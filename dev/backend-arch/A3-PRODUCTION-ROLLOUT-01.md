# A3-PRODUCTION-ROLLOUT-01 — JANUS + Mi Plan (pre-cPanel)

**Tipo:** PRODUCTION ROLLOUT  
**Fecha:** 2026-09-25  
**Alcance:** JANUS + Mi Plan only. **Credizona/cPanel NO tocados.**

```text
A3_PRODUCTION_ROLLOUT_01_STATUS: STOPPED_PREFLIGHT_GIT
CREDIZONA_PRODUCTION_CHANGED: NO
CPANEL_CHANGED: NO
PRODUCTION_CHANGES_MADE: NO
```

---

## 1. Preflight

### Targets confirmed

| Target | Expected | Observed | OK |
|--------|----------|----------|----|
| JANUS Railway project | `bountiful-energy` | `bountiful-energy` (`14b1a58d-…`) | YES |
| JANUS service | `mie-backend` | `mie-backend` (`2d66f5bb-…`) online | YES |
| JANUS Supabase | `usezztlmwfgjcidcrrde` | Railway `SUPABASE_URL` host = `usezztlmwfgjcidcrrde` | YES |
| Mi Plan Railway project | `CZMiplan` | Listed (`39066e90-…`) | YES |
| Mi Plan service ID | `67ef05f5-…` | `backend` SUCCESS deploy `02da7caa-…` | YES |
| Mi Plan backend URL | `https://backend-production-17f9.up.railway.app` | `/health` → 200 ok | YES |
| Mi Plan Supabase | `hvrrywlddxpywuvqclyq` | Railway `SUPABASE_URL` ref match | YES |
| Frontend | `https://cz-miplan2.vercel.app` | target known (not deployed this phase) | YES |
| Avoid | `divine-warmth`, `skillful-reflection` | Listed; **not used** | YES |

**JANUS public base URL candidates (same service):**
- `https://s.credizona.net`
- `https://mie-backend-production.up.railway.app`

`.env.example` Mi Plan documents `JANUS_HANDOFF_BASE_URL=https://mie-backend-production.up.railway.app`.  
Both resolve to the same Railway service. Prefer documented Railway hostname unless ops dictate custom domain.

### Git

| Repo | Branch | HEAD commit | A3/JOURNEY in HEAD? | Working tree |
|------|--------|-------------|---------------------|--------------|
| JANUS `mie-backend` | `main` | `94aba7ef…` (docs JANUS-DATA-GAP-01) | **NO** — handoff files untracked | Dirty: A3 files + many `_tmp-*` + minor SMS test string |
| Mi Plan `CZMiplan` | `main` | `a99a2a91…` (B3 shadow metrics docs) | **NO** — journey/handoff untracked | Dirty: A3/JOURNEY + ENTRY-01 virgin diffs + scripts |

**Railway deploy source:** JANUS service linked to GitHub `Ngervitz/mie-backend`; active deploy = HEAD above (**without A3**).

**Verdict GIT:** `FAIL_AMBIGUOUS` — cannot deploy A3 without explicit commit(+push) of scoped files.  
Deploying via `railway up` from dirty trees would risk shipping unrelated `_tmp` / unscoped changes.  
User rule: no commit unless requested → **STOP** for human authorization to commit A3-only sets.

### Tests (local, re-run 2026-09-25)

| Suite | Result |
|-------|--------|
| JANUS `unit-miplan-handoff.js` | PASS |
| JANUS `unit-cz-tracking-events.js` | PASS |
| Mi Plan `journey-01-test.js` | PASS |
| Mi Plan `handoff-redeem-test.js` | PASS |
| Mi Plan `smoke.js` | PASS |
| Mi Plan `entry-01-test.js` | PASS |
| Engine parity | 18/18 PASS |

### Migrations safety (static review)

**JANUS** `migrations/20260925_miplan_handoff_tokens.sql`:
- `CREATE TABLE IF NOT EXISTS miplan_handoff_tokens` (hash, purpose, lrw ref, issued/expires/redeemed/revoked)
- UNIQUE token_hash; indexes; `redeem_miplan_handoff_token()` atomic UPDATE
- No DROP of business tables; no DELETE; forward-safe → **SAFE**

**Mi Plan** `server/migrations/20260925120000_miplan_journey_01.sql`:
- `CREATE TABLE IF NOT EXISTS journeys`; nullable `diagnoses.journey_id`
- `DROP FUNCTION` only old 8-arg `miplan_persist_diagnosis` then recreate with `p_journey_id DEFAULT NULL` (compatible; preserves financial captures path)
- No NOT NULL on historical diagnoses → **SAFE**

### ENV mapping (names only)

| Var | Where | Status now |
|-----|-------|------------|
| `CZ_MIPLAN_HANDOFF_HMAC_SECRET` | JANUS Railway `mie-backend` | **ABSENT** |
| `MIPLAN_HANDOFF_REDEEM_SECRET` | JANUS Railway | **ABSENT** |
| `MIPLAN_HANDOFF_REDEEM_SECRET` | Mi Plan Railway `backend` | **ABSENT** |
| `JANUS_HANDOFF_BASE_URL` | Mi Plan Railway | **ABSENT** |
| Credizona HMAC counterpart | cPanel | **OUT OF SCOPE** this phase |
| Frontend A3 secrets | Vercel | **NOT REQUIRED** (FE calls Mi Plan BE only) |

`CZ_TRACKING_HMAC_SECRET` present on JANUS — must remain separate (not reused).

### Checkpoint A

```text
PRE_FLIGHT: FAIL
GIT_JANUS: FAIL_UNCOMMITTED_A3
GIT_MIPLAN: FAIL_UNCOMMITTED_A3_JOURNEY
TESTS_JANUS: PASS
TESTS_MIPLAN: PASS
JANUS_MIGRATION_SAFE: PASS
MIPLAN_MIGRATION_SAFE: PASS
ENV_MAPPING_CONFIRMED: PASS
TARGETS_CONFIRMED: PASS
```

**STOP before Phase B** per rollout rules.

---

## 2. Phases B–K

**Not executed.** No migrations applied, no ENV set, no deploys.

---

## 3. Human unblock required

To resume this rollout, authorize explicitly:

1. **Commit (+ push) JANUS** scoped A3 only, e.g.:
   - `migrations/20260925_miplan_handoff_tokens.sql`
   - `src/lib/czMiplanHandoffHmac.js`
   - `src/lib/miplanHandoffTokens.js`
   - `src/routes/miplan-handoff.js`
   - `src/app.js`, `src/config/env.js`, `.env.example`
   - `scripts/unit-miplan-handoff.js`
   - **Exclude** `_tmp-*`, unrelated SMS string churn unless intentional

2. **Commit (+ push) CZMiplan** scoped A3 + JOURNEY (+ ENTRY-01 virgin if intended for same deploy):
   - `server/migrations/20260925120000_miplan_journey_01.sql`
   - `server/modules/journey/**`, `server/modules/handoff/**`
   - `server/http/routes/handoff.js` + app/config/diagnosis wiring
   - `js/handoffEntry.js`, `vercel.json`, docs
   - FE wires (`index.html`, `js/app.js`, `js/shadowDiagnosis.js`)
   - Confirm whether ENTRY-01 `js/config.js` virgin changes ship in same commit

3. Re-run **A3-PRODUCTION-ROLLOUT-01** from Phase B.

Optional: if commit authorization is granted in-chat (“commit and continue”), agent can create scoped commits and proceed.

---

## 4. Notes / doc deltas

- `JANUS-MIPLAN-CONTRACT-01.md` lives under **JANUS** `mie-backend/dev/backend-arch/` (untracked); not under CZMiplan as A3 doc path sometimes implies.
- Frontend does **not** need handoff secrets.
- Integration test without Credizona still expected `INTEGRATION_TEST_BLOCKED_UNTIL_CPANEL: YES` unless a secure harness exists post-deploy.

---

## 5. Status block (this run)

See agent final response.
