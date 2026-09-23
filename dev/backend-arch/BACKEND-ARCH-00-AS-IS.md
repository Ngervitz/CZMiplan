# BACKEND-ARCH-00 — Radiografía AS-IS de Mi Plan

**Repo:** Ngervitz/CZMiplan  
**Scope:** auditoría solo lectura del estado real del repositorio  
**Date:** 2026-09-23  
**HEAD de referencia al momento de la auditoría:** `b6da44b` (Add Mi Plan assistant terms v1)  
**PRODUCTION_CODE_CHANGES:** NONE  
**Este documento:** único artefacto nuevo permitido; no propone arquitectura objetivo

---

## Clases de evidencia

| Clase | Significado |
|-------|-------------|
| **CONFIRMED_FROM_CODE** | Observado en código ejecutable del producto o API en repo |
| **CONFIRMED_FROM_CONFIG** | Constantes/flags/config de runtime en repo |
| **CONFIRMED_FROM_DOCS** | Afirmado en docs; no implica implementación |
| **DEV_ONLY** | Harness/QA/tooling; no es backend productivo |
| **DESIGNED_ONLY** | Comentarios, TODOs, URLs sin caller, flags off, stubs |
| **UNCERTAIN** | Evidencia insuficiente o conflicto docs vs código |

---

## 1. Frontend actual

### 1.1 Entry points y páginas

| Path | Rol | Evidencia |
|------|-----|-----------|
| `index.html` | SPA principal del producto | CONFIRMED_FROM_CODE `index.html:70-88` |
| `tyc.html` | Términos estáticos (TC_v2.1_202608) | CONFIRMED_FROM_CODE |
| `privacidad.html` | Política de Privacidad estática | CONFIRMED_FROM_CODE |
| `landing-reference/miplan-landing-v13.html` | Referencia de diseño; no carga el stack de `index.html` | CONFIRMED_FROM_CODE |
| `dev/synthetic-motor-test.html`, `dev/qa-situacion-hoy.html` | QA | DEV_ONLY |

### 1.2 Carga de scripts (orden real)

CONFIRMED_FROM_CODE `index.html:70-88`:

1. `js/config.js`
2. `js/identity.js`
3. `js/creditors.js`
4. `js/survey.js`
5. `js/algorithms.js`
6. `js/actionNarrativeTaxonomy.js`
7. `js/crm.js`
8. `js/events.js`
9. `js/analytics.js`
10. `js/credizonaLogoBase64.js`
11. `js/plusReportV2IaPrompt.js`
12. `js/plusReport.js`
13. `js/plusReportV2Schema.js`
14. `js/plusMock.js`
15. `js/ui.js`
16. `js/consent.js`
17. `js/consentComms.js`
18. `js/celebrations.js`
19. `js/app.js`
20. `js/czDebug.js` solo si `?czdev=true` (DEV_ONLY)

CSS: `css/styles.css`. Mount: `#app` / `#main-content` / `#sticky-bar`. GTM embebido (`GTM-MK9GJ68R`).

Dependencias npm de runtime del producto: **ninguna**. `package.json` solo declara Playwright como `devDependency`. CONFIRMED_FROM_CONFIG `package.json:1-5`.

Estado global: `window.CZState` (orquestado en `js/app.js`), `window.CZIdentity`, `PRE` (preload URL/encuesta en `js/config.js`), `window.CredizonaUI` (`js/ui.js`).

### 1.3 Flujo real reconstruido

