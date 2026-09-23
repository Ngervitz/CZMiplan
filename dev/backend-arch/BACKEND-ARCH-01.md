# BACKEND-ARCH-01 — Arquitectura backend Mi Plan

**Repo:** Ngervitz/CZMiplan  
**Branch:** main  
**Date:** 2026-09-23  
**Scope:** diseño únicamente — **sin** implementar Express, **sin** modificar código productivo, **sin** tablas/migraciones, **sin** Railway deploy  
**Inputs leídos:** BACKEND-ARCH-00-AS-IS, MOTOR-PORTABILITY-00, MOTOR-EXTRACTION-01 (D1–D7 CLOSED), MOTOR-PARITY-00, ENGINE-EXTRACTION-01, parity/MANIFEST.json  
**Engine auditado:** `engine/` (`runEngine`, `ENGINE_VERSION = miplan-engine-v1-extract-01`, 18/18 parity PASS)

Clases:

| Clase | Significado |
|-------|-------------|
| **CONFIRMED** | Evidencia en repo / decisiones de producto ya cerradas |
| **PROPOSED** | Diseño de este documento; implementable en fases |
| **FUTURE** | Extensión prevista; no bloquea V1 |

---

## 0. Principios

1. **Monolito modular Node/Express** en Railway — un proceso, módulos con boundaries claros.  
   No microservicios (CONFIRMED: sin evidencia que los justifique).
2. **Una sola implementación del motor** — `engine/` es la fuente de verdad de reglas.  
   El frontend no mantiene un fork permanente (CONFIRMED: ENGINE-EXTRACTION-01 + D1).
3. **Backend no confía en resultados del cliente** — recibe inputs; recalcula completeness; fija `now_ms`; ejecuta `runEngine`; persiste y responde ENGINE RESULT (CONFIRMED: D4, D5).
4. **Mi Plan independiente** de Credizona/Copanel/JANUS/PHP (CONFIRMED decisión producto).
5. **IP del motor** no debe quedar en el browser en el estado final (CONFIRMED).
6. **ASSISTANT-01 explica; el engine decide** (CONFIRMED).
7. Distinguir siempre CONFIRMED / PROPOSED / FUTURE.

---

## 1. Stack y ownership de plataformas

| Plataforma | Responsabilidad | Clase |
|------------|-----------------|-------|
| **Vercel** | Frontend SPA estático (`index.html` + `js/*` + CSS). Analytics tags. | CONFIRMED (AS-IS + decisión) |
| **Railway** | Backend Node/Express: API HTTP, `engine/`, diagnosis, identity linking, assistant, plus, payments webhooks, integrations | CONFIRMED decisión / PROPOSED diseño |
| **Supabase (proyecto propio Mi Plan)** | Postgres + Auth (magic link). Service role solo en Railway. | CONFIRMED decisión / PROPOSED esquema |
| **GitHub Ngervitz/CZMiplan** | Monorepo: frontend + `engine/` + futuro `server/` + docs | CONFIRMED |

**Plus Claude proxy AS-IS** (`api/plus/generate.js` en Vercel): CONFIRMED existe.  
**PROPOSED migración:** mover la llamada Anthropic a Railway (módulo `plus` / `assistant`) y **retirar** el shared secret de cliente (`CZ_PLUS_PROXY_CLIENT_SECRET`) — no forma parte de la arquitectura futura. El path Vercel puede coexistir temporalmente hasta cutover Plus.

No Python. No backend PHP Credizona. No JANUS.

---

## 2. Estilo arquitectónico

**BACKEND_STYLE (PROPOSED):** Modular monolith — un deploy Express en Railway.

```
server/  (PROPOSED layout; no crear aún)
  app.js                 # composition root
  http/                  # routes, middleware, validation
  modules/
    diagnosis/
    identity/
    persistence/
    assistant/
    plus/
    payments/
    integrations/
    consent/
    analytics/
    config/
  engine/                # hoy en repo root; o re-export require('../engine')
```

`engine/` **CONFIRMED** ya existe en raíz y es importable sin browser. El server lo consume como dependencia interna (`require("../engine")` o path estable). No se duplica.

---

## 3. Módulos y boundaries

### 3.1 Mapa de módulos (PROPOSED)

