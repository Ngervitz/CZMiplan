# HANDOFF-SECURITY-01 — Credizona rechazado → Mi Plan

**Tipo:** AUDIT + DESIGN ONLY (no implementación)  
**Fecha:** 2026-09-25  
**Repos auditados:**
- Credizona clone: `CZ CLON CPANEL 2026-08-27/public_html` (`solicitudesController.php`, `solicitudes.js`, templates, `Entities/*`, `apiController.php`, `Chukupax.php`, `Core/Users.php`)
- JANUS: `mie-backend` (`src/jobs/czFunnelSync.js`, `src/lib/rejectedSurveyInvite.js`, audits en `dev/backend-arch/`)
- Mi Plan: `CZMiplan` (`dev/backend-arch/JANUS-MIPLAN-*`, entry AS-IS)

```text
DATABASE_CHANGES_MADE: NO
PRODUCTION_CODE_CHANGED: NO
ENV_CHANGED: NO
RAILWAY_CHANGED: NO
SUPABASE_CHANGED: NO
```

**Leyenda:** `CONFIRMED` · `INFERRED` · `DESIGNED` · `NO CONFIRMADO` · `OPEN_HUMAN_DECISION`

---

## 1. Estado real auditado

### 1.1 Credizona — flujo encuesta rechazados

| Hecho | Evidencia | Tag |
|-------|-----------|-----|
| Entrada encuesta | `/solicitudes/sinoferta/lrw/{LRW}` y `?lrw=` | CONFIRMED — routing `Chukupax::proccessUrlFriendly` + `sinoferta()` |
| Submit | `POST /solicitudes/doEncuestaSinOferta` | CONFIRMED |
| Validación submit | items P1–P10 ∈ A–D, `lrw` presente, solicitud existe, encuesta no duplicada por `solicitudes_id` | CONFIRMED |
| AuthN en submit | **Ninguna** (no sesión, no CSRF, no captcha server-side) | CONFIRMED |
| Captcha | Invisible reCAPTCHA solo en browser (`grecaptcha.execute`); `doEncuestaSinOferta` **no** llama `gcaptcha::Validate*` | CONFIRMED |
| Respuesta OK | `Helpers::ApiResponseOk()` → `{ ok:true, msg:"", data:[], action:"" }` (data vacío por default) | CONFIRMED |
| Tras success (HTML actual) | `data-callback="EncuestaSend"` → redirect a `/solicitudes/encuesta_gracias` | CONFIRMED |
| Pantalla gracias | Sin LRW, leadId, uuid ni CTA | CONFIRMED — `solicitudes.encuesta_gracias.html` |
| CTA Mi Plan | **No existe** | CONFIRMED |
| `EncuestaSinOfertaSend` | Existe en JS (iría a `encuesta_sinoferta_gracias`) pero **no** está cableado en el HTML sinoferta | CONFIRMED |
| `encuesta_sinoferta_gracias` | **Sin** método controller / template en clone | CONFIRMED |

### 1.2 Identificadores en browser durante encuesta

| ID | ¿En browser? | Dónde | Tag |
|----|--------------|-------|-----|
| LRW | **Sí** | URL path/query + `<input name="lrw">` + `eventId` | CONFIRMED |
| `leadId` (= `usuarios.uniq`) | **Sí** | `<input name="leadId" value="{leadId}">` render server | CONFIRMED |
| CI | **No** en HTML encuesta | Solo server-side vía solicitud→usuario | CONFIRMED |
| `solicitudes.uuid` (DB Uuid7) | **No** en flujo sinoferta/encuesta | Existe en DB/API; no parseado al template sinoferta | CONFIRMED |
| Client `uuid` de formulario solicitud | Otro valor | `generateUUID()` / tracking JT; **≠** `solicitudes.uuid` | CONFIRMED |
| Opaque handoff token | **No** | No emitido en submit ni templates | CONFIRMED |

### 1.3 Cookies / sesión / CSRF

