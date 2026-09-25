# A3-HANDOFF-IMPLEMENTATION-01 — Credizona rechazado → JANUS → Mi Plan

**Tipo:** IMPLEMENTATION (parcial) + CPANEL PLAN  
**Fecha:** 2026-09-25  
**Depende de:** `HANDOFF-SECURITY-01.md`, `HANDOFF-CODE-ARCH-01.md`, `JANUS-MIPLAN-CONTRACT-01.md`

```text
PRODUCTION_DEPLOYED: NO
MIGRATIONS_APPLIED_PROD: NO
CPANEL_TOUCHED: NO
RAILWAY_TOUCHED: NO
VERCEL_PROD_DEPLOYED: NO
CZ_PRODUCTION_CHANGE_PENDING: YES
```

---

## 1. Arquitectura implementada (A3)

```text
Credizona doEncuestaSinOferta
  1) persiste P1–P10 (siempre)
  2) S2S HMAC dedicado → JANUS POST /internal/miplan/v1/handoff/emit { purpose, lrw }
  3) response JSON (+ miplan_handoff opcional)
Frontend Credizona
  → CTA solo si miplan_handoff.code
  → https://cz-miplan2.vercel.app/e/{handoff_code}   (solo code)
Mi Plan FE
  → POST /v1/handoff/redeem { handoff_code } + anonymous_id
Mi Plan BE
  → Bearer → JANUS POST /internal/miplan/v1/handoff/redeem
JANUS
  → atomic redeem → allowlisted context (CONTRACT-01)
```

**LRW nunca es authorization.** Emit exige HMAC CZ dedicado + episodio rechazado resoluble en JANUS.

**Sync lag encuesta:** emit no exige fila `cz_funnel_encuestas` (aún puede no estar sincronizada). Redeem adjunta survey lifetime por CI si ya está en JANUS; si no, omite bloque `survey` (OMIT_IF_NULL). Documentado conscientemente.

---

## 2. Archivos por repo

### JANUS (`mie-backend`)

| Archivo | Rol |
|---------|-----|
| `migrations/20260925_miplan_handoff_tokens.sql` | Tabla + `redeem_miplan_handoff_token()` atómico |
| `src/lib/czMiplanHandoffHmac.js` | HMAC dedicado (secret ≠ tracking) |
| `src/lib/miplanHandoffTokens.js` | emit / redeem / context builder |
| `src/routes/miplan-handoff.js` | Rutas emit + redeem |
| `src/app.js` | Mount `/internal/miplan` antes de `requireAuth` |
| `src/config/env.js` | `CZ_MIPLAN_HANDOFF_HMAC_SECRET`, `MIPLAN_HANDOFF_REDEEM_SECRET` |
| `.env.example` | Documentación ENV |
| `scripts/unit-miplan-handoff.js` | Tests unitarios |

### Mi Plan (`CZMiplan`)

| Archivo | Rol |
|---------|-----|
| `server/config.js` | `JANUS_HANDOFF_BASE_URL`, `MIPLAN_HANDOFF_REDEEM_SECRET` |
| `server/modules/handoff/janusClient.js` | Cliente redeem S2S |
| `server/http/routes/handoff.js` | `POST /v1/handoff/redeem` + cache anti doble-click FE |
| `server/app.js` | Router handoff |
| `server/.env.example` | ENV |
| `server/bin/handoff-redeem-test.js` | Test local |
| `js/handoffEntry.js` | Lee `/e/{code}` o `?e=`, redeem, prefill PRE |
| `js/app.js` | Llama redeem al inicio de `init()` |
| `index.html` | Script tag |
| `vercel.json` | Rewrite `/e/:code` → `index.html` |

### Credizona CLON (preparación; **no prod**)

| Archivo | Rol |
|---------|-----|
| `Janus/JanusComm.php` | `postjsonWithSecret` / secret override |
| `Janus/JanusConstantes.php` | endpoint handoff, entry base, `getMiplanHandoffHmacSecret()` |
| `Janus/Janus.php` | `emitMiplanHandoff()` |
| `Janus/miplan_handoff.secret.example.php` | Plantilla secret local |
| `solicitudesController.php` | emit post-persist en `doEncuestaSinOferta` |
| `solicitudes.js` | CTA post-AJAX |
| `solicitudes.sinoferta.html` | callback `EncuestaSinOfertaSend` |

---

## 3. Endpoints

### Emit (Credizona → JANUS)

`POST {JANUS}/internal/miplan/v1/handoff/emit`

Headers:
- `Content-Type: application/json`
- `X-Janus-Timestamp: <unix>`
- `X-Janus-Signature: hex(HMAC-SHA256(CZ_MIPLAN_HANDOFF_HMAC_SECRET, timestamp + '.' + rawBody))`

Body mínimo:
```json
{ "purpose": "miplan_handoff", "lrw": "LRW-…" }
```

