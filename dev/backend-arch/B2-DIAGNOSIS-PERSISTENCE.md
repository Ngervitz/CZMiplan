# B2 — Diagnosis Persistence (Supabase)

**Date:** 2026-09-23  
**Depends on:** B1 COMPLETE, BACKEND-ARCH-01, ENGINE-EXTRACTION-01  
**Scope:** Append-only diagnosis persistence on Supabase CZMiplan; no Auth; no FE cutover

---

## 1. Supabase project verified

| Field | Value |
|-------|-------|
| Name | CZMiplan |
| Project ref | `hvrrywlddxpywuvqclyq` |
| API URL | `https://hvrrywlddxpywuvqclyq.supabase.co` |
| Status | ACTIVE_HEALTHY |
| Verified via | Supabase MCP `get_project` / `get_project_url` / `list_tables` / `list_migrations` |

**Only this project was modified.** Not touched: `mie-backend`, `janus-paraguay`.

Pre-migration inspection: `public` tables empty, migrations empty (new project).

---

## 2. Schema created

### `public.identities_anonymous`

| Column | Type | Notes |
|--------|------|-------|
| anonymous_id | text PK | client device id |
| tenant_id | text | reserved; default `miplan-default` |
| created_at | timestamptz | |
| last_seen_at | timestamptz | updated on each diagnosis |
| linked_user_id | uuid NULL | reserved for future Auth link |

RLS: **enabled**, no policies (Data API denied for anon/authenticated).

### `public.diagnoses` (APPEND-ONLY)

| Column | Type | Notes |
|--------|------|-------|
| diagnosis_id | uuid PK | server-generated |
| anonymous_id | text FK | → identities_anonymous |
| tenant_id | text | reserved constant V1 |
| created_at | timestamptz | |
| now_ms | bigint | server clock (D5) |
| engine_version | text | from `runEngine` |
| input_snapshot | jsonb | reproducible input |
| engine_result | jsonb | full ENGINE RESULT |
| completeness | jsonb | server recomputed |

No `status` column (not required by ARCH for V1).  
No UPDATE path in application code for diagnosis rows.

### `miplan_private.backend_secrets`

Holds the persist gate secret (name `b2_persist`). RLS enabled; schema not for public Data API use.

### RPCs

| Function | Role |
|----------|------|
| `public.miplan_persist_diagnosis(...)` | SECURITY DEFINER insert + anon upsert |
| `public.miplan_get_diagnosis(...)` | SECURITY DEFINER read (tests/internal; **no public GET route**) |

Both require `p_secret` matching `MIPLAN_BACKEND_SECRET`. Wrong secret → persist failure (no false success).

**Why RPC + anon key (not service_role inserts):** from this environment, direct Postgres host DNS (`db.*.supabase.co`) was unreachable (`ENOTFOUND`). HTTPS API works. MCP does not expose `service_role`. Gate = long backend secret in ENV (never FE). Prefer `SUPABASE_SERVICE_ROLE_KEY` + direct table access on Railway when available (future hardening).

An unused DB role `miplan_app` created during the failed direct-DB attempt was disabled (`NOLOGIN`, `NOBYPASSRLS`); not used by the app.

Advisor notes (INFO/WARN, intentional for B2):

- RLS enabled / no policies on `diagnoses`, `identities_anonymous`, `backend_secrets` — backend-only; no anon policies by design.
- SECURITY DEFINER executable by `anon` — mitigated by secret check; revoke/`service_role`-only is the follow-up when service role is configured.

---

## 3. Migrations applied (MCP)

| Version | Name |
|---------|------|
| 20260923190151 | `b2_diagnosis_persistence` |
| 20260923190539 | `b2_diagnosis_persist_rpc` |
| 20260923190818 | `b2_enable_rls_backend_secrets` |

Local mirrors: `server/migrations/*.sql` (no secret values).

---

## 4. Endpoint flow (`POST /v1/diagnoses`)

```
request
  → resolve/validate anonymous_id (header X-MiPlan-Anonymous-Id or body.anonymous_id)
  → extract EngineInput (strip client diagnosis_id/result/now_ms/completeness)
  → now_ms = Date.now() (server)
  → runEngine(input, { now_ms })  // completeness inside engine_result
  → repository.insertDiagnosis (RPC)
  → 200 { diagnosis_id, engine_version, result }
```

