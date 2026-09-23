# B3-DEPLOY-01 — Railway Backend Deploy + Real Shadow Prep

**Date:** 2026-09-23  
**Status:** **BLOCKED** (pre-deploy gate)  
**Workspace Railway:** ngervitz's Projects (`101d507d-e775-4116-a51f-b2051c506093`)

---

## STOP — no Railway project created

Fase 1 encontró un bloqueo inequívoco **antes** de crear infraestructura:

### Blocker: backend no está en `origin/main`

| Check | Result |
|-------|--------|
| Remote | `https://github.com/Ngervitz/CZMiplan.git` |
| Branch requested | `main` |
| `origin/main` HEAD | `b6da44b` (Add Mi Plan assistant terms v1) |
| `server/` on GitHub | **ABSENT** |
| `engine/` on GitHub | **ABSENT** |
| Remote `package.json` | only Playwright `devDependency` — **no** `express`, **no** `npm run server` |
| Local working tree | `server/`, `engine/` untracked; `package.json` modified locally |

Deploying Railway → `Ngervitz/CZMiplan@main` **today** would build a repo **without** Express backend.

Per stop condition: *“el repo/branch no coincide”* / cannot invent an architecture workaround → **DETENERSE**.

**Existing Railway projects were not touched:**
- divine-warmth / janus-paraguay
- skillful-reflection / web
- bountiful-energy / mie-backend

---

## Fase 1 — Pre-deploy audit (local) — PASS

### Start / PORT / host

| Item | Evidence |
|------|----------|
| Start command | `npm run server` → `node server/index.js` |
| PORT | `process.env.PORT` via `loadConfig` (Railway injects) |
| Bind | `0.0.0.0` (`server/config.js` `host`) |
| Health | `GET /health` |
| Diagnosis | `POST /v1/diagnoses` |

### ENV required for production (names only)

| Name | Required | Notes |
|------|----------|-------|
| `NODE_ENV` | yes | `production` |
| `PORT` | Railway | injected |
| `CORS_ALLOWED_ORIGINS` | yes | CSV; never `*` |
| `SUPABASE_URL` | yes | must be `https://hvrrywlddxpywuvqclyq.supabase.co` |
| `SUPABASE_ANON_KEY` | yes | server-only |
| `MIPLAN_BACKEND_SECRET` | yes | B2 temporary RPC gate |
| `DEFAULT_TENANT_ID` | optional | default `miplan-default` |

Local `server/.env`: secrets **present** (values not logged).  
`SUPABASE_URL` verified = CZMiplan ref `hvrrywlddxpywuvqclyq`.

### CORS (planned, not applied)

Productive FE from docs: `cz-miplan2.vercel.app` (`docs/STATE.md`).

Suggested production value (when deploy proceeds):

```
CORS_ALLOWED_ORIGINS=https://cz-miplan2.vercel.app,http://localhost:5500,http://127.0.0.1:5500
```

Confirm live Vercel domain at deploy time (PENDING until then).

### Local tests run

| Suite | Result |
|-------|--------|
| `npm run engine:smoke` | PASS |
| `npm run engine:parity` | **18/18 PASS** |
| `npm run server:b2-test` | PASS |
| `npm run server:smoke` | PASS |
| Frontend regression | PASS (no FE cutover; client still UX authority) |

### Supabase

| Field | Value |
|-------|-------|
| Project | CZMiplan |
| Ref | `hvrrywlddxpywuvqclyq` |
| Status | ACTIVE_HEALTHY |
| Persistence path | temporary RPC + `MIPLAN_BACKEND_SECRET` (B2-SECURITY-REVIEW-01 debt remains) |

---

## What was NOT done (by design)

| Step | Status |
|------|--------|
| Create Railway project CZMiplan | **NO** |
| Create service `backend` | **NO** |
| Connect GitHub | **NO** |
| Set Railway variables | **NO** |
| Deploy | **NO** |
| Public domain | **NONE** |
| Remote `/health` | **NOT_RUN** |
| Remote `POST /v1/diagnoses` | **NOT_RUN** |
| Enable productive shadow on Vercel | **NO** |
| B4 / cutover | **NO** |

---

## Unblock checklist (human decision)

1. **Commit + push** to `main` the B1–B3 backend surface (at minimum):
   - `server/`
   - `engine/`
   - `package.json` / `package-lock.json`
   - related `dev/backend-arch/*` docs as desired
   - **exclude** `server/.env` secrets
2. Confirm `origin/main` contains `npm run server` and `server/index.js`.
3. Re-run **B3-DEPLOY-01** from Fase 2:
   - create project `CZMiplan` in workspace `ngervitz's Projects`
   - service `backend`
   - source `Ngervitz/CZMiplan` @ `main`
   - set ENV (names above)
   - deploy + domain + remote health + remote diagnosis + Supabase verify
4. Only after that: separate task to enable real shadow (`CZ_BACKEND_API_URL`).

No commit/push was performed in this task (requires explicit ask).

---

## Planned Railway shape (for next run)

| Field | Planned |
|-------|---------|
| Workspace | ngervitz's Projects |
| Project name | `CZMiplan` (or `czmiplan`) |
| Service | `backend` |
| Repo | `Ngervitz/CZMiplan` |
| Branch | `main` |
| Start | `npm run server` |
| DB | Supabase only (no Railway Postgres) |

---

## Closure

B3_DEPLOY_STATUS: **BLOCKED**  
RAILWAY_PROJECT_CREATED: **NO**  
RAILWAY_PROJECT_NAME: NONE  
RAILWAY_PROJECT_ID: NONE  
RAILWAY_SERVICE_CREATED: **NO**  
RAILWAY_SERVICE_NAME: NONE  
RAILWAY_SERVICE_ID: NONE  
SOURCE_REPO: Ngervitz/CZMiplan (intended)  
SOURCE_BRANCH: main (intended; **backend absent on remote**)  
DEPLOY_STATUS: **NOT_RUN**  
PUBLIC_BACKEND_URL: **NONE**  
HEALTH_REMOTE: **NOT_RUN**  
DIAGNOSIS_REMOTE: **NOT_RUN**  
SUPABASE_PERSISTENCE_REMOTE: **NOT_RUN**  
SUPABASE_PROJECT_REF: **hvrrywlddxpywuvqclyq**  
CORS_PRODUCTION: **PENDING** (target candidate `https://cz-miplan2.vercel.app`)  
SECRET_EXPOSURE: **NONE_FOUND**  
PARITY_CORPUS: **18/18 PASS**  
FRONTEND_REGRESSION: **PASS**  
PRODUCTION_SHADOW_ENABLED: **NO**  
PRODUCTION_CUTOVER: **NO**  
READY_TO_ENABLE_REAL_SHADOW: **NO**

**Blocker one-liner:** push B1–B3 `server/` + `engine/` to `main`, then resume deploy.