| Mecanismo | Rol en handoff encuesta | Tag |
|-----------|-------------------------|-----|
| PHP session + cookie login (`Core/Users.php`) | Login front/admin por `uniq`; **no** se establece en creación de solicitud/encuesta | CONFIRMED |
| Auto-login post-solicitud | `Clientes::nuevo` crea hash/uniq pero **no** llama login | CONFIRMED |
| CSRF token en formularios públicos solicitud/encuesta | **No encontrado** | CONFIRMED |
| Origin/Referer/CORS como auth | **Prohibido** por brief; además no hay chequeo útil como credential | DESIGNED |

### 1.4 JANUS

| Capacidad | Estado | Tag |
|-----------|--------|-----|
| Sync solicitudes (`GET /solicitudes`) incl. `lrw_id`, CI, contacto, salario, DOB, laboral, `uuid` en payload | Existe; `uuid` **AVAILABLE_UNUSED** (no persistido en foco actual) | CONFIRMED — DATA-GAP |
| Sync encuestas (`GET /encuestas`) → `cz_funnel_encuestas` con P1–P10 | Persistido en prod JANUS | CONFIRMED — sync + audits |
| Lookup episodio por LRW en DB | Posible (`WHERE lrw_id = ?`); ops Rechazados hoy trabajan por CI | CONFIRMED |
| Completion encuesta lifetime por CI | Gate invite / selección survey | CONFIRMED |
| `entry_token` / `POST …/entry/redeem` / `resolve-context` Mi Plan | **Diseñados**, **no implementados** en `src/` | CONFIRMED |
| Intervalo exacto cron sync | **NO CONFIRMADO** en repo | NO CONFIRMADO |
| Clone `getEncuestasInfo` vs prod | Clone SELECT solo `id,ci,email,score_v2,completed_at` (sin p1–p10); prod JANUS sí tiene p1–p10 | CONFIRMED clone gap; prod vía JANUS |

### 1.5 Mi Plan

| Capacidad | Estado | Tag |
|-----------|--------|-----|
| Prefill productivo Credizona/JANUS S2S | **No** | CONFIRMED — INTEGRATION audit |
| Entry actual | URL params / SEO / localStorage; bridge histórico con PII en QS | CONFIRMED |
| Cliente JANUS / redeem | Ausente | CONFIRMED |

---

## 2. Flujo actual (AS-IS)

```text
Credizona solicitud
  → rechazo (CDV status ≠ accepted)
  → redirect browser: /solicitudes/sinoferta/lrw/{LRW}
       (LRW = response.id de autorizar / CDV)
  → HTML encuesta: hidden lrw + leadId(uniq)
  → POST doEncuestaSinOferta {lrw, item-1..10, acepto, g-recaptcha-response?}
  → insert encuestas + con_encuesta_c=1
  → JSON {ok, data:[]}
  → JS: dataLayer encuesta_* + redirect /solicitudes/encuesta_gracias
  → gracias: sin identificadores, sin CTA

Paralelo (ya existente, no handoff inmediato):
  Credizona API → JANUS sync solicitudes/encuestas
  JANUS S1/S2/S3 busca completion lifetime por CI
```

**Producto deseado (no implementado):** tras encuesta → CTA “Continuar a Mi Plan” → Mi Plan precargado sin re-CI / sin OTP / sin re-P1–P10; PII no en URL; contexto vía Mi Plan BE → JANUS S2S.

---

## 3. Identificadores / capabilities encontrados

1. **LRW** (`lrw_id`) — ID de operación CDV / episodio solicitud.  
2. **leadId / `usuarios.uniq`** — `uniqid(date('YmdHis'), true)`.  
3. **`solicitudes.uuid`** — Ramsey Uuid7 al crear solicitud.  
4. **Client form UUID** — UUID v4/random para `trackJanus` (no DB).  
5. **Cookie/sesión login** — solo usuarios logueados; no flujo rechazo.  
6. **reCAPTCHA response** — anti-bot client; no bearer cross-app.  
7. **JT** — tracking JANUS si viene en URL solicitud; no auth handoff.  
8. **Completion flag** — `encuestas` row / `con_encuesta_c` / JANUS `cz_funnel_encuestas`.  
9. **Timestamps** — `fechahora` encuesta, `synced_at` JANUS.  
10. **Opaque handoff** — **no existe**.

---

## 4. Tabla por identificador