| Etapa | Dónde corre | Módulo / función | Inputs | Outputs | Persistencia | Externos |
|-------|-------------|------------------|--------|----------|--------------|----------|
| Entrada / segmento URL | Browser | `SEGMENTO` / `PRE` `js/config.js` | query params | flags de flujo | no (salvo identity) | — |
| Consent legales / Mi Plan | Browser | `js/consent.js`, UI en `js/ui.js` | checkboxes | `CZState.consent` / `cz_consent_v1` | LS | — |
| SEO IA onboarding (si `source=seo_ia`) | Browser | `js/ui.js` + `js/survey.js` | P1–P10 | survey score en PRE / `seo_ia_*` | `cr_v3` | — |
| Bridge / diagnosis screen | Browser | `renderBridgeScreen` / `renderDiagnosisScreen` | segment | UI | — | — |
| Ingreso / perfil | Browser | `renderIngreso` + flags `financial_*_complete` | declarado | `declared_*` | `cr_v3` | — |
| Encuesta conductual (scoring) | Browser | `calcularEncuesta` `js/survey.js:93+` | `PRE.respuestas` | score/nivel encuesta | vía motor → `diag` | URL externa encuesta `SURVEY_URL` CONFIG `js/config.js:60` |
| Deudas (step 1) | Browser | UI + `CZState.deudas` | form | deudas | `cr_v3` | — |
| Gastos (step 2) | Browser | UI + `CZState.gastos` | form | gastos | `cr_v3` | — |
| Diagnóstico / motor | Browser | `assignMotorDiagnosis` → `calcularMotor` `js/app.js:236-247`, `js/algorithms.js:664+` | deudas/gastos/PRE | `st.diag` | `cr_v3` | — |
| Dashboard Plan / Deudas | Browser | `renderDashboard` / tabs `js/ui.js` | `diag` | HTML | `cr_v3` (tab) | — |
| Acciones / next step / narrative | Browser | `seleccionarAccionesRecomendadas`, `resolveDashboardCoherence`, `narrative_decision` | `diag` | UI + campos en `diag` | `cr_v3` | — |
| Mi Plan Plus tab | Browser | `js/ui.js` + `js/app.js` Plus hooks | flags Plus | UI / estado Plus local | `cr_v3` | Claude proxy (solo path test/informe) |
| Post-flujo CRM | Browser stub | `enviarCRM` `js/crm.js` | payload | no network live | DESIGNED_ONLY | Credizona API URLs unused |

Orquestación documentada: `calcularMotor() → financial_stage → resolveDashboardCoherence() → UI`. CONFIRMED_FROM_DOCS `docs/STATE.md:24-26` y alineada con call sites en código.

---

## 2. Motor determinístico

**Locus:** 100% browser/client-side en el producto. CONFIRMED_FROM_CODE.

| Pieza | Archivo principal | Runtime | Deps browser |
|-------|-------------------|---------|--------------|
| Scoring financiero | `calcularFinanciero` `js/algorithms.js` (~131+) | browser | `window.CZState` (`js/algorithms.js:7-9`) |
| Scoring encuesta | `calcularEncuesta` `js/survey.js` | browser | `PRE` |
| Motor combinado | `calcularMotor` `js/algorithms.js:664+` | browser | window/CZState/PRE |
| Plan / guardrails | `asignarPlan`, `applyPlanGuardrail` | browser | — |
| DTI / stock | campos `dti_ratio` / `evaluarStockDeuda` en algorithms + UI | browser | — |
| Flujo libre | `flujoLibre` en cálculo financiero | browser | — |
| Deudas / prioridad | state + helpers algorithms/app | browser | — |
| financial_stage | `resolveFinancialStage` / `attachFinancialStageToDiag` `js/algorithms.js:1442-1484` | browser | — |
| Narrative decision | `resolveNarrativeDecision` / attach en algorithms | browser | — |
| Interpretación / copy | `interpretarDiagnostico` / `interpretarSituacion` | browser | — |
| Acciones | `seleccionarAccionesRecomendadas` + taxonomy `js/actionNarrativeTaxonomy.js` | browser | — |
| Next step | `resolveDashboardCoherence` + resolvers `js/ui.js` (~2389+) | browser | DOM/UI |
| Provenance | Flag `CZ_DECISION_PROVENANCE` default **false** `js/config.js:13-16`; stamps FS/ACT/NS cuando on | browser | — |

Docs listan “Mover `calcularMotor()` al backend” como pendiente. DESIGNED_ONLY / CONFIRMED_FROM_DOCS `docs/STATE.md:169`. **No implementado.**

No hay ejecución server-side del motor en este repo.

---

## 3. Persistencia actual

### 3.1 localStorage

| Key | Datos | Escritor | Lector | Refresh | Nueva sesión (mismo browser) | Cross-device |
|-----|-------|----------|--------|---------|------------------------------|--------------|
| `cr_v3` (`STORAGE_KEY`) | Snapshot casi completo: step, gastos, deudas, diag, snap, Plus, consent Mi Plan, seo_ia_*, vertical, email, etc. | `guardarLocal` `js/app.js:1074-1146` | `cargarLocal` `js/app.js:1149-1155` | Sí | Sí | No |
| `cz_anonymous_id` | UUID dispositivo | `js/identity.js:19-32` | identity | Sí | Sí (sobrevive `resetear`) | No |
| `cz_crm_contact_id` | CRM id desde `?czuid=` | `js/identity.js:39-54` | identity / analytics | Sí | Sí | No (salvo mismo czuid en URL) |
| `cz_consent_v1` | Versiones legales funnel | `js/consent.js` | consent | Sí | Sí | No |
| `cz_comms_shown_v1` | Flag UI comms | `consentComms.js` | same | Sí | Sí | No |
| `cz_first_seen_at` | First-touch CRM | `js/crm.js` | CRM payload | Sí | Sí | No |

