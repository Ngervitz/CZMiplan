# B2-SECURITY-REVIEW-01 — Supabase RPC Security

**Date:** 2026-09-23  
**Scope:** audit-only of B2 persistence surface  
**Project:** CZMiplan · ref `hvrrywlddxpywuvqclyq` (verified via MCP `get_project`)  
**Other projects:** not inspected / not modified  
**Code/SQL/grants/secrets changed in this review:** NONE

---

## 0. Verdict (executive)

| Decision | Value |
|----------|-------|
| CURRENT_RPC_SECURITY | **NEEDS_HARDENING** |
| RECOMMENDED_LONG_TERM_ACCESS | **STANDARD_SERVER_CREDENTIAL** |
| BLOCKS_B3 | **NO** |

The current design is **not an open unauthorized-write path** without the backend secret. It is an acceptable interim gate for B2 given environmental constraints, but it is **not** the preferred long-term model: `anon` can invoke SECURITY DEFINER RPCs; authorization is a shared secret rather than a non-public server credential; a secret leak allows forging persisted diagnoses and reading by id.

No critical “anyone with anon key can write without secret” finding was confirmed.

---

## 1. RPC inventory (CONFIRMED_FROM_DB)

### 1.1 `public.miplan_persist_diagnosis`

| Attribute | Evidence |
|-----------|----------|
| Schema | `public` |
| Args | `p_secret text, p_anonymous_id text, p_tenant_id text, p_now_ms bigint, p_engine_version text, p_input_snapshot jsonb, p_engine_result jsonb, p_completeness jsonb` |
| Returns | `uuid` (new `diagnosis_id`) |
| Security | **SECURITY DEFINER** |
| search_path | **fixed** `SET search_path TO 'public', 'miplan_private'` |
| Owner | `postgres` |
| EXECUTE grants | `anon`, `authenticated`, `service_role`, `postgres` (`PUBLIC` execute: **false**) |
| Tables touched | `miplan_private.backend_secrets` (SELECT), `public.identities_anonymous` (INSERT/UPSERT last_seen), `public.diagnoses` (INSERT only) |
| Dynamic SQL | **NONE** (static PL/pgSQL) |

Secret check (first side-effecting path):

```
SELECT secret FROM miplan_private.backend_secrets WHERE name = 'b2_persist';
IF expected IS NULL OR p_secret IS DISTINCT FROM expected THEN
  RAISE EXCEPTION 'MIPLAN_UNAUTHORIZED';
END IF;
-- then upsert identity + INSERT diagnosis
```

Wrong/missing secret fails **before** any INSERT (CONFIRMED_FROM_DB function body; also exercised by B2 test `DB_FAILURE_NO_FALSE_SUCCESS`).

### 1.2 `public.miplan_get_diagnosis`

| Attribute | Evidence |
|-----------|----------|
| Schema | `public` |
| Args | `p_secret text, p_diagnosis_id uuid` |
| Returns | `jsonb` row or null |
| Security | **SECURITY DEFINER** |
| search_path | fixed `public, miplan_private` |
| Owner | `postgres` |
| EXECUTE | same as persist (`anon`, `authenticated`, `service_role`) |
| Ops | SELECT one diagnosis by id after secret check |
| App HTTP | **not** exposed as public GET in B2 (repository helper / tests only) |

---

## 2. Secret (`MIPLAN_BACKEND_SECRET`) — no values reproduced

| Question | Finding |
|----------|---------|
| Generated/configured | Operator/setup inserts into `miplan_private.backend_secrets` (`name='b2_persist'`); ENV mirror `MIPLAN_BACKEND_SECRET` |
| Stored | DB private table + local `server/.env` (gitignored) |
| Reaches backend | `dotenv` → `config.backendSecret` → repository RPC `p_secret` |
| Transmitted | HTTPS PostgREST `/rest/v1/rpc/...` body param (TLS) |
| Logs | Error handler logs `code`/`path`/`status` only — **does not** log secret (CONFIRMED_FROM_CODE `errorHandler.js`) |
| Persisted in diagnoses | **No** — not written into `input_snapshot` / `engine_result` columns |
| Frontend / bundle | **NONE_FOUND** in `js/` (grep) |
| Hardcoded in repo | **NONE_FOUND** in tracked sources; `.env.example` has empty placeholder |
| Comparison | Exact string `IS DISTINCT FROM` (not hashed; not constant-time) |
| Rotation | Manual: update DB row + ENV; **no automated rotation procedure documented** |