| ID | Browser | JANUS | Entropía | Secreto? | Replayable | Reference | Authorization |
|----|---------|-------|----------|----------|------------|-----------|---------------|
| **LRW** | Sí (URL+hidden) | Sí (`lrw_id`) | Media/baja aparente (`LRW-###-###-###`); bits exactos **NO CONFIRMADO** | **No** — ID de episodio público en URLs/invites | Sí (estable) | **Sí** (episodio) | **No** |
| **leadId / uniq** | Sí (hidden) | **No** como key de auth/sync persona (CI es spine) | Baja (`uniqid` + timestamp) | **No** | Sí | Débil (persona CZ) | **No** |
| **solicitudes.uuid** | **No** en encuesta | En payload API; persistencia JANUS **UNUSED** | Alta (Uuid7) | No por diseño; “secreto por oscuridad” solo si nunca se filtra | Sí hasta rotación | Sí (solicitud) | **No automáticamente** — bearer-by-knowledge si se expone; hoy **no transportable** sin cambio CZ |
| **Client form uuid** | Sí (solicitud) | JT tracking opcional | Alta | No | Sí | Tracking | **No** |
| **Login cookie/session** | Solo si login | N/A | Depende | Session credential en dominio CZ | Session TTL | Sesión CZ | **No** para Mi Plan cross-domain |
| **reCAPTCHA token** | Transient | No | N/A | No cross-app | One-shot Google | Bot check | **No** |
| **Encuesta completed** | Inferible (UI oculta form) | Sí (fila/CI) | N/A | No | Estado | Completion | **No** solo |
| **Handoff opaco** | No existe | No existe | — | — | — | — | — |

**Regla aplicada:** conocer LRW + saber que la encuesta está completed **no** demuestra que el presentador sea el usuario del episodio.

---

## 5. Trust boundaries

```text
[1] Browser Credizona
      confía en: UI local; posee LRW/leadId como referencias no verificadas
      NO es autoridad de PII hacia Mi Plan

[2] Mi Plan frontend
      confía en: solo journey/session propios de Mi Plan
      cualquier query/ref del browser = UNTRUSTED hasta [3]/[4]

[3] Mi Plan backend
      confía en: autenticación S2S hacia JANUS (secret/mTLS — DESIGNED, no live)
      NUNCA debe pedir PII a Credizona directo (regla de producto)

[4] JANUS
      confía en: datos ya sincronizados Credizona (+ BCU propios)
      es la autoridad de contexto externo allowlisted

[5] Credizona (origen)
      autoridad de verdad del episodio/encuesta
      hoy no emite capability de handoff a Mi Plan
```

| Punto donde nace confianza para devolver PII | Hoy | Necesario |
|----------------------------------------------|-----|-----------|
| Browser presenta LRW | Insuficiente | — |
| Browser presenta leadId/uuid | Insuficiente / uuid no disponible | — |
| JANUS verifica completion | Insuficiente (estado ≠ auth browser) | Complemento |
| Capability one-time emitida post-completion + redeem S2S | **Ausente** | **Requerido** para full prefill sin re-ID |

---

## 6. Ataques concretos posibles

| Ataque | Con LRW-as-auth (hipotético) | Con estado actual + CTA `?lrw=` + PII S2S |
|--------|------------------------------|------------------------------------------|
| **IDOR** | Quien conoce/obtiene LRW pide contexto de otro episodio | Mismo riesgo si JANUS autoriza por LRW solo |
| **Enumeration** | Formato estructurado LRW → intento de brute | Rate-limit mitiga, **no** convierte LRW en secret |
| **Link sharing** | Link con LRW compartido → tercero obtiene PII | Sí |
| **Replay** | LRW no expira | Sí ilimitado |
| **Episode swapping** | Atacante cambia LRW en CTA | Sí |
| **PII leakage** | URL logs/referrers si PII en QS; o response JANUS sin auth fuerte | Sí |
| **Submit encuesta ajena** | Hoy: POST con LRW ajeno sin auth (hasta 1 encuesta/solicitud) | CONFIRMED pre-existente (fuera de scope fix, relevante como amenaza) |

**Mitigaciones que NO alcanzan:** TTL solo, rate-limit solo, “LRW difícil”, Origin/Referer, “encuesta completed”.

---