### 3.2 sessionStorage

| Key | Rol | TTL / notas |
|-----|-----|-------------|
| `cz_session_id` | Session UUID | 30 min inactivity `js/identity.js:13,60-77` |
| `cz_session_last_seen` | Heartbeat | same |
| `cz_miplan_session_started` | Dedup analytics | session |
| `cz_acciones_mostradas_fired` | Dedup evento | session |
| `cz_toast_dashboard_shown` | Dedup toast | session |

### 3.3 Otros mecanismos

| Mecanismo | Estado | Evidencia |
|-----------|--------|-----------|
| Cookies (`document.cookie`) | NOT_FOUND en `js/` | CONFIRMED_FROM_CODE (grep) |
| IndexedDB | NOT_FOUND en `js/` | CONFIRMED_FROM_CODE |
| Query params | Entrada (`czuid`, `cedula`, `source`, `plus_payment`, etc.) | CONFIRMED_FROM_CODE |
| Forms / hidden fields | UI forms; estado en `CZState` | CONFIRMED_FROM_CODE |
| DB central Mi Plan | No en este repo | CONFIRMED_FROM_CODE + UNCERTAIN externo CRM MySQL solo en docs |
| Supabase / Railway storage | NOT_FOUND | CONFIRMED_FROM_CODE |

**Nota:** No se infieren políticas de retención; solo el mecanismo del storage del navegador.

Estructura histórica **`cr_v3`**: CONFIRMED_FROM_CONFIG `js/config.js:10` + escritura `js/app.js:1079`.

---

## 4. Servicios externos e integraciones

| Proveedor | Estado | Finalidad | Browser/Server | Evidencia clave |
|-----------|--------|-----------|----------------|-----------------|
| Anthropic / Claude (Plus) | **IMPLEMENTED** | Informe Plus via proxy | Server `api/plus/generate.js`; browser llama `/api/plus/generate` | `api/plus/generate.js:108-148`; `js/plusReport.js:407-424` |
| Anthropic browser direct | **IMPLEMENTED** pero **off** por default | Fallback si proxy off + allow browser key | Browser | `js/config.js:480-481`; `js/plusReport.js:434-462` |
| Claude ASSISTANT-01 | **DEV_ONLY** | Harness live QA | Node | `dev/assistant-01/harness.js` |
| Equifax | **DESIGNED_ONLY** | Datos verificados futuros | — | `INPUT_SOURCES.VERIFIED` comment `js/config.js:37-41`; copy UI; no HTTP client |
| BCU | **STUB / SIMULATED** | Input Plus mock; live flag off | Browser mock | `CZ_PLUS_BCU_CLEARING_LIVE=false` `js/config.js:470`; mock `js/plusReport.js` |
| Clearing | **STUB / SIMULATED** + URL unused | Idem | Browser mock / URL CONFIG | `API.clearing` `js/config.js:55` sin callers live |
| Handy | **STUB** | Redirect checkout | Browser | `iniciarPagoHandy` `js/app.js:1000-1014`; `CZ_HANDY_ENDPOINT=""` `js/config.js:471`; `CZ_PLUS_PAYMENT_LIVE=false` |
| Handy create-payment / webhook / status / payment id | **NOT_FOUND** | — | — | grep sin implementación |
| Credizona CRM APIs | **DESIGNED_ONLY** | guardar/hydrate | fetch comentado | `js/crm.js:329-345`, `enviarCRM` sin network live |
| Credizona logo CDN | **IMPLEMENTED** (asset) | Branding | Browser | `index.html` |
| GTM / GA4 / Meta | **IMPLEMENTED** (client tags) | Analytics | Browser | `index.html` / `docs/STATE.md:17-21` |
| Supabase | **NOT_FOUND** | — | — | — |
| Railway | **NOT_FOUND** | — | — | — |
| MiDeuda partner | **DESIGNED_ONLY** | Redirect futuro | Flag off | `js/config.js:484-498` |

### Handy — checklist explícito

| Capacidad | Estado |
|-----------|--------|
| create-payment | NOT_FOUND |
| webhook | NOT_FOUND |
| payment status | NOT_FOUND |
| checkout | STUB (redirect a endpoint vacío) |
| callback | STUB (`?plus_payment=success` → grant local) `js/app.js:1030-1039` |
| payment/transaction id | NOT_FOUND |

---

## 5. Backend existente