Ignora flags `completed` / `rejected` / CI / financieros del body.

Success `200`:
```json
{
  "ok": true,
  "purpose": "miplan_handoff",
  "handoff_code": "<opaque>",
  "expires_in": 900,
  "expires_at": "…"
}
```

Errores: `401` HMAC, `404` lrw/not rejected, `429` rate, `503` unavailable.

### Redeem (Mi Plan BE → JANUS)

`POST {JANUS}/internal/miplan/v1/handoff/redeem`

Headers:
- `Authorization: Bearer {MIPLAN_HANDOFF_REDEEM_SECRET}`

Body:
```json
{ "handoff_code": "<opaque>" }
```

Success `200`: `{ ok: true, context: { …allowlist… } }`  
Segundo uso: `409 already_redeemed` **sin** `context` / PII.

### Mi Plan público

`POST {MIPLAN_BE}/v1/handoff/redeem`  
Header `X-MiPlan-Anonymous-Id`  
Body solo `handoff_code` (rechaza `lrw`/`ci`).

---

## 4. Autenticación

| Canal | Secret ENV | Notas |
|-------|------------|-------|
| CZ → JANUS emit | `CZ_MIPLAN_HANDOFF_HMAC_SECRET` | **≠** `CZ_TRACKING_HMAC_SECRET` |
| Mi Plan → JANUS redeem | `MIPLAN_HANDOFF_REDEEM_SECRET` | Bearer dedicado |
| Credizona local secret file | `Janus/miplan_handoff.secret.php` | return string; example only in repo |

---

## 5. Emisión / idempotencia

1. Resolver episodio por `lrw_id` en `cz_funnel_solicitudes` con estado ∈ {2,3}.  
2. Revocar tokens `issued` previos mismo `(purpose, lrw)`.  
3. Insertar nuevo token (hash SHA-256, TTL 15 min).  
4. Devolver raw code una sola vez.

Retry CZ tras timeout → nuevo code; anterior revoked. Evita múltiples capabilities activas.

---

## 6. Storage

Tabla `miplan_handoff_tokens`: id, token_hash, purpose, external_ref(lrw), cz_solicitud_id, ci, status, issued_at, expires_at, redeemed_at, revoked_at.

Función SQL `redeem_miplan_handoff_token(p_token_hash)` — UPDATE atómico `WHERE status=issued AND redeemed_at IS NULL AND expires_at > now()`.

---

## 7. TTL / one-time / atomicidad / doble click

| Regla | Valor |
|-------|-------|
| TTL | **900s** fijo |
| One-time | Sí — primer redeem consume |
| Atomicidad | SQL function / single UPDATE |
| Doble click FE | Cache corto en Mi Plan BE (2 min) por hash del code tras primer éxito; **no** hace reusable el token JANUS |
| journey_id | **IMPLEMENTED** — ver `MIPLAN-JOURNEY-01.md` |

---

## 8. Fallo JANUS en Credizona

Tras `crear` encuesta:
- try emit;
- si falla → JSON éxito sin `miplan_handoff`;
- encuesta **no** se revierte;
- FE no muestra CTA.

---

## 9. Contexto allowlisted

Incluye (si existen): funnel, external_ref LRW, person (sin CI al FE), financial_prefill (ingreso/laboral), survey P1–P10 lifetime, provenance.

**No:** monto_solicitado, motivo_rechazo, BCU full dump (BCU opcional no cableado en V1 de este handoff — puede ampliarse).

---

## 10. Journey

```text
IMPLEMENTED: MIPLAN-JOURNEY-01 (2026-09-25)
```

`POST /v1/handoff/redeem` crea/resuelve `journey_id` durable (tabla `journeys`, bootstrap_key = hash del code).  
Refresh no requiere re-redeem; diagnosis puede asociar `journey_id` opcional con ownership check.  
Ver `MIPLAN-JOURNEY-01.md`.

---

## 11. Tests ejecutados localmente

| Test | Resultado |
|------|-----------|
| `mie-backend/scripts/unit-miplan-handoff.js` | PASS |
| `mie-backend/scripts/unit-cz-tracking-events.js` | PASS (regresión tracking) |
| `CZMiplan/server/bin/handoff-redeem-test.js` | PASS |
| `CZMiplan/server/bin/smoke.js` | PASS |

**No validados en prod / cPanel:** CTA real, emit real, encuesta prod.

---

## 12. ENV requeridas (posterior)

### JANUS Railway
- `CZ_MIPLAN_HANDOFF_HMAC_SECRET` (nuevo, fuerte, ≠ tracking)
- `MIPLAN_HANDOFF_REDEEM_SECRET` (nuevo, fuerte)

### Mi Plan Railway
- `JANUS_HANDOFF_BASE_URL=https://mie-backend-production.up.railway.app`
- `MIPLAN_HANDOFF_REDEEM_SECRET` (mismo valor que JANUS)