## 7. Evaluación frontend-only

### 7.1 Full prefill seguro sin backend Credizona

**NO es viable.**

No hay capability en el browser que JANUS pueda validar como “este browser acaba de completar este episodio” con fuerza suficiente para entregar CI/celular/email/nombre/salario/P1–P10.

Exponer `solicitudes.uuid` en el template sería cambio Credizona (render) y aún así UUID estable = bearer permanente (link sharing/replay), no one-time.

### 7.2 Opción degradada: LRW solo como reference

| Aspecto | Evaluación |
|---------|------------|
| Qué sí | Marcar `funnel=credizona_rejected`, deep-link de producto, analytics de episodio, arrancar journey Mi Plan “desde rechazo” |
| Qué **no** devolver S2S solo por LRW | CI, nombre, apellido, email, celular, DOB, salario, P1–P10, BCU, cualquier PII |
| Prefill seguro automático | **Ninguno sensible** |
| Sentido de producto | **Débil** vs brief (“precargada”, “NO CI”, “NO OTP”, “NO repetir P1–P10”). Cumple solo un CTA cosmético o un onboarding que **sigue pidiendo identidad o encuesta** |
| ¿Falsa seguridad? | Tratar LRW+completed como auth sería **inaceptable** |

**Veredicto degradada:** técnicamente posible como reference; **no** cumple el outcome de producto del handoff seguro con prefill. No recomendar como “solución segura”.

---

## 8. Evaluación full prefill

| Requisito producto | ¿Front-only? | ¿Con capability opaca? |
|--------------------|--------------|------------------------|
| Sin re-ingresar CI | No (sin auth) | Sí |
| Sin OTP | No (sin auth) | Sí (si capability fuerte) |
| Sin re-P1–P10 | No seguro | Sí (si sync/pull + redeem) |
| Sin PII en URL | Posible link estático; prefill no | Sí (`/e/{handoff}` opaco) |
| Contexto vía JANUS S2S | N/A | Sí (diseño ya en CONTRACT-01) |

**Bloqueador:** ausencia de capability de autorización browser→JANUS en el momento del CTA.

**Bloqueador secundario:** sync lag encuesta → al click inmediato JANUS puede no tener P1–P10 aún (**NO CONFIRMADO** el SLA; riesgo **INFERRED**). Mitigación DESIGNED: redeem con pull on-demand del episodio vía API Bearer existente Credizona (no “nuevo feed” de producto; fetch puntual).

---

## 9. Cambio mínimo Credizona (si full prefill)

Preferencia auditada: **sí, se requiere intervención backend mínima en Credizona** para full prefill sin re-identificación.

### 9.1 Mecanismo recomendado (mínimo)

**`handoff_code` opaco** emitido **solo** tras `doEncuestaSinOferta` exitoso.

| Propiedad | Valor |
|-----------|-------|
| Generación | `random_bytes(32)` (o ≥128 bit) → token URL-safe |
| Contenido | **Sin PII**; no embeber CI/LRW en claro si se puede evitar |
| Bind | `solicitudes_id` / `lrw_id` + `encuestas_id` |
| TTL | Corto (DESIGNED sugerido 5–15 min) — **OPEN** exacto |
| One-time | `consumed_at` en almacén CZ **o** `jti` consumido en JANUS |
| Entrega al browser | Campo en `data` del JSON de success (no hace falta página gracias) |
| CTA | `https://miplan…/e/{handoff_code}` (solo el código) |

### 9.2 Cómo valida JANUS **sin** nuevo feed continuo Credizona→JANUS

Orden de preferencia (**DESIGNED**):

1. **HMAC/JWT firmado por Credizona** con secreto compartido CZ↔JANUS (`jti|lrw|exp|encuesta_id`), JANUS verifica firma + TTL + one-time `jti` + que el episodio/encuesta exista (sync o pull).  
   - No requiere sync del código antes del click.  
   - No es un “nuevo feed” de datos; es secreto ops + ~10–20 líneas en submit.

2. **Tabla one-time en Credizona + endpoint redeem Bearer** que JANUS ya sabe autenticar (mismo patrón API). Mi Plan → JANUS → CZ redeem.  
   - Extiende API CZ; no es feed incremental nuevo.