| Módulo | Responsabilidad | Puede depender de | No puede |
|--------|-----------------|-------------------|----------|
| **config/secrets** | Env, feature flags server, `engine_version` pin, CORS allowlist | — (hoja) | Nada de negocio |
| **engine** (paquete existente) | `runEngine(input)` determinístico | Solo su código + `js/*` vía VM | HTTP, DB, Auth, LLM |
| **persistence/repositories** | Acceso Supabase/Postgres tipado | config | engine rules, LLM, HTTP details |
| **identity** | anonymous_id registry, auth user link, upgrade anónimo→cuenta | persistence, config | engine, payments logic |
| **diagnosis** | Validar input → completeness path → `runEngine` → persistir → DTO respuesta | engine, persistence, identity, config | LLM, Handy, bureau |
| **assistant** | PRE_LLM guards → Claude → output guards → log; lee diagnosis persistido | persistence, identity, config (+ Anthropic SDK) | **No** llama `runEngine` para “corregir”; **no** muta diagnosis |
| **plus** | Orquestación informe Plus (inputs autorizados → LLM → store) | persistence, identity, config, (integrations) | No redefine motor diagnóstico |
| **payments** | Crear checkout Handy, verificar webhooks, grant entitlements | persistence, identity, config | engine |
| **integrations** | Equifax / Clearing / BCU / futuros adapters | config, persistence (raw store) | No decide plan/stage |
| **consent** | Versiones legales aceptadas server-side | persistence, identity | — |
| **analytics/events** | Eventos server-side append-only (opcional V1 mínimo) | persistence, identity | — |
| **http/api** | Express routes, rate limit, CORS, auth middleware | todos los application modules | Lógica de reglas del motor |

### 3.2 Dependencias permitidas (sin ciclos)

```
http → diagnosis | identity | assistant | plus | payments | consent | analytics
diagnosis → engine, persistence, identity, config
assistant → persistence, identity, config   (± Anthropic)
plus → persistence, identity, config, integrations?
payments → persistence, identity, config
integrations → config, persistence
consent / analytics → persistence, identity, config
engine → (nada del server)
persistence → config
```

**PROHIBIDO:** `engine` → DB; `assistant` → mutar `diagnoses.result`; `http` → SQL directo sin repository.

---

## 4. Flujo principal V1 (diagnóstico)

### 4.1 Secuencia (PROPOSED; alineada a D4/D5 + ENGINE-EXTRACTION-01)

```
[Frontend]
  1. Captura forms → arma EngineInput (sin reglas)
  2. Envía anonymous_id (LS) + payload inputs
        │
        v
[Railway API — diagnosis]
  3. Resolver/crear identity anónima (ver §7)
  4. Validar schema del payload (shape/types/límites; no reglas de negocio)
  5. Completeness: engine path recalcula (D4) — ignora booleans client
  6. now_ms = Date.now() en servidor (D5) — no confiar clock client en prod
  7. out = runEngine(input, { now_ms })
  8. Persistir registro diagnóstico NUEVO (append-only):
       - diagnosis_id (UUID server)
       - tenant_id (reservado; default fijo V1)
       - anonymous_id / user_id si linked
       - engine_version, now_ms
       - input_snapshot (JSON suficiente para reproducir)
       - engine_result (JSON)
       - completeness_recomputed
       - created_at
  9. Responder { diagnosis_id, engine_version, now_ms, engine_result, ... }
        │
        v
[Frontend]
 10. Asigna ENGINE RESULT a estado UI; renderiza
     B7 / UX1D2 siguen siendo FE (D2)
```

### 4.2 Diagnóstico incompleto

**CONFIRMED (oracle / D4):** perfil incompleto → stage `CLARIDAD` y campos de `completeness_recomputed`; el motor **sí** produce ENGINE RESULT.

**PROPOSED política de persistencia V1:**

| Caso | ¿Persistir? | Notas |
|------|-------------|-------|
| Inputs válidos estructuralmente (aunque incompletos financieramente) | **SÍ** — registro nuevo | Historial completo; incluye CLARIDAD |
| Payload inválido (schema fail) | **NO** | 400; sin diagnosis_id |
| Error interno engine | **NO** (o log error sin result) | 5xx; no fingir result |

No sobreescribir diagnósticos anteriores (CONFIRMED decisión producto).

### 4.3 `diagnosis_id`