Responds **only** after successful persist. DB failure → 500, no `diagnosis_id`.

No public `GET /v1/diagnoses/:id` in B2 (authz not ready).

---

## 5. Identity / tenant

| Topic | Behavior |
|-------|----------|
| anonymous_id | UUID format, length 36–64; required |
| Auth / magic link | not implemented |
| Account linking | not implemented |
| tenant_id | `DEFAULT_TENANT_ID` env (default `miplan-default`); no multi-tenant logic |

---

## 6. ENV (server only)

| Variable | Required | Notes |
|----------|----------|-------|
| `SUPABASE_URL` | yes | `https://hvrrywlddxpywuvqclyq.supabase.co` |
| `SUPABASE_ANON_KEY` | yes | server use for RPC; not a substitute for Auth |
| `MIPLAN_BACKEND_SECRET` | yes | must match DB `miplan_private.backend_secrets` |
| `DEFAULT_TENANT_ID` | no | default `miplan-default` |
| `PORT` / `NODE_ENV` / `CORS_ALLOWED_ORIGINS` | as B1 | |

Template: `server/.env.example`  
Secrets live in gitignored `server/.env` — **never commit**.

Reserved later: `SUPABASE_SERVICE_ROLE_KEY`.

---

## 7. Code layout

```
server/
  config.js
  app.js
  index.js
  modules/
    identity/anonymousId.js
    persistence/supabaseClient.js
    diagnosis/service.js
    diagnosis/repository.js
  http/routes/diagnoses.js
  migrations/
  bin/smoke.js
  bin/b2-persist-test.js
```

Boundary: routes → service → engine + repository → Supabase. No SQL in routes.

---

## 8. Errors

| Case | Status | Code |
|------|--------|------|
| Invalid / missing payload | 400 | `ENGINE_INPUT_REQUIRED` |
| Invalid / missing anonymous_id | 400 | `ANONYMOUS_ID_*` |
| Missing Supabase ENV | 503 | `SUPABASE_CONFIG_MISSING` |
| Engine throw | 500 | `ENGINE_FAILURE` |
| DB / RPC fail | 500 | `DB_PERSIST_FAILED` |

No stack traces, SQL, or secrets in responses.

---

## 9. Tests

```bash
npm run server:smoke
npm run server:b2-test
npm run engine:parity
# or
npm run b2:validate
```

B2 persist checks: insert, diagnosis_id, append-only two rows, first intact, engine_version/now_ms/snapshots/completeness, invalid payload/anon, DB failure no false success.

---

## 10. Files touched (B2)

| Path | Action |
|------|--------|
| `server/modules/**` | created |
| `server/http/routes/diagnoses.js` | persist path |
| `server/app.js`, `config.js`, `index.js`, errorHandler | B2 wiring |
| `server/bin/b2-persist-test.js`, `smoke.js` | tests |
| `server/migrations/*` | SQL mirrors |
| `server/.env.example` | ENV template |
| `package.json` | scripts + `@supabase/supabase-js`, `dotenv` |
| `dev/backend-arch/B2-DIAGNOSIS-PERSISTENCE.md` | this doc |

**Unchanged:** `js/*`, `index.html`, `api/*`, engine rules, oracle, `dev/narrative-05-qa.js`.

---

B2_STATUS: COMPLETE  
SUPABASE_PROJECT_VERIFIED: YES  
SUPABASE_PROJECT_REF: hvrrywlddxpywuvqclyq  
MIGRATION_CREATED: YES  
MIGRATION_APPLIED: YES  
ANONYMOUS_ID_MODEL: PASS  
DIAGNOSIS_APPEND_ONLY: PASS  
INPUT_SNAPSHOT_PERSISTED: PASS  
ENGINE_RESULT_PERSISTED: PASS  
ENGINE_VERSION_PERSISTED: PASS  
NOW_MS_SERVER_AUTHORITY: PASS  
COMPLETENESS_SERVER_AUTHORITY: PASS  
DB_FAILURE_HANDLING: PASS  
PARITY_CORPUS: 18/18 PASS  
FRONTEND_REGRESSION: PASS  
PRODUCTION_FRONTEND_CHANGED: NO  
ORACLE_MODIFIED: NO  
READY_FOR_B3: YES