### Credizona cPanel
- `CZ_MIPLAN_HANDOFF_HMAC_SECRET` env **o** archivo `Janus/miplan_handoff.secret.php`
- Confirmar `JanusConstantes::PROD_URL` apunta a JANUS
- Confirmar `MIPLAN_HANDOFF_ENTRY_BASE` / JS `getMiplanHandoffEntryBase()`

### Migración
- Aplicar `migrations/20260925_miplan_handoff_tokens.sql` en Supabase JANUS (manual)

---

## 13. Limitaciones del clon Credizona

- El clon **no** es producción.
- Sin secret configurado, emit retorna `hmac_secret_not_configured` → encuesta OK, sin CTA.
- No se ejecutó PHP runtime del clon contra JANUS real en esta fase.
- `CZ_PRODUCTION_CHANGE_PENDING: YES`

---

## 14. CZ CPANEL DEPLOY PLAN

**NO ejecutar aún.** Checklist para cuando entremos a cPanel.

### 14.1 Archivos a modificar en prod (mismas rutas bajo `public_html/`)

1. `Janus/JanusComm.php`  
2. `Janus/JanusConstantes.php`  
3. `Janus/Janus.php`  
4. `Janus/miplan_handoff.secret.php` (**crear**, no commitear)  
5. `solicitudesController.php` — método `doEncuestaSinOferta`  
6. `solicitudes.js`  
7. `solicitudes.sinoferta.html` — `data-callback`

### 14.2 Orden exacto

1. Backup de cada archivo (download / copy `*.bak-YYYYMMDD`).  
2. Confirmar en JANUS: migración aplicada + ENV handoff + emit smoke con HMAC de prueba (Postman desde IP confiable).  
3. Crear `miplan_handoff.secret.php` con `<?php return '<secret>';` (mismo valor que `CZ_MIPLAN_HANDOFF_HMAC_SECRET` en Railway).  
4. Subir `JanusComm.php`, `JanusConstantes.php`, `Janus.php`.  
5. `php -l` en cada PHP modificado (CLI cPanel o local antes de subir).  
6. Subir `solicitudesController.php`.  
7. Subir `solicitudes.js` + `solicitudes.sinoferta.html`.  
8. Smoke prod (abajo).  
9. Si falla: restaurar `.bak` en orden inverso (FE → controller → Janus).

### 14.3 Diff lógico backend (`doEncuestaSinOferta`)

Después de `markAsConEncuestaCompletada`:
1. `new Janus($db)->emitMiplanHandoff($lrw)`  
2. Si ok → agregar `miplan_handoff: { code, expires_in }` al JSON  
3. Siempre `ok:true` si encuesta persistió  
4. Nunca devolver secretos / CI / LRW en el handoff object (solo code)

### 14.4 Diff lógico frontend

- Success AJAX: si `data.miplan_handoff.code` → CTA “Continuar a Mi Plan” → `https://cz-miplan2.vercel.app/e/{code}`  
- Si no hay code → gracias como hoy  
- URL CTA **sin** CI/LRW/PII

### 14.5 Verificaciones smoke producción

| # | Prueba | Esperado |
|---|--------|----------|
| 1 | Completar encuesta rechazado con JANUS OK | CTA visible; URL solo code |
| 2 | Click CTA | Mi Plan abre; prefill perfil/survey si sync |
| 3 | Segundo click mismo code | Sin nuevo contexto PII (409 / cache) |
| 4 | Secret mal / JANUS down | Encuesta OK; **sin** CTA |
| 5 | Tracking form steps | Sigue funcionando (secret tracking intacto) |
| 6 | Logs JANUS | `miplan_handoff_emit` / `redeem` **sin** raw code |
| 7 | Logs CZ `janus_log` | petition sin secret |

### 14.6 Qué NO tocar en cPanel

- Secret tracking (`PROD_SECRET` / tracking)  
- Flujo aprobado / `doEncuesta` otorgados (salvo necesidad)  
- API Bearer sync  
- DB schema Credizona (no hace falta tabla handoff en CZ)

### 14.7 Rollback

Restaurar backups de los 6–7 archivos; borrar `miplan_handoff.secret.php` si se desea; encuesta vuelve a `{data:[]}` sin CTA.

---

## 15. Pasos pendientes producción (orden recomendado)

1. Aplicar migración JANUS en Supabase.  
2. Setear ENV JANUS + redeploy Railway.  
3. Setear ENV Mi Plan + redeploy Railway.  
4. Deploy FE Mi Plan (Vercel) con `handoffEntry.js` + `vercel.json`.  
5. Ejecutar **CZ CPANEL DEPLOY PLAN**.  
6. Smoke E2E real.  
7. ~~`MIPLAN-JOURNEY-01`~~ — implementado en código; falta aplicar migración + deploy.

---

## 16. Status block

Ver respuesta final del agente.