| Asset | Endpoint | Runtime | Propósito | Caller | Clasificación |
|-------|----------|---------|-----------|--------|---------------|
| `api/plus/generate.js` | `POST /api/plus/generate` | Vercel serverless (convención `api/`) | Proxy Claude para informe Plus | `js/plusReport.js:420` | **PRODUCTION_PATH** (código); deploy real **UNCERTAIN** sin `vercel.json` en repo |
| `api/plus/systemPrompt.js` | (módulo) | same | System prompt Plus | generate.js | PRODUCTION_PATH |
| `/api/plus/email-report` | (referenciado) | — | Email informe | Comentario + stub local | DESIGNED_ONLY `js/plusReport.js:736-749` |
| Express / custom Node server | — | — | — | — | NOT_FOUND |
| Webhooks | — | — | — | — | NOT_FOUND |
| `dev/assistant-01/` | — | Node scripts | Harness | CLI | **DEV_ONLY** — no confundir con backend producto |

Auth proxy: header `x-cz-plus-secret` vs `process.env.CZ_PLUS_PROXY_SECRET`. CONFIRMED_FROM_CODE `api/plus/generate.js:1-5,22-44`. Comentario: beta gate, no auth real de usuario.

Env server: `CZ_CLAUDE_API_KEY`, `CZ_CLAUDE_MODEL`, `CZ_PLUS_PROXY_SECRET`, `VERCEL` / `VERCEL_ENV`.

---

## 6. Secretos y API keys

**No se imprimen valores.**

| Variable / secreto | Dónde | Browser/Server | Expuesto al cliente? | Notas |
|--------------------|-------|----------------|----------------------|-------|
| `CZ_CLAUDE_API_KEY` | `js/config.js:477` vacío; `process.env` en generate.js; `.env` local gitignored | Server intended; browser si se setea en config | Solo si se pone en `config.js` / `config.local.js` y `ALLOW_BROWSER_KEY` | Prod path: env Vercel |
| `CZ_CLAUDE_ALLOW_BROWSER_KEY` | `js/config.js:480` = false | Browser (flag público) | Flag sí; key no por default | |
| `CZ_CLAUDE_MODEL` | config + env | Ambos | No secreto | |
| `CZ_PLUS_PROXY_SECRET` | Solo server env | Server | No | |
| `CZ_PLUS_PROXY_CLIENT_SECRET` | **Hardcoded no vacío en `js/config.js:482`** | Browser | **SÍ** | Shared secret beta enviado como header |
| `API_TOKEN` | `js/config.js:11` vacío | Sería browser si set | — | CRM comentado |
| `ANTHROPIC_API_KEY` | ASSISTANT-01 harness | Node DEV | No | DEV_ONLY |
| Equifax / Handy API keys | — | — | — | NOT_FOUND |
| Supabase keys | — | — | — | NOT_FOUND |

**SENSITIVE_SECRET_FOUND: YES**  
- Archivo: `js/config.js`  
- Tipo: shared secret de proxy Plus hardcodeado en cliente (`CZ_PLUS_PROXY_CLIENT_SECRET`)  

Adicional (no commiteado): `.env` en root (gitignored) con `CZ_CLAUDE_API_KEY` — local only; no tracked.

`.gitignore` ignora `.env` y `js/config.local.js`. CONFIRMED_FROM_CONFIG `.gitignore:1-7`.

---

## 7. Identidad del usuario / diagnóstico

| Identificador | Origen | Storage | Identifica | Persistente | Auth |
|---------------|--------|---------|------------|-------------|------|
| `anonymous_id` | generado | LS `cz_anonymous_id` | dispositivo | Sí | No |
| `session_id` | generado | SS `cz_session_id` | sesión browser (30m) | Sesión | No |
| `crm_contact_id` | `?czuid=` | LS | contacto CRM externo | Sí (si llegó URL) | No (trust URL) |
| CI / `cedula` | URL / PRE default demo | en PRE / CRM payload; no key LS dedicada | persona (declarada) | vía `cr_v3`/CRM si se enviara | No |
| email / teléfono / nombre | URL / forms | `cr_v3` / PRE | persona declarada | browser | No |
| `diag` | motor | `cr_v3` | diagnóstico completo | browser | No |
| `diagnosis_id` server | — | — | — | — | **No existe** |
| `snapshot_id` | `buildDiagnosisSnapshot` | en snapshot | captura puntual | no server | No |
| `plus_report_id` | `"plus_" + Date.now()` | `cr_v3` | informe Plus local | browser | No |

**AUTHENTICATED_USER: NO** — no login/password/OAuth/session cookie server. CONFIRMED_FROM_CODE.

**SERVER_SIDE_SESSION: NO** — no sesión server en repo. CONFIRMED_FROM_CODE.

**PERSISTENT_DIAGNOSIS_ID: NO** (server-side). Persistencia de `diag` solo en `localStorage` `cr_v3`. CONFIRMED_FROM_CODE.

---

## 8. Mi Plan Plus (por componente)