- **PROPOSED:** UUID generado **solo en backend** al insertar fila exitosa post-`runEngine`.  
- Cliente no inventa `diagnosis_id` de autoridad.

### 4.4 `engine_version`

- **CONFIRMED hoy:** `ENGINE_VERSION = "miplan-engine-v1-extract-01"` en `engine/core/pipeline.js`.  
- **PROPOSED:** cada fila `diagnoses.engine_version` = valor emitido por `runEngine` (no git HEAD implícito).  
- Bump explícito cuando cambien reglas/tablas/flags que afecten output (proceso humano + re-captura oracle si aplica).

### 4.5 Reproducibilidad

Persistir juntos (PROPOSED):

| Campo | Rol |
|-------|-----|
| `input_snapshot` | EngineInput canónico usado (post-normalización server; sin secretos) |
| `now_ms` | Reloj de la corrida |
| `engine_version` | Identificador del motor |
| `config_digest` (opcional V1.1) | Hash de flags server efectivos (BCU live, encuesta, provenance) |
| `engine_result` | Output completo self-sufficient (D3) |

Re-ejecución auditoría: `runEngine(input_snapshot, { now_ms })` con mismo `engine_version` artefact → comparar.

---

## 5. API conceptual

No implementar. Sin sobrediseño REST.

### 5.1 V1_REQUIRED

| Método | Path (PROPOSED) | Auth | Propósito |
|--------|-----------------|------|-----------|
| `GET` | `/health` | none | Liveness Railway |
| `POST` | `/v1/diagnoses` | anonymous_id header/body | Calcular + persistir diagnóstico |
| `GET` | `/v1/diagnoses/:diagnosis_id` | owner (anon o user) | Recuperar un diagnóstico |
| `GET` | `/v1/diagnoses` | owner | Historial del identity (lista paginada mínima) |

Headers PROPOSED: `X-MiPlan-Anonymous-Id` (UUID); futuro `Authorization: Bearer <supabase jwt>` cuando haya cuenta.

Body `POST /v1/diagnoses`: EngineInput fields (ingreso, respuestas, gastos, deudas, …) — **sin** `engine_result` del cliente; **sin** `now_ms` de autoridad (ignorado en prod).

Respuesta: `{ diagnosis_id, engine_version, now_ms, engine_result, created_at }`.

### 5.2 FUTURE_RESERVED

| Método | Path | Propósito |
|--------|------|-----------|
| `POST` | `/v1/assistant/why` (o similar) | ASSISTANT-01 explicación |
| `POST` | `/v1/auth/magic-link` | trigger magic link (o usar Supabase client directo + link API) |
| `POST` | `/v1/plus/checkout` | iniciar pago Handy |
| `POST` | `/v1/plus/generate` | informe Plus (reemplaza `api/plus/generate` Vercel) |
| `GET` | `/v1/plus/status` | entitlement / report status |
| `POST` | `/v1/webhooks/handy` | webhooks pago |
| `POST` | `/v1/integrations/*` | Equifax/Clearing/BCU |
| `POST` | `/v1/consents` | consent server-side |
| `POST` | `/v1/events` | analytics server |

Auth magic link: **PROPOSED** preferir Supabase Auth hosted/client flow + backend verifica JWT; no reinventar tokens.

---

## 6. Modelo de datos (conceptual Supabase/Postgres)

**No SQL todavía.** Solo esquema conceptual.  
`tenant_id` **reservado** en tablas nuevas (UUID/text); V1 = un tenant default constante; **sin** lógica multi-tenant.

### 6.1 `identities_anonymous`

| | |
|--|--|
| **Propósito** | Registrar `anonymous_id` conocidos por el backend |
| **PK** | `id` (UUID) o `anonymous_id` (text unique) |
| **Campos esenciales** | `anonymous_id`, `tenant_id`, `created_at`, `last_seen_at`, `linked_user_id` (nullable) |
| **Sensibles** | No PII directa |
| **Retention** | Largo; base del historial pre-cuenta |

### 6.2 `profiles` / `auth.users` (Supabase Auth)

| | |
|--|--|
| **Propósito** | Cuenta autenticada (email + magic link) |
| **PK** | `auth.users.id` (Supabase) |
| **Campos app** | `profiles`: `user_id`, `tenant_id`, `email`, `created_at`, `primary_anonymous_id` (nullable post-link) |
| **Sensibles** | email |
| **Nota** | Auth tables managed by Supabase; `profiles` es extensión app |

