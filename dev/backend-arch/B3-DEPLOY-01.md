# B3-DEPLOY-01 — Railway Backend Deploy + Real Shadow Prep

**Date:** 2026-09-23  
**Status:** **COMPLETE** (Railway operable; productive shadow **not** enabled)  
**Workspace Railway:** ngervitz's Projects (`101d507d-e775-4116-a51f-b2051c506093`)

---

## Railway

| Field | Value |
|-------|-------|
| Project name | `CZMiplan` |
| Project ID | `39066e90-075c-4263-9922-dace0a74dc64` |
| Service name | `backend` |
| Service ID | `67ef05f5-f4ff-43ef-a623-765f028ad01d` |
| Environment | `production` (`ae8aa159-d3db-43d5-a3ec-11b27f8875fa`) |
| Source repo | `Ngervitz/CZMiplan` |
| Source branch | `main` |
| Deployed commit | `680e22dd257c3b72d97ac4581927bdb4acbdbe53` |
| Ancestor of B3 push | `5740f8de6b93d6768e8dd338edea3f19d4e973f5` (still on `origin/main`) |
| Build / start | Railpack → `npm run server` (`node server/index.js`) |
| Node | `22` (`engines.node >=22`; `NIXPACKS_NODE_VERSION` / `NODE_VERSION`) |
| Public URL | `https://backend-production-17f9.up.railway.app` |
| Healthcheck | `/health` |

**Not created / not touched:** Railway Postgres, Redis, divine-warmth, skillful-reflection, bountiful-energy, janus-paraguay, mie-backend.

---

## ENV (names only — no values)

| Name | Notes |
|------|-------|
| `NODE_ENV` | `production` |
| `PORT` | Railway-injected |
| `CORS_ALLOWED_ORIGINS` | CSV; production Vercel + localhost dev |
| `SUPABASE_URL` | CZMiplan `https://hvrrywlddxpywuvqclyq.supabase.co` |
| `SUPABASE_ANON_KEY` | server-only |
| `MIPLAN_BACKEND_SECRET` | B2 temporary RPC gate |
| `DEFAULT_TENANT_ID` | `miplan-default` |
| `NIXPACKS_NODE_VERSION` | `22` |
| `NODE_VERSION` | `22` |

Plus Railway-injected `RAILWAY_*` metadata vars.

Persistence remains temporary **RPC HTTPS + `MIPLAN_BACKEND_SECRET`** (B2-SECURITY-REVIEW-01: `CURRENT_RPC_SECURITY = NEEDS_HARDENING`; not resolved here).

---

## CORS

| Item | Result |
|------|--------|
| Productive FE | `https://cz-miplan2.vercel.app` (confirmed HTTP 200; `docs/STATE.md`) |
| Preflight `Origin: https://cz-miplan2.vercel.app` | **204**, `Access-Control-Allow-Origin` echoes that origin |
| Unrelated origin | **403** (no `*`) |
| Localhost | retained for existing local/dev tooling |

---

## Remote verification

| Check | Result |
|-------|--------|
| Deploy | **SUCCESS** (`99d796bd-3af6-402d-a4c3-c58e0b0f5a58`) |
| Runtime | `server_listen`; no crash loop after Node 22 fix |
| `GET /health` | **200** `{"status":"ok","app":"miplan-backend","version":"b2","env":"production"}` |
| `POST /v1/diagnoses` | **200** with `diagnosis_id`, `engine_version`, `result` |
| Smoke diagnosis_id | `858f600b-3df5-48f9-bbb0-a8b290aa1527` |
| Smoke anonymous_id | `8c7ca67b-df9d-4b56-9067-20bd04c25f57` |
| Engine version | `miplan-engine-v1-extract-01` |
| Supabase project | CZMiplan / `hvrrywlddxpywuvqclyq` |
| Row persisted | yes — `now_ms`, `completeness`, `input_snapshot`, `engine_result` present (append-only; not deleted) |

Flow confirmed: Internet → Railway → Express → `runEngine()` → temporary RPC → Supabase CZMiplan.

---

## Runtime fix applied during deploy

First deploys of `5740f8d` crashed: Node 18 + `@supabase/supabase-js` required native WebSocket / Node 22+.

Minimal fix on `main` (`680e22d`):

- `engines.node` → `>=22`
- dependency `ws` + `realtime.transport` in `server/modules/persistence/supabaseClient.js`
- Railway `NIXPACKS_NODE_VERSION` / `NODE_VERSION` = `22`

---

## Security checklist

| Item | Status |
|------|--------|
| Secrets in Railway logs | **NONE_FOUND** (listen + npm warn only on success deploy) |
| Secrets in frontend | **NONE_FOUND** |
| Secrets in repo | **NONE_FOUND** (`.env` gitignored; `.env.example` empty placeholders) |
| Railway vars server-only | yes |
| Correct Supabase | `hvrrywlddxpywuvqclyq` only |
| Link to JANUS/MIE | none |
| RPC exposure | still via backend-only secret path (debt unchanged) |

---

## Explicitly NOT done

- Productive shadow / `CZ_BACKEND_API_URL` on Vercel
- B4 / frontend motor cutover
- Auth / Plus / ASSISTANT / Claude / Handy / Equifax-BCU
- Migrating RPC → `service_role`
- Railway databases

---

## Pendientes

1. Separate task: enable real FE shadow pointing at Railway URL (opt-in / non-authority).
2. B2 hardening: `STANDARD_SERVER_CREDENTIAL` / revoke anon EXECUTE on persist RPCs.
3. B4 when shadow soak is acceptable.

---

## Closure

```
B3_DEPLOY_STATUS: COMPLETE
DEPLOYED_COMMIT: 680e22dd257c3b72d97ac4581927bdb4acbdbe53
RAILWAY_PROJECT_CREATED: YES
RAILWAY_PROJECT_NAME: CZMiplan
RAILWAY_PROJECT_ID: 39066e90-075c-4263-9922-dace0a74dc64
RAILWAY_SERVICE_CREATED: YES
RAILWAY_SERVICE_NAME: backend
RAILWAY_SERVICE_ID: 67ef05f5-f4ff-43ef-a623-765f028ad01d
SOURCE_REPO: Ngervitz/CZMiplan
SOURCE_BRANCH: main
DEPLOY_STATUS: SUCCESS
PUBLIC_BACKEND_URL: https://backend-production-17f9.up.railway.app
HEALTH_REMOTE: PASS
DIAGNOSIS_REMOTE: PASS
SUPABASE_PERSISTENCE_REMOTE: PASS
SUPABASE_PROJECT_REF: hvrrywlddxpywuvqclyq
CORS_PRODUCTION: PASS
SECRET_EXPOSURE: NONE_FOUND
PRODUCTION_SHADOW_ENABLED: NO
PRODUCTION_CUTOVER: NO
READY_TO_ENABLE_REAL_SHADOW: YES
```