| Componente | Clasificación | Qué ve el usuario | Qué ocurre realmente |
|------------|---------------|-------------------|----------------------|
| Tab Plus / pricing display | REAL (UI + precio constante 1290) | Precio / CTA | `CZ_PLUS_PRICE_UYU` `js/config.js:474` |
| Gating pago | SIMULATED / off | Mensaje “activando” | `CZ_PLUS_PAYMENT_LIVE=false`; `onPlusCtaClick` `js/app.js:1053-1058` |
| Handy checkout | STUB | N/A mientras live=false | Endpoint vacío; redirect shell |
| Grant compra | SIMULATED | Estado comprado local si se forzara live path | `completarCompraPlus` setea flags LS `js/app.js:970-998` **sin** verify server |
| Equifax | DESIGNED_ONLY | Menciones copy | Sin API |
| BCU/Clearing | SIMULATED (mock) | Informe test con datos mock | `getMockPlusInput`; live flag false; `buildPlusInput` throws `js/plusReport.js:281-289` |
| Generación Claude | IMPLEMENTED (código) | Informe vía botón **test** | `btn-plus-test-generar` → `generarInformePlus({useTestInput:true})` `js/app.js:3816-3832` + proxy |
| Pipeline post-compra → informe | STUB / incompleto | Processing status | `completarCompraPlus` **no** llama `generarInformePlus` |
| Email report | STUB | ok falso | `setTimeout` resolve `js/plusReport.js:736-749` |
| PDF | IMPLEMENTED client | Descarga/print | `downloadPlusReportPdf` |
| Asistente IA teaser en Plus | DESIGNED_ONLY | “coming soon” UI | No es ASSISTANT-01 |

**Veredicto Plus:** **parcial / mayormente simulado** en pago y datos externos; **Claude proxy real en código** ejercido por path de test + input mock/test.

---

## 9. ASSISTANT-01

Referencia: consolidado en Git (`b415e6e`).

| Existe como | Clasificación |
|-------------|---------------|
| Diseño + system prompt + revisions | READY_AS_DESIGN / DEV_ONLY `dev/assistant-01/system-prompt-v1.txt` |
| Harness, fixtures, guards, evaluate, evidence contracts, numeric guard, text_ref catalog, baselines, findings, QA | READY_AS_DEV_TOOLING |
| Endpoint productivo | NOT_IMPLEMENTED |
| Builder productivo en frontend | NOT_IMPLEMENTED |
| Integración `index.html` | NOT_IMPLEMENTED (no se carga) |
| Persistencia assistant | NOT_IMPLEMENTED |
| Server-side provider call producto | NOT_IMPLEMENTED (solo harness Node + Plus proxy es otro producto) |
| Production guards / rate limit assistant | NOT_IMPLEMENTED |

README: “DEV-only. Does not implement product UX.” CONFIRMED_FROM_DOCS `dev/assistant-01/README.md:3-4`.

---

## 10. Infraestructura actual

| Ítem | Estado | Evidencia |
|------|--------|-----------|
| Hosting frontend | Vercel (docs + dominio) | CONFIRMED_FROM_DOCS `docs/STATE.md:4,13-15`; UNCERTAIN sin `vercel.json` |
| Backend hosting | Vercel Functions (convención `api/`) | CONFIRMED_FROM_CODE `api/plus/*` + DOCS |
| `vercel.json` | Ausente | CONFIRMED_FROM_CODE |
| `package.json` | Solo Playwright | CONFIRMED_FROM_CONFIG |
| Build system | Ninguno (static JS) | CONFIRMED_FROM_DOCS `docs/STATE.md:10-12` |
| GitHub Actions | Ausente | CONFIRMED_FROM_CODE |
| Railway config | Ausente | NOT_FOUND → DESIGNED_ONLY si aparece en planes externos; **no runtime** |
| Supabase config | Ausente | NOT_FOUND → **no runtime** |
| Deploy mechanism | GitHub → Vercel auto-deploy (docs) | CONFIRMED_FROM_DOCS |

**FRONTEND_HOSTING:** Vercel (docs) / static SPA  
**BACKEND_HOSTING:** Vercel serverless (solo Plus generate en repo)  
**DATABASE:** ninguna en runtime Mi Plan en este repo  
**DEPLOY_MECHANISM:** Git → Vercel (docs); UNCERTAIN detalles de project link

---

## 11. Clasificación arquitectónica AS-IS