**Process note (not a live code leak):** during B2 setup the secret was passed through MCP/agent tooling. Treat as **possible historical exposure outside the git tree** → recommend rotation before production cutover. Not present in tracked repo files (CONFIRMED).

---

## 3. RLS / table permissions (CONFIRMED_FROM_DB)

| Table | RLS enabled | Policies | anon SELECT/INSERT/UPDATE/DELETE | anon TRUNCATE |
|-------|-------------|----------|----------------------------------------|---------------|
| `public.diagnoses` | YES | **0** | all **false** | **true** |
| `public.identities_anonymous` | YES | **0** | (same pattern) | **true** (privilege listing) |
| `miplan_private.backend_secrets` | YES | **0** | SELECT **false**; schema USAGE **false** | n/a |

Interpretation:

- Data API **cannot** SELECT/INSERT/UPDATE/DELETE diagnosis rows as `anon`/`authenticated` (RLS + no DML grants for those ops).
- `TRUNCATE` privilege exists for `anon`/`authenticated` on public tables. In Postgres, TRUNCATE is not filtered by RLS. However:
  - `anon`/`authenticated` have `rolcanlogin = false` (cannot open a SQL session as those roles).
  - PostgREST Data API does **not** expose TRUNCATE.
  - Therefore: **not a confirmed remote wipe path via anon key HTTP**, but still **unnecessary privilege → harden by REVOKE**.

`miplan_private` USAGE denied to anon → secrets table not reachable via Data API.

Roles: `service_role` has `rolbypassrls=true` (standard). Unused `miplan_app` is `NOLOGIN` / `NOBYPASSRLS` (from B2 cleanup).

---

## 4. Abuse analysis

| Scenario | Result |
|----------|--------|
| Insert without secret | **Blocked** — exception before write |
| Invoke RPC with anon key | **Yes** — EXECUTE granted to `anon` |
| Wrong secret → write? | **No** — fails first |
| Control server-authoritative fields via Express? | **No** — service strips client `now_ms` / result / completeness / diagnosis_id; engine runs server-side |
| Control those fields via **direct RPC** with stolen secret? | **Yes** — caller supplies `p_now_ms`, `p_engine_version`, `p_engine_result`, `p_completeness`, `p_tenant_id` → **forge persisted diagnosis** |
| SQL injection / dynamic SQL | **NONE_FOUND** |
| Read via RPC | **Yes if secret known** (`miplan_get_diagnosis`) |
| Modify/delete existing diagnoses via RPC | **No UPDATE/DELETE** in functions; append INSERT only |
| SECURITY DEFINER / search_path hijack | search_path **pinned** → **PASS** for classic hijack |
| Replay if secret leaked | **Yes** — secret is long-lived shared gate; unlimited inserts/reads by id |

Browser substituting for backend: requires both reachable Supabase URL + anon key + **backend secret**. Anon key is currently server `.env` only (not in FE). Secret must not ship to browser. Express path remains the authority **when clients use only the API**. Direct RPC is the bypass surface if secret leaks.

---

## 5. Backend authority (Express path)

CONFIRMED_FROM_CODE `server/modules/diagnosis/service.js`:

- `diagnosis_id`: generated by DB default / RPC return only after persist  
- `now_ms`: `Date.now()` server; client `now_ms` deleted from input  
- `engine_version` / `engine_result` / completeness: from `runEngine`, not client  

Repository only persists what the service computed. **Express contract preserves server authority.** The RPC itself is a lower-level write API gated by secret, not by “engine must have run.”

---

## 6. Architecture comparison