3. **Sync del hash vía `/encuestas` ampliado** — peor para CTA inmediato (carrera con cron).

**Evitar:** Credizona llamando a JANUS en el submit para pedir token (nueva integración activa CZ→JANUS).

### 9.3 Qué NO hace falta

- SMS/WhatsApp/email para este handoff.  
- Nueva integración de datos Credizona→JANUS más allá de sync/API ya usados.  
- Refactors de encuesta, scoring, o S1/S2/S3.

### 9.4 Frontend Credizona (tras backend mínimo)

- Usar respuesta AJAX `data.handoff_code`.  
- Mostrar CTA o redirect a Mi Plan **en success handler** (antes/en lugar de gracias vacía).  
- No poner CI/PII en URL.

---

## 10. Punto recomendado para CTA

| Opción | Simplicidad | Seguridad | UX | Cambios CZ |
|--------|-------------|-----------|-----|------------|
| **A. CTA inmediato post-AJAX success** (antes del redirect a gracias) | Alta | Depende del token en `data` (no de la página) | Mejor: un paso menos | JS (+ backend si hay code) |
| **B. Conservar ref hasta `encuesta_gracias`** | Media | Si solo LRW en QS → inseguro para PII; si handoff en QS corto TTL → ok | Extra pantalla | JS + opcional template gracias |
| **C. Gracias server-rendered con ref** | Baja | Requiere session/cookie o query; cookie no cruza a Mi Plan | Ok | Controller + template |

**Recomendación:** **A** — el success del POST es el único momento AS-IS donde el browser “acaba de completar” y aún tiene LRW/leadId en memoria; con `handoff_code` en la respuesta, A es el cableado mínimo.  
`encuesta_gracias` actual es un callejón sin identificadores; no usarla como ancla salvo que se le pase explícitamente el code.

Nota AS-IS: el HTML sinoferta llama `EncuestaSend` (gracias genérica), no `EncuestaSinOfertaSend`. Cualquier CTA debe engancharse al callback real en uso.

---

## 11. Secuencia exacta propuesta (post-decisión; no implementar aún)

```text
1. Usuario completa P1–P10 en Credizona (LRW en form).
2. POST doEncuestaSinOferta → OK.
3. Credizona (mínimo backend): crea handoff_code (one-time, TTL, bind episodio).
4. Response JSON incluye { handoff_code } (sin PII).
5. Browser muestra CTA / navega a Mi Plan /e/{handoff_code}.
6. Mi Plan FE envía code a Mi Plan BE (no interpreta PII).
7. Mi Plan BE → JANUS S2S redeem(handoff_code).
8. JANUS: valida capability + carga episodio/encuesta (sync o pull) + allowlist.
9. Mi Plan aplica prefill con provenance; pide deudas/gastos (+ T&C) sin re-encuesta.
10. Si no click CTA: fuera de S1/S2/S3 (regla producto); stages futuros OUT OF SCOPE.
```

Trust se establece en el **paso 8 (JANUS redeem)**, no en el click del browser.

---

## 12. Datos que JANUS podría devolver (tras redeem válido)

Allowlist alineada a CONTRACT / DATA-GAP (**solo si authorization OK**):

| Incluir si existe | No inventar / no hay fuente confirmada |
|-------------------|----------------------------------------|
| CI, nombre, apellido, email, celular | `monto_solicitado` |
| `fecha_nacimiento`, `relacion_laboral`, `salario` | `motivo_rechazo` |
| `external_ref` = LRW | |
| P1–P10 (+ `completed_at`, rule `lifetime_ci`) | |
| BCU subset ya en JANUS | |
| `funnel=credizona_rejected`, provenance | |

Mi Plan **sigue** necesitando deudas/gastos (ENTRY audits) — no bloquea esta decisión de handoff.

---

## 13. Decisión final

### Pregunta central

> ¿Existe HOY, sin modificar backend Credizona, una prueba/capability suficientemente fuerte para el CTA que Mi Plan/JANUS pueda validar y así entregar PII del episodio?

### Respuesta

**NO.**