### 6.3 `diagnoses`

| | |
|--|--|
| **Propósito** | Historial append-only de diagnósticos válidos |
| **PK** | `diagnosis_id` UUID |
| **FK** | `anonymous_id` → identities_anonymous; `user_id` → profiles (nullable hasta link) |
| **Campos esenciales** | `tenant_id`, `engine_version`, `now_ms`, `input_snapshot` jsonb, `engine_result` jsonb, `completeness_recomputed` jsonb, `created_at` |
| **Sensibles** | `input_snapshot` puede incluir email declarado, montos, deudas — tratar como PII financiero |
| **Retention / audit** | No update in-place del result; soft-delete futuro si legal lo exige; no borrar por “recalcular” |

### 6.4 `assistant_interactions` (FUTURE; diseño ahora)

| | |
|--|--|
| **Propósito** | Log de explicaciones ASSISTANT-01 |
| **PK** | `id` |
| **FK** | `diagnosis_id`, `user_id`/`anonymous_id` |
| **Campos** | `tenant_id`, `prompt_version`, `guardrail_version`, `model`, `request_meta`, `response_text`, `guard_results`, `fallback_used`, `created_at` |
| **Sensibles** | texto respuesta + meta; no loguear API keys |
| **Regla** | No almacena un “nuevo diagnóstico”; referencia el existente |

### 6.5 `consents` (FUTURE cercano)

| | |
|--|--|
| **Propósito** | Evidencia server de aceptación TyC/privacidad/comms |
| **PK** | `id` |
| **Campos** | `tenant_id`, `anonymous_id`/`user_id`, `consent_type`, `version`, `accepted_at`, `source` |
| **Sensibles** | vínculo identidad |

### 6.6 `subscriptions` / `purchases` (FUTURE Plus)

| | |
|--|--|
| **Propósito** | Entitlement Mi Plan Plus |
| **PK** | `id` |
| **Campos** | `tenant_id`, `user_id` (requerido post-compra), `product_code`, `status`, `handy_payment_id`, `granted_at`, `expires_at?` |
| **Sensibles** | ids de pago |

### 6.7 `payment_events` (FUTURE)

| | |
|--|--|
| **Propósito** | Audit log webhooks Handy (idempotencia) |
| **PK** | `id` / `provider_event_id` unique |
| **Campos** | raw payload (restringido), `processed_at`, `result` |
| **Sensibles** | datos de pago |

### 6.8 `integration_records` (FUTURE)

| | |
|--|--|
| **Propósito** | Snapshots Equifax/Clearing/BCU por diagnosis/user |
| **Campos** | `tenant_id`, `provider`, `raw`/`normalized`, `diagnosis_id?`, `fetched_at` |
| **Sensibles** | alto — bureau data; acceso restringido |

### 6.9 `analytics_events` (FUTURE / V1 mínimo opcional)

| | |
|--|--|
| **Propósito** | Eventos server si se necesita fuera de GTM |
| **Campos** | `tenant_id`, identity refs, `event_name`, `payload` reducido, `created_at` |
| **Nota** | GTM client (CONFIRMED AS-IS) puede seguir; no duplicar todo |

**Evitar tablas especulativas:** no “recommendations”, no “plans catalog” DB — viven en engine.

---

## 7. Identidad y upgrade anónimo → cuenta

### 7.1 Modelo V1 (CONFIRMED decisión + PROPOSED mecánica)

```
anonymous_id (cliente LS, hoy cz_anonymous_id)
    → backend registra / reconoce
    → muchos diagnoses con anonymous_id
    → compra Plus → pide email
    → Supabase magic link
    → sesión autenticada (user_id)
    → link: anonymous_id.linked_user_id = user_id
    → diagnoses previos: UPDATE user_id WHERE anonymous_id = … AND user_id IS NULL
```

**No forzar cuenta** para usar diagnóstico free (CONFIRMED).

### 7.2 Riesgos y mitigación V1 (PROPOSED, no excesiva)

