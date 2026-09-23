# B1 — Backend Infrastructure Minimum

**Date:** 2026-09-23  
**Depends on:** BACKEND-ARCH-01 (READY), ENGINE-EXTRACTION-01  
**Scope:** Express skeleton + health + engine runtime smoke + compute-only diagnoses (no DB)

---

## 1. Estructura creada

```
server/
  index.js                 # entrypoint (listen 0.0.0.0 / PORT)
  app.js                   # Express factory
  config.js                # PORT, NODE_ENV, CORS_ALLOWED_ORIGINS
  .env.example             # plantilla ENV (sin secretos)
  http/
    routes/health.js
    routes/diagnoses.js    # B1 compute-only (no persist)
    middleware/notFound.js
    middleware/errorHandler.js
  bin/smoke.js             # validación B1
```

Sin módulos vacíos (assistant/payments/…).  
`engine/` permanece en raíz; el server lo importa con `require("../engine")`.

---

## 2. Entrypoint y scripts

| Comando | Acción |
|---------|--------|
| `npm run server` | `node server/index.js` |
| `npm run server:dev` | igual (local) |
| `npm run server:smoke` | smoke Express + engine |
| `npm run engine:smoke` | smoke engine solo |
| `npm run engine:parity` | corpus 18/18 |
| `npm run b1:validate` | smoke server + parity |

**Railway start (PROPOSED):** `npm run server` o `node server/index.js`.

---

## 3. Variables ENV

| Variable | Required | Default | Notas |
|----------|----------|---------|-------|
| `PORT` | Railway sí | `3000` | listen port |
| `NODE_ENV` | no | `development` | `production` desactiva origins localhost por defecto |
| `CORS_ALLOWED_ORIGINS` | prod sí | (dev: localhost list) | CSV de origins; **nunca `*`** |

Reservadas (no usadas en B1): Supabase, Claude, Handy, Equifax.

Plantilla: `server/.env.example`.  
`server/.env` está en `.gitignore`.

### CORS

- Lista explícita vía `CORS_ALLOWED_ORIGINS`.
- Requests sin header `Origin` (curl/health checks) permitidos.
- Origin no listado → 403 `CORS_NOT_ALLOWED`.
- Ejemplo prod: `CORS_ALLOWED_ORIGINS=https://tu-dominio.vercel.app`.

---

## 4. Health check

`GET /health` → `200`

```json
{
  "status": "ok",
  "app": "miplan-backend",
  "version": "b1",
  "env": "development"
}
```

Sin secretos.

---

## 5. Diagnoses compute-only (B1)

`POST /v1/diagnoses` — alineado a BACKEND-ARCH-01 B1 (“runEngine vía HTTP”), **sin** persistencia:

- Body = EngineInput JSON.
- Server fija `now_ms` (D5); no confía clock client.
- Respuesta: `{ persisted: false, diagnosis_id: null, engine_version, now_ms, engine_result }`.
- Persistencia / `diagnosis_id` real → **B2**.

No es el API durable de producto; sirve para montaje Railway + smoke HTTP.

---

## 6. Smoke tests

`node server/bin/smoke.js` verifica:

- Express listen
- `/health` 200
- 404 consistente
- error handler (body inválido → 400)
- `runEngine` en el mismo runtime
- `POST /v1/diagnoses` compute-only

---

## 7. Railway readiness

| Requisito | Estado |
|-----------|--------|
| `0.0.0.0` | YES (`config.host`) |
| `process.env.PORT` | YES |
| Startup command claro | `npm run server` |
| Sin filesystem persistente | YES |
| Sin dominio/puerto hardcodeados | YES |
| `/health` | YES |
| Proyecto Railway creado | NO (fuera de B1) |
| Deploy | NO (fuera de B1) |

---

## 8. Dependencias añadidas

- `express` ^4.21.2  
- `cors` ^2.8.5  

`playwright` sigue como `devDependency` (frontend QA). Sin otros frameworks.

---

## 9. Archivos modificados / creados

| Path | Acción |
|------|--------|
| `server/**` | creado |
| `package.json` | scripts + dependencies |
| `package-lock.json` | npm install |
| `.gitignore` | `server/.env` |
| `dev/backend-arch/B1-BACKEND-INFRASTRUCTURE.md` | este doc |

**No modificados:** `js/*`, `index.html`, `api/*`, `engine/` rules, oracle, `dev/narrative-05-qa.js`.

---

## 10. Validación ejecutada

```
npm run server:smoke  → all PASS
npm run engine:parity → 18/18 PASS
npm run engine:smoke  → PASS
```

FRONTEND_REGRESSION: no se tocaron archivos del frontend productivo → PASS (por ausencia de cambio).

---

B1_STATUS: COMPLETE  
EXPRESS_SERVER: PASS  
HEALTH_ENDPOINT: PASS  
ERROR_HANDLING: PASS  
CORS_CONFIG: PASS  
ENGINE_RUNTIME_SMOKE: PASS  
PARITY_CORPUS: 18/18 PASS  
FRONTEND_REGRESSION: PASS  
RAILWAY_READY: YES  
SUPABASE_INTEGRATED: NO  
PRODUCTION_FRONTEND_CHANGED: NO  
ORACLE_MODIFIED: NO