No hay cookie/sesión de encuesta, no hay CSRF capability reutilizable, no hay token en la respuesta de `doEncuestaSinOferta`, `leadId` es débil y público en HTML, LRW es reference pública (también en invites JANUS), y `solicitudes.uuid` no está en el browser del flujo rechazado.

### Implicaciones

| Camino | Veredicto |
|--------|-----------|
| Frontend-only + full prefill PII | **Inseguro / no** |
| Frontend-only + LRW reference sin PII | Seguro como reference; **no** cumple producto de prefill |
| Full prefill sin CI/OTP | **Requiere cambio mínimo backend Credizona** (`handoff_code`) + redeem JANUS (ya diseñado conceptualmente) + cliente Mi Plan |
| Nuevo feed CZ→JANUS de negocio | **No requerido** si se usa firma/redeem puntual sobre API existente |

### Recomendación técnica concreta

Adoptar **handoff_code opaco one-time TTL** emitido en `doEncuestaSinOferta`, CTA en **success AJAX (opción A)**, validación en **JANUS redeem S2S**, sin PII en URL y sin OTP/CI en el camino feliz.

No implementar hasta revisión humana de este documento.

---

## OPEN_HUMAN_DECISIONS

1. TTL exacto del handoff (5 vs 15 vs 30 min).  
2. Firma HMAC compartida vs endpoint redeem en Credizona.  
3. Si sync lag → ¿spinner + retry o pull on-demand en redeem?  
4. ¿Aceptar flujo degradado (CTA sin prefill) mientras llega IT Credizona?  
5. Alcance exacto allowlist BCU en V1 del handoff.

---

```text
HANDOFF_SECURITY_01_STATUS: COMPLETE_AUDIT_NO_IMPL
CURRENT_SAFE_CAPABILITY_FOUND: NO
LRW_REFERENCE_USABLE: YES
LRW_AUTHORIZATION_USABLE: NO
LEADID_AUTHORIZATION_USABLE: NO
UUID_AUTHORIZATION_USABLE: NO
EXISTING_COOKIE_OR_SESSION_USABLE: NO
FRONTEND_ONLY_FULL_PREFILL_SAFE: NO
FRONTEND_ONLY_LIMITED_FLOW_SAFE: YES_AS_REFERENCE_ONLY_NO_PII_PREFILL
CREDIZONA_BACKEND_CHANGE_REQUIRED_FOR_FULL_PREFILL: YES
MINIMUM_CREDIZONA_CHANGE: OPAQUE_HANDOFF_CODE_ON_ENCUESTA_SUCCESS_PLUS_RETURN_IN_JSON
CTA_RECOMMENDED_LOCATION: POST_AJAX_SUCCESS_BEFORE_OR_INSTEAD_OF_ENCUESTA_GRACIAS
USER_REIDENTIFICATION_REQUIRED: YES_IF_NO_HANDOFF_CODE__NO_IF_HANDOFF_CODE
OTP_REQUIRED: NO_FOR_HANDOFF_CODE_PATH__LIKELY_YES_FOR_IDENTITY_FALLBACK
PII_IN_URL_REQUIRED: NO
NEW_CZ_TO_JANUS_FEED_REQUIRED: NO
JANUS_CAN_RESOLVE_EPISODE: YES_BY_LRW_OR_CI_WHEN_SYNCED
JANUS_CAN_VERIFY_BROWSER_AUTHORIZATION: NO_TODAY__YES_WITH_HANDOFF_REDEEM
RECOMMENDED_HANDOFF_MECHANISM: CREDIZONA_OPAQUE_HANDOFF_CODE_THEN_MIPLAN_BE_TO_JANUS_REDEEM
SECURITY_BLOCKERS: NO_EXISTING_BROWSER_AUTH_CAPABILITY;_LRW_PUBLIC_REFERENCE;_EMPTY_SUBMIT_RESPONSE;_GRACIAS_DROPS_IDS;_JANUS_REDEEM_NOT_IMPLEMENTED
OPEN_HUMAN_DECISIONS: TTL;_HMAC_VS_CZ_REDEEM_ENDPOINT;_SYNC_LAG_STRATEGY;_DEGRADED_CTA_WHILE_WAITING_IT;_BCU_ALLOWLIST_V1
READY_FOR_IMPLEMENTATION: NO
```