| Riesgo | Mitigación V1 |
|--------|----------------|
| `anonymous_id` manipulado / enumeración | UUID v4; rate limit; **no** listar historial sin poseer el id; en retrieval exigir match header; opcional firma HMAC server-set cookie futura (V1.1) |
| Account linking incorrecto | Link solo en flujo autenticado post-magic-link + confirmación email del checkout; un `anonymous_id` → a lo sumo un `user_id`; no merge automático multi-anon |
| Múltiples dispositivos | Cada device tiene su `anonymous_id`; historial no se unifica hasta login mismo email; **aceptado V1** |
| Múltiples anon → mismo user | Al login, link **solo** el anon de la sesión actual; no claim automático de otros anons (evita robo de historial) |
| Cliente envía `user_id` falso | Ignorar; solo JWT Supabase válido |

### 7.3 IDENTITY_MODEL

**Anonymous-first + optional Supabase Auth (magic link) at Plus purchase; diagnoses keyed by anonymous_id then backfilled user_id on link.**

---

## 8. Engine versioning

| Elemento | Definición |
|----------|------------|
| **Identificador** | String explícito `engine_version` emitido por `runEngine` (CONFIRMED field) |
| **No usar solo** | git SHA como único id (puede acompañar en meta deploy, no sustituye) |
| **Por diagnóstico** | Guardar `engine_version` + `now_ms` + `input_snapshot` + `engine_result` |
| **Cambio de reglas** | Bump `ENGINE_VERSION` en `engine/core/pipeline.js` + parity corpus + release notes |
| **Flags** | `bcu_clearing_live`, `tiene_encuesta`, provenance: server config; idealmente en snapshot o `config_digest` |

**ENGINE_VERSIONING_DEFINED: YES**

---

## 9. ASSISTANT-01

### 9.1 Boundary (CONFIRMED)

- Engine decide diagnóstico.  
- ASSISTANT-01 **explica** resultado persistido.  
- **Nunca** recalcula ni modifica `engine_result` / plan / stage / acciones.  
- Claude API key **solo** server-side (Railway env).  
- Módulo de Mi Plan, no producto separado.

### 9.2 Flujo conceptual (PROPOSED)

```
Client → POST /v1/assistant/... { diagnosis_id, question_type }
  → load diagnosis (authz)
  → build evidence bundle FROM engine_result + input allowlist
  → PRE_LLM guards + evidence sufficiency (reutilizar harness patterns)
  → Claude Haiku
  → output / numeric guards
  → fallback si fail
  → persist assistant_interactions
  → return explanation
```

### 9.3 Reuso

Harness en `dev/assistant-01/` (CONFIRMED DEV_ONLY): guards, evidence contracts, system-prompt-v1 — **portar/adaptar** a módulo server; no rediseñar salvo incompatibilidad concreta con diagnosis persistido.

### 9.4 Versionado

Campos `prompt_version`, `guardrail_version`, `model` en cada interacción.

**ASSISTANT_BOUNDARY_DEFINED: YES**

---

## 10. Seguridad

### 10.1 Secretos (PROPOSED ubicación)

| Secreto | Dónde | Nunca |
|---------|-------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Railway env | Browser, git |
| `SUPABASE_URL` + anon key | Anon puede FE; service role no | — |
| `CZ_CLAUDE_API_KEY` / Anthropic | Railway env | Browser; retirar `ALLOW_BROWSER_KEY` path prod |
| Handy secrets / webhook signing | Railway env | Browser |
| Equifax/etc. | Railway env | Browser |
| `CZ_PLUS_PROXY_CLIENT_SECRET` | **RETIRAR del diseño futuro** (CONFIRMED problema AS-IS en `js/config.js`) | No reintroducir shared secret en FE |

### 10.2 Controles API (PROPOSED V1 mínimos)

- CORS allowlist: orígenes Vercel prod (+ localhost dev).  
- Rate limiting por IP + por `anonymous_id` en `POST /diagnoses` y assistant.  
- Payload validation (tamaño max, tipos, arrays bounded).  
- Webhook verification (Handy) cuando exista.  
- AuthZ: diagnosis read solo owner (anon match o user_id).  
- Logs: no volcar `input_snapshot` completo a stdout; redacter email/CI; correlation id.

### 10.3 Confianza

- No aceptar `engine_result` del cliente.  
- No aceptar `now_ms` client en prod.  
- No aceptar completeness flags client (D4).  
- No aceptar `bcu_clearing_live=true` desde client en prod (MC-10).

**SECURITY_BOUNDARY_DEFINED: YES**

---