| Componente | Clasificación | Razón concreta | Evidencia |
|------------|---------------|----------------|-----------|
| Encuesta / survey scoring | FRONTEND_OK | Cálculo puro en browser sin secreto | `js/survey.js` |
| Motor `calcularMotor` / FS / acciones / narrative / next_step | FRONTEND_OK | Determinístico client-side; sin secreto ni webhook | `js/algorithms.js`, `js/ui.js` |
| Provenance (flag off) | FRONTEND_OK | Explainability local opcional | `js/config.js:13-16` |
| Persistencia `cr_v3` / identity LS | FRONTEND_OK (hoy) | Solo browser; funciona AS-IS | `js/app.js:1074+` |
| UI Plan / dashboard | FRONTEND_OK | Rendering client | `js/ui.js` |
| Claude Plus provider call (API key) | **BACKEND_REQUIRED** | Requiere `CZ_CLAUDE_API_KEY` que no debe vivir en browser | `api/plus/generate.js:132-148`; flag browser off `js/config.js:480` |
| Shared secret proxy client | **BACKEND_REQUIRED** (problema AS-IS) | Secreto hoy en cliente; cualquier gate real debe ser server-side | `js/config.js:482`; `js/plusReport.js:413-418` |
| Handy webhook / payment verify | **BACKEND_REQUIRED** (cuando exista pago real) | Webhook/secretos de pago no pueden confiar en browser | Hoy STUB; razón al activar live |
| Equifax / Clearing credentials | **BACKEND_REQUIRED** (cuando se implemente) | Credenciales de bureau no en browser | Hoy DESIGNED_ONLY |
| CRM persistencia central | BACKEND_CANDIDATE | Deseable multi-device/ficha; no obligatorio para motor actual | stubs `js/crm.js`; docs PENDING |
| Mover motor a server | BACKEND_CANDIDATE | Docs lo listan; no hay secreto ni evidencia de necesidad obligatoria hoy | `docs/STATE.md:169` |
| ASSISTANT-01 production | **BACKEND_REQUIRED** (si se productiza LLM) | Misma razón: API secret + rate limit + no exponer key | Hoy DEV_ONLY |
| Analytics GTM | FRONTEND_OK | Tags client | `index.html` |
| PDF Plus client | FRONTEND_OK | Generación local | `js/plusReport.js` |

---

## 12. Diagrama AS-IS (solo conexiones demostradas)

```text
[Browser: index.html SPA]
   |
   +--> [localStorage: cr_v3, cz_anonymous_id, cz_crm_contact_id, cz_consent_v1, ...]
   |
   +--> [sessionStorage: cz_session_id, ...]
   |
   +--> [Deterministic motor in-browser]
   |       js/algorithms.js + js/survey.js + js/ui.js
   |       (financial_stage, acciones, next_step, narrative, optional provenance)
   |
   +--> [GTM / analytics tags]
   |
   +--> [OPTIONAL/TEST path] fetch POST /api/plus/generate
   |         header x-cz-plus-secret (from client config)
   |         body { report_type, context }
   |              |
   |              v
   |       [Vercel Function: api/plus/generate.js]
   |              |
   |              +--> [Anthropic API https://api.anthropic.com/v1/messages]
   |                     (CZ_CLAUDE_API_KEY from process.env)
   |
   +--> [OPTIONAL fallback OFF by default]
           fetch Anthropic direct from browser
           (only if CZ_PLUS_PROXY_ENABLED=false && CZ_CLAUDE_ALLOW_BROWSER_KEY=true)

[DESIGNED_ONLY / STUB — not live edges]
   - API.guardar / clearing / pago / ia (Credizona URLs, fetch commented or unused)
   - Handy checkout redirect (endpoint empty; payment live=false)
   - Equifax / live BCU-Clearing
   - /api/plus/email-report
   - CRM MySQL (docs only from this repo's perspective)

[DEV_ONLY — separate from product runtime]
   - dev/assistant-01/* Node harness (+ optional Anthropic via env)
```

---

## 13. Matriz final