| | Current: RPC HTTPS + shared secret | Future: Railway + standard server credential (`service_role` or equivalent) |
|--|--------------------------------------|-----------------------------------------------------------------------------|
| Security | Shared secret; anon may EXECUTE DEFINER RPCs; leak ⇒ forge/read | Credential never meant for browsers; table access without public EXECUTE of DEFINER writers |
| Complexity | Extra RPCs + private secret table | Fewer moving parts once service_role available |
| Rotation | Manual dual update (DB + ENV) | Rotate platform key / ENV only |
| Maintainability | Custom gate; advisors WARN on anon+DEFINER | Aligns with Supabase norms |
| Attack surface | Public RPC endpoints + secret channel | Private server→DB; revoke anon EXECUTE on writers |

**Recommendation:** keep current mechanism for **dev/B2 continuity**; plan **STANDARD_SERVER_CREDENTIAL** before broad production exposure / B3 traffic that puts real user PII at scale. Do not rip out RPC solely for aesthetics while service_role remains unavailable in this agent environment.

---

## 7. Findings (evidence-backed only)

### F1 — HIGH (design / leak impact) — forge via RPC if secret known
Anyone who can call `miplan_persist_diagnosis` **with the correct secret** can persist arbitrary `engine_result` without `runEngine`.  
**Mitigation path:** service_role direct inserts from Railway only; revoke `anon`/`authenticated` EXECUTE on persist/get RPCs.

### F2 — MEDIUM — `miplan_get_diagnosis` callable by anon (secret-gated)
Read-by-id exists as public RPC. No B2 HTTP route, but PostgREST exposes it.  
**Mitigation:** revoke anon EXECUTE; or remove/move function out of exposed API schema when unused.

### F3 — LOW/MEDIUM — TRUNCATE (and TRIGGER/REFERENCES) granted to anon/authenticated
Confirmed `has_table_privilege(...TRUNCATE)=true` with no SELECT/INSERT. Not a confirmed HTTP exploit path; still revoke for defense in depth.

### F4 — LOW — secret compared as plaintext, non-constant-time
Acceptable for interim; prefer HMAC/hash compare or eliminate shared secret via service_role.

### F5 — PROCESS — possible secret exposure outside git during B2 MCP setup
Rotate before production. Not found in tracked repo / FE.

### Non-findings
- No FE embedding of `MIPLAN_BACKEND_SECRET`  
- No unauthorized insert **without** secret  
- No dynamic SQL injection in RPCs  
- search_path fixed on DEFINER functions  
- Append-only at RPC logic (INSERT only; no update/delete helpers)

---

## 8. Proposed minimal hardening (NOT APPLIED — await decision)

1. `REVOKE EXECUTE ON FUNCTION ... FROM anon, authenticated;` keep `service_role` (requires switching app to service_role).  
2. Or interim: keep secret gate but `REVOKE EXECUTE` from `authenticated` if unused; shorten get RPC lifetime.  
3. `REVOKE TRUNCATE, TRIGGER, REFERENCES ON diagnoses, identities_anonymous FROM anon, authenticated;`  
4. Rotate `MIPLAN_BACKEND_SECRET` + DB row before prod.  
5. Document Railway ENV: prefer `SUPABASE_SERVICE_ROLE_KEY`, retire public EXECUTE on writer RPCs.

No automatic hardening applied in this review.

---

## 9. Closure codes

RPC_IDENTIFIED: **YES**  
SECURITY_DEFINER_REVIEW: **PASS** (pinned search_path; secret-first; no dynSQL — design risk of public EXECUTE noted under grants)  
SEARCH_PATH_REVIEW: **PASS**  
GRANTS_REVIEW: **FAIL** (anon/authenticated EXECUTE on DEFINER RPCs; residual TRUNCATE)  
RLS_REVIEW: **PASS** (RLS on; 0 policies intentional; DML select/insert blocked for anon)  
SECRET_EXPOSURE: **FOUND** (process/history risk; **none** in tracked FE/repo)  
UNAUTHORIZED_WRITE_PATH: **NONE_FOUND** (without secret)  
APPEND_ONLY_PROTECTED: **PARTIAL** (RPC cannot update/delete; TRUNCATE priv exists but not via Data API)  
CURRENT_RPC_SECURITY: **NEEDS_HARDENING**  
RECOMMENDED_LONG_TERM_ACCESS: **STANDARD_SERVER_CREDENTIAL**  
BLOCKS_B3: **NO**