## 11. Railway / Vercel / Supabase — ambientes

| Ambiente | Frontend | Backend | DB/Auth | Secrets |
|----------|----------|---------|---------|---------|
| **local/dev** | static / Vercel dev | Express local + `engine/` | Supabase local o proyecto dev | `.env` gitignored |
| **staging** | FUTURE — solo si hay pago/bureau reales que lo exijan | — | — | — |
| **production** | Vercel | Railway | Supabase prod | Railway/Vercel dashboards |

**PROPOSED V1:** sin staging obligatorio; dev + prod bastan hasta Plus live / bureau.

Variables tipicas Railway: `PORT`, `SUPABASE_*`, `CZ_CLAUDE_API_KEY`, `CORS_ORIGINS`, `DEFAULT_TENANT_ID`, Handy keys (future).

**SUPABASE_BOUNDARY_DEFINED: YES**  
**RAILWAY_BOUNDARY_DEFINED: YES**

---

## 12. Migración del frontend (diseño; no ejecutar)

Objetivo final: **FRONTEND_ENGINE_FINAL_STATE = REMOVED** (reglas centrales fuera del bundle).

| Fase FE | Qué hace | Criterio |
|---------|----------|----------|
| **M0** (hoy) | Browser motor + `engine/` Node en repo sin HTTP | CONFIRMED |
| **M1 Shadow** | FE llama API; también corre motor local; compara (reuse parity helpers / sample) | Diff≈0 en cohort; flag off para users |
| **M2 Consume** | FE usa solo ENGINE RESULT de API para UI decisión; motor local dead path | Flag on % traffic |
| **M3 Remove** | Eliminar/omitir carga de algorithms/survey/TASAS decision del bundle; dejar presentation + B7 | Bundle sin IP core |
| **M4 Cleanup** | Retirar `api/plus` Vercel secret pattern; Plus vía Railway | Sin secretos en `js/config` |

`cr_v3` puede seguir como cache UX offline; **no** autoridad de diagnóstico (PROPOSED).

Shadow/parity: reutilizar `dev/backend-arch/parity/` + `engine/bin/check-parity.js` en CI; producción shadow sampling opcional.

---

## 13. Implementation phases (PROPOSED)

Orden justificado por evidencia: engine ya listo → infra HTTP → persistencia → shadow FE → cutover → LLM → pagos → bureaux.

### B1 — Infraestructura mínima backend

| | |
|--|--|
| **Objetivo** | Proceso Express en repo + `/health` + montaje `runEngine` sin DB obligatoria (o dry-run) |
| **Alcance** | Skeleton `server/`, config env, CORS, rate limit básico, `POST /v1/diagnoses` **sin** persistir aún **o** con persist in-memory/dev — preferible: calcular y devolver sin DB si Supabase no listo |
| **Cierre** | Deployable local; `runEngine` vía HTTP; secrets no en FE; parity script sigue 18/18 offline |
| **Deps** | ENGINE-EXTRACTION-01 CLOSED |

### B2 — Persistence + diagnosis durable

| | |
|--|--|
| **Objetivo** | Supabase tablas identities + diagnoses; append-only; GET by id + list |
| **Alcance** | Repositories; `tenant_id` default; input_snapshot + engine_result; anonymous registry |
| **Cierre** | Crear diagnóstico → fila → retrieve round-trip; reproducibilidad spot-check |
| **Deps** | B1 + proyecto Supabase |

### B3 — Frontend integration / shadow

| | |
|--|--|
| **Objetivo** | Adapter FE construye EngineInput → API; shadow compare |
| **Alcance** | No remover motor browser; feature flag; no cambiar reglas |
| **Cierre** | Shadow PASS en corpus + muestra prod; UX intacta |
| **Deps** | B2 |

### B4 — Cutover + removal browser engine IP

| | |
|--|--|
| **Objetivo** | FE consume solo API result; retirar reglas del bundle |
| **Alcance** | Flag cutover; delete/omit algorithms decision paths; B7 queda FE |
| **Cierre** | Prod sin motor expuesto; parity CI green |
| **Deps** | B3 estable |

### B5 — ASSISTANT-01 product

| | |
|--|--|
| **Objetivo** | Endpoint explicación ligado a diagnosis_id |
| **Alcance** | Port guards/prompt; Claude server-side; logging |
| **Cierre** | Guards + harness baselines aplicables; no muta diagnosis |
| **Deps** | B2 (diagnosis persistido); ideal post-B3 |