| Componente | Estado actual | Dónde corre | Persistencia | Servicio externo | Clasificación | Razón | Evidencia |
|------------|---------------|-------------|--------------|------------------|---------------|-------|-----------|
| Encuesta | IMPLEMENTED | Browser | `cr_v3` / PRE | URL encuesta Credizona (entry) | FRONTEND_OK | Sin secreto | `js/survey.js`, `js/config.js:60` |
| Diagnóstico / motor | IMPLEMENTED | Browser | `cr_v3.diag` | — | FRONTEND_OK | Determinístico local | `js/algorithms.js:664+` |
| financial_stage | IMPLEMENTED | Browser | en `diag` | — | FRONTEND_OK | — | `js/algorithms.js:1442+` |
| Acciones | IMPLEMENTED | Browser | en `diag` | — | FRONTEND_OK | — | algorithms + taxonomy |
| next_step | IMPLEMENTED | Browser | UI / provenance opcional | — | FRONTEND_OK | — | `js/ui.js` |
| narrative | IMPLEMENTED | Browser | `narrative_decision` | — | FRONTEND_OK | — | algorithms |
| provenance | IMPLEMENTED flag off | Browser | en `diag` si on | — | FRONTEND_OK | — | `js/config.js:13-16` |
| Perfil / storage | IMPLEMENTED | Browser | `cr_v3` | — | FRONTEND_OK | Solo device | `js/app.js:1074+` |
| Identidad | IMPLEMENTED anónima | Browser | LS/SS | czuid CRM opcional | FRONTEND_OK | No auth | `js/identity.js` |
| Mi Plan Plus UI/precio | IMPLEMENTED | Browser | flags en `cr_v3` | — | FRONTEND_OK | Display | `js/config.js:474` |
| Plus pago Handy | STUB / off | Browser | grant local | Handy NOT_FOUND live | BACKEND_REQUIRED (futuro) | Secretos/webhook | `js/app.js:1000-1068` |
| Plus BCU/Clearing/Equifax | SIMULATED / DESIGNED | Browser mock | — | No live API | BACKEND_REQUIRED (futuro) | Credenciales | `js/config.js:470`, plusReport mock |
| Claude Plus | IMPLEMENTED proxy | Server + browser caller | informe en `cr_v3` | Anthropic | BACKEND_REQUIRED | API key | `api/plus/generate.js` |
| ASSISTANT-01 | DEV tooling | Node DEV | baselines files | Anthropic opcional DEV | READY_AS_DEV_TOOLING; prod NOT_IMPLEMENTED | — | `dev/assistant-01/` |
| Equifax | DESIGNED_ONLY | — | — | — | BACKEND_REQUIRED (futuro) | Credenciales | config comments |
| BCU/Clearing live | NOT live | — | — | — | BACKEND_REQUIRED (futuro) | Credenciales | flag false |
| Handy | STUB | Browser | — | — | BACKEND_REQUIRED (futuro) | Pago | endpoint empty |
| Backend `/api/plus/generate` | IMPLEMENTED code | Vercel FN | — | Anthropic | BACKEND_REQUIRED | Secrets | `api/plus/` |
| CRM APIs | DESIGNED_ONLY | — | — | Credizona URLs | BACKEND_CANDIDATE | Persistencia multi-device | `js/crm.js` |
| DB central | NOT_FOUND en repo | — | — | CRM MySQL docs | UNCERTAIN externo | — | `docs/STATE.md:22` |
| Supabase | NOT_FOUND | — | — | — | — | — | — |
| Railway | NOT_FOUND | — | — | — | — | — | — |

---

## 14. Respuestas explícitas

1. **¿Mi Plan es actualmente frontend-only?**  
   **PARTIAL.** Casi todo el producto (motor, UI, persistencia) es browser; existe **un** backend real en repo: proxy Claude Plus.

2. **¿Qué backend real existe hoy?**  
   `api/plus/generate.js` (+ `systemPrompt.js`) — Vercel serverless proxy a Anthropic. Deploy efectivo UNCERTAIN sin config Vercel en repo, pero el código y el caller existen.

3. **¿Existe base de datos central para Mi Plan?**  
   **NO** en este repo/runtime. Docs mencionan CRM MySQL externo — UNCERTAIN/out-of-repo; el cliente no persiste ahí (fetch comentado).

4. **¿Supabase conectado al runtime?**  
   **NO.**

5. **¿Railway conectado al runtime?**  
   **NO.**

6. **¿Qué datos solo en navegador?**  
   Perfil financiero (ingresos, gastos, deudas), `diag` completo, progreso, consent Mi Plan, estado Plus local, email declarado, flags vertical/seo_ia, identity anon/session/crm id local. Claves: `cr_v3` y resto §3.

7. **¿Identidad persistente de usuario autenticado?**  
   **NO.** Hay `anonymous_id` de dispositivo y `crm_contact_id` opcional por URL; sin autenticación.

8. **¿diagnosis_id persistente server-side?**  
   **NO.**

9. **¿Integraciones externas reales hoy?**  
   - Anthropic vía `/api/plus/generate` (path Plus/test).  
   - Analytics tags (GTM/GA/Meta) client-side.  
   - Assets/CDN Credizona.  
   - (Opcional) URL externa de encuesta como entry, no como motor.

10. **¿Solo diseñadas/stub?**  
    Equifax, BCU/Clearing live, Handy pago completo, CRM guardar/hydrate, email-report API, MiDeuda, APIs `API.clearing/pago/ia`, ASSISTANT-01 producción.

11. **¿Mi Plan Plus real, parcial o simulado?**  
    **Parcial:** UI/precio reales; pago off/simulado; bureau mock; Claude proxy real en código pero informe productivo post-compra incompleto; path test con `useTestInput`.

12. **¿Cómo se maneja Claude?**  
    Preferido: browser → `/api/plus/generate` → Anthropic con key en env server. Fallback browser directo existe pero **deshabilitado** por default. ASSISTANT-01 usa env Node por separado (DEV).

13. **¿API key que pueda llegar al navegador?**  
    - `CZ_CLAUDE_API_KEY`: **puede** si se configura en `config.js` y se habilita `CZ_CLAUDE_ALLOW_BROWSER_KEY` (hoy vacío/false).  
    - `CZ_PLUS_PROXY_CLIENT_SECRET`: **sí llega hoy** (hardcoded en cliente).

14. **¿BACKEND_REQUIRED inequívoco hoy?**  
    - Llamada Anthropic con API key (Plus).  
    - Cualquier gate de proxy que pretenda ser secreto (hoy filtrado al cliente).  
    - Futuro: pagos Handy, Equifax/Clearing credentials, ASSISTANT-01 productizado.

15. **¿FRONTEND_OK razonable?**  
    Motor determinístico, encuesta scoring, UI plan/acciones/next_step/narrative, provenance local, PDF client, analytics tags, persistencia local AS-IS.

16. **¿BACKEND_CANDIDATE no obligatorio?**  
    Persistencia CRM central, hydrate multi-device, mover `calcularMotor` al server (solo por preferencia docs/arquitectura, sin evidencia de secreto).

17. **¿Qué falta saber antes de BACKEND-ARCH-01?**  
    - ¿El proyecto Vercel de producción tiene env `CZ_CLAUDE_API_KEY` / `CZ_PLUS_PROXY_SECRET` y despliega `api/plus`?  
    - ¿Existe CRM MySQL vivo y contrato de `/api/reset/*` fuera de este repo?  
    - ¿Handy endpoint/contrato real y quién opera webhooks?  
    - ¿Equifax/Clearing: proveedor, sandboxes, retención legal?  
    - ¿Alcance de ASSISTANT-01 producción vs solo Plus report?  
    - Drift legal: `tyc.html` = TC_v2.1_202608 pero `LEGAL_VERSION_TC` en config sigue TC_v2.0_202605 (`js/config.js:451`).  
    - Requisitos multi-dispositivo / ficha maestra / SaaS white-label (docs) vs MVP.

---

## Notas de conflicto docs vs código

| Afirmación docs | Código | Clase |
|-----------------|--------|-------|
| PENDING “Mover LLM backend: /api/plus/generate” `docs/STATE.md:166` | El archivo **ya existe** y el frontend lo llama | Código manda: IMPLEMENTED; docs parcialmente stale |
| “npm: not used” | Playwright en package.json | DEV_ONLY dependency |
| CRM MySQL activo | Client send stubbed | UNCERTAIN fuera de repo |

---

BACKEND-ARCH-00: COMPLETE

FRONTEND_ONLY: PARTIAL

CENTRAL_DATABASE: NO

SUPABASE_RUNTIME: NO

RAILWAY_RUNTIME: NO

AUTHENTICATED_USER: NO

SERVER_SIDE_SESSION: NO

PERSISTENT_DIAGNOSIS_ID: NO

BACKEND_REQUIRED_COMPONENTS:
- Claude/Anthropic provider call (API key) — Plus proxy actual
- Proxy authorization secret (no debe vivir en browser; hoy sí)
- (Futuro al productizar) Handy webhooks / payment verification
- (Futuro al productizar) Equifax / Clearing credentials y proxies
- (Futuro al productizar) ASSISTANT-01 LLM path con secretos y rate limiting

BACKEND_CANDIDATE_COMPONENTS:
- Persistencia CRM / ficha maestra multi-device
- Hydration server-side del diagnóstico
- Mover `calcularMotor()` a server (sin evidencia de obligatoriedad AS-IS)
- Email Plus report API
- Consentimientos server-side (docs)

UNCERTAINTIES_BEFORE_ARCH_01:
- Confirmación de deploy/env Vercel reales para `api/plus/generate`
- Existencia y contrato del CRM MySQL / APIs Credizona fuera de este repo
- Diseño contractual Handy (checkout, webhook, ids)
- Roadmap Equifax/BCU/Clearing (datos, retención, legal)
- Alcance producto ASSISTANT-01 vs informe Plus
- Drift `LEGAL_VERSION_TC` vs `tyc.html` v2.1
- Requisitos no funcionales: multi-device, auth, SaaS multi-tenant