### B6 — Plus / auth / payments

| | |
|--|--|
| **Objetivo** | Magic link, checkout Handy, webhook, entitlement, Plus generate en Railway |
| **Alcance** | Retirar client proxy secret; mover Claude Plus a backend |
| **Cierre** | Compra verificada server-side; grant no confía en query `plus_payment=success` solo |
| **Deps** | B2; auth Supabase |

### B7 — Integrations

| | |
|--|--|
| **Objetivo** | Equifax/Clearing/BCU adapters + consent server |
| **Alcance** | Credenciales server; records; no meter bureau en browser |
| **Cierre** | Sandbox → prod flags; retention definida |
| **Deps** | B6 o paralelo controlado post-B2 |

**IMPLEMENTATION_PHASES_DEFINED: YES**

---

## 14. Plus / pagos / integraciones (FUTURE capacidad)

El monolito **reserva** módulos `plus`, `payments`, `integrations` sin implementarlos en B1.

Handy: checkout + webhook verification + `payment_events` idempotentes.  
Plus report: inputs desde diagnosis + integrations; LLM server-side.  
No diseñar backend “alrededor” de IA — diagnosis path no depende de Claude.

---

## 15. Observabilidad mínima (PROPOSED)

- Structured logs JSON: `request_id`, route, `anonymous_id` hash, `diagnosis_id`, latency, status.  
- No PII en claro en logs de info.  
- Metrics: count diagnoses, engine errors, assistant fallbacks (cuando existan).  
- Health: `/health` (+ opcional DB ping en B2).  
- Alertas Railway básicas (crash/restart).

---

## 16. Estrategia de despliegue (PROPOSED)

```
GitHub main
  ├─ Vercel: frontend (existente)
  └─ Railway: server service (Dockerfile o Nixpacks Node)
       └── depends on Supabase (external)
```

CI mínimo FUTURE: `node engine/bin/check-parity.js` + smoke en PR.  
No Railway/Supabase creados en este sprint.

---

## 17. Evidencia engine (audit)

| Check | Estado |
|-------|--------|
| `engine/` importable Node | CONFIRMED ENGINE-EXTRACTION-01 |
| API `runEngine` → `{ engine_version, now_ms, engine_result }` | CONFIRMED |
| Parity 18/18 | CONFIRMED |
| Browser runtime deps host | NONE |
| Reglas forkeadas | NO — VM carga `js/*` |
| Listo para integración backend | YES |

Contrato: backend **envuelve** `runEngine`; no reimplementa.

---

## 18. Qué no es este documento

- No Express code, no migrations, no Railway project, no FE cutover.  
- No reabre D1–D7.  
- No toca oracle ni `dev/narrative-05-qa.js`.  
- No microservicios.  
- No dependencia obligatoria Credizona.

---

## 19. Resumen de decisiones de diseño

| Tema | Valor |
|------|-------|
| Estilo | Modular monolith Express @ Railway |
| Engine ownership | Solo `engine/` server-side; FE deja de ser fuente de verdad |
| Estado final FE motor | Removido del bundle (post B4) |
| Identidad | Anonymous-first → magic link at Plus |
| Historial | Append-only `diagnoses` |
| Completeness / clock | Server (D4/D5) |
| Assistant | Explain-only sobre diagnosis persistido |
| Secretos FE | Prohibidos; retirar proxy client secret |

---

ARCHITECTURE_STATUS: READY

BACKEND_STYLE: modular_monolith_express_railway

ENGINE_OWNERSHIP: server_engine_package_single_source

FRONTEND_ENGINE_FINAL_STATE: removed_after_cutover

IDENTITY_MODEL: anonymous_id_first_supabase_magic_link_on_plus

DIAGNOSIS_HISTORY_MODEL: append_only_full_history

ENGINE_VERSIONING_DEFINED: YES

ASSISTANT_BOUNDARY_DEFINED: YES

SUPABASE_BOUNDARY_DEFINED: YES

RAILWAY_BOUNDARY_DEFINED: YES

SECURITY_BOUNDARY_DEFINED: YES

IMPLEMENTATION_PHASES_DEFINED: YES

OPEN_DECISIONS_BEFORE_B1:
- NONE
