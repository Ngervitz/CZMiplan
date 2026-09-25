# HANDOFF-CODE-ARCH-01 — Auditoría A vs B (generación segura de `handoff_code`)

**Tipo:** AUDIT + DESIGN ONLY (no implementación)  
**Fecha:** 2026-09-25  
**Depende de:** `CZMiplan/dev/backend-arch/HANDOFF-SECURITY-01.md` (conclusiones reutilizadas; no reabiertas salvo evidencia nueva)

**Repos auditados:**
- Credizona clone: `CZ CLON CPANEL 2026-08-27/public_html`
- JANUS: `mie-backend`
- Mi Plan: `CZMiplan`

```text
DATABASE_CHANGES_MADE: NO
PRODUCTION_CODE_CHANGED: NO
ENV_CHANGED: NO
RAILWAY_CHANGED: NO
SUPABASE_CHANGED: NO
HANDOFF_SECURITY_01_MODIFIED: NO
```

**Leyenda:** `CONFIRMADO` · `INFERIDO` · `NO CONFIRMADO` · `DESIGNED` · `OPEN_HUMAN_DECISION`

---

## 0. Pregunta y veredicto ejecutivo

| Pregunta | Respuesta |
|----------|-----------|
| ¿Opción B (browser Credizona → JANUS “dame handoff para LRW X”) es segura para full prefill? | **NO** |
| ¿Existe capability actual que corte el ataque “conozco LRW ajeno → obtengo handoff”? | **NO** |
| ¿Se requiere Opción A (Credizona backend participa en la emisión)? | **SÍ** |
| Variante A recomendada | **A3** (CZ S2S autenticado pide emisión a JANUS tras completion) |

---

## 1. LRW en profundidad

### 1.1 Origen y generación

| Hecho | Evidencia | Tag |
|-------|-----------|-----|
| Credizona **no** genera el LRW localmente | `Creditovalor::Autorizar` → `POST /leads/raw/`; el `id` vuelve en la respuesta CDV | CONFIRMADO — `Creditovalor/Creditovalor.php`, `Entities/Solicitudes.php::updateAutorizacionResponse` |
| Persistencia | `solicitudes.lrw_id = response['id']` | CONFIRMADO |
| Uso posterior | `Confirmar` llama `/leads/raw/{LRW}/confirm/` | CONFIRMADO |
| Algoritmo/entropía CDV | Código fuente CDV **no** está en estos repos | **NO CONFIRMADO** |

### 1.2 Formato observado

| Aspecto | Valor | Tag |
|---------|-------|-----|
| Prefijo | `LRW-` en ejemplos reales/fixtures | CONFIRMADO — clone test `LRW-570-332-235`; JANUS fixtures `LRW-111-222-333`, `LRW-1`, `LRW-ABC` |
| Patrón frecuente | `LRW` + grupos separados por `-` (a menudo numéricos de 3 dígitos) | INFERIDO |
| Charset estricto | **No** validado en JANUS: `isValidLrwId` = “string no vacío” | CONFIRMADO — `rejectedSurveyInvite.js` |
| Longitud fija | **No** enforced | CONFIRMADO |
| Secuencialidad | Posible componente estructurado; no demostrable como contador global | NO CONFIRMADO / INFERIDO riesgo |

**Ejemplos en código (sin PII de personas):** `LRW-570-332-235` (clone test), `LRW-111-222-333` (unit tests). No se listan LRW de producción en este documento.

### 1.3 Entropía / enumeration

| Pregunta | Respuesta | Tag |
|----------|-----------|-----|
| ¿Hay random criptográfico demostrado en estos repos? | **No** — nace fuera (CDV) | CONFIRMADO |
| ¿Entropía estimable con rigor? | **No** sin especificación CDV | NO CONFIRMADO |
| ¿Si el patrón productivo fuera `LRW-NNN-NNN-NNN` (dígitos)? | ~10⁹ combinaciones (~30 bit) → **enumerable** con bot | INFERIDO (hipótesis de formato) |
| ¿JANUS trata LRW como secreto? | **No** — solo “non-empty” | CONFIRMADO |

**Conclusión:** aunque “parezca difícil de adivinar”, **LRW no es credencial de autorización**.

### 1.4 Dónde aparece LRW (exposición)

| Lugar | ¿Expone LRW? | Evidencia | Tag |
|-------|--------------|-----------|-----|
| URL encuesta | Sí | `/solicitudes/sinoferta/lrw/{LRW}`, `?lrw=` | CONFIRMADO |
| Hidden form | Sí | `solicitudes.sinoferta.html` `name="lrw"` / `eventId` | CONFIRMADO |
| Redirect post-rechazo | Sí | `solicitudes.js` → `sinoferta/lrw/` + `data.data.id` | CONFIRMADO |
| API sync JANUS | Sí | `GET /solicitudes` → `lrw_id` | CONFIRMADO |
| Email invites S1/S2/S3 | Sí (destino) | `buildSurveyUrl` → `sinoferta?lrw=`; `destinationUrl: realSurveyUrl`; template muestra URL trackeada cuyo destino final es esa URL | CONFIRMADO — `rejectedSurveyInvite.js`, `rejectedSurveyInviteMaterialize.js` |
| Browser history / logs proxy | Sí (URLs) | implícito al estar en path/query | INFERIDO |
| SMS | Destino puede contener LRW si short-link apunta a survey URL | Short links + dest survey | INFERIDO / parcialmente CONFIRMADO arquitectura |
| Dashboard JANUS | Sí | UI muestra `lrw_id` | CONFIRMADO — `mie-dashboard.js` |
| Frontend Mi Plan hoy | No como auth productivo | Ausente | CONFIRMADO |

### 1.5 ¿Un atacante puede obtener/adivinar/reutilizar LRWs ajenos?

| Vector | Viable? | Tag |
|--------|---------|-----|
| Leer LRW de URL propia / shared link / history | Sí | CONFIRMADO (mecanismo) |
| Recibir invite email/SMS de víctima (o filtración) | Sí | CONFIRMADO (LRW en destino survey) |
| Enumerar espacio estructurado | Posible si formato débil | INFERIDO |
| Reutilizar LRW estable en el tiempo | Sí — no rota | CONFIRMADO |
| Usar LRW para abrir encuesta (si no completada) o para IDOR hipotético | Hoy submit encuesta **sin auth** | CONFIRMADO — `doEncuestaSinOferta` |

**Respuesta explícita:** **Sí**, un atacante puede obtener o reutilizar LRWs de otras personas por canales normales del producto (URLs, invites, sharing). Adivinar depende del generador CDV (**NO CONFIRMADO**), pero **no importa**: la exposición ya invalida LRW como authorization.

---

## 2. Búsqueda de capability existente

Pregunta: ¿hay algo que demuestre *“este browser acaba de completar ESTE episodio”* y que JANUS pueda verificar?

### 2.1 Candidatos

| Candidato | Genera | Vive | Browser | Valida CZ | Conoce JANUS | Valida JANUS solo | ↔ LRW | ↔ completion | ↔ sesión browser | Secreto? | Replay | Expira | Auth? |
|-----------|--------|------|---------|-----------|--------------|-------------------|-------|--------------|------------------|----------|--------|--------|-------|
| LRW | CDV | DB+URL | YES | YES (lookup) | YES | YES (lookup) | YES | NO | NO | NO | YES | NO | **NO** — solo reference |
| leadId / `usuarios.uniq` | CZ `uniqid` | DB+hidden | YES | YES | NO como auth | NO | vía persona | NO | NO | NO (débil) | YES | NO | **NO** |
| `solicitudes.uuid` | CZ Uuid7 | DB+API | **NO** en encuesta | YES | payload API; persist **UNUSED** | NO como browser proof | YES | NO | NO | no por diseño | YES | NO | **NO** (no transportable hoy) |
| Client form UUID | Browser | JT track | YES | N/A | tracking opcional | NO | NO | NO | débil | NO | YES | NO | **NO** |
| Login cookie/session | CZ Users | cookie CZ | solo si login | YES | NO | NO | NO | NO | YES (login) | session | TTL session | **NO** cross-domain Mi Plan / no se setea en encuesta |
| CSRF | — | — | — | — | — | — | — | — | — | — | — | — | **No existe** en flujo público |
| reCAPTCHA token | Google | POST | transient | **NO** en `doEncuestaSinOferta` | NO | NO | NO | NO | NO | N/A | one-shot Google | corto | **NO** |
| JT | JANUS marketing | URL solicitud | a veces | N/A | YES | attribution | NO | NO | NO | NO | YES | NO | **NO** |
| Completion encuesta | CZ write | DB; sync JANUS | inferible UI | YES | YES (fila CI) | estado ≠ possession | indirect | YES | NO | NO | estado | N/A | **NO** solo |
| HMAC CZ→JANUS tracking | CZ backend | headers S2S | **NO** | emite | YES (`CZ_TRACKING_HMAC_SECRET`) | YES en `/tracking/events` | NO | NO | NO | YES (server) | ventana ±300s | 300s | Auth **S2S**, no browser |
| Opaque handoff | — | — | — | — | — | — | — | — | — | — | — | — | **No existe** |

### 2.2 Conclusión capability

```text
EXISTING_BROWSER_CAPABILITY_FOUND: NO
```

No hay prueba browser-side verificable por JANUS de posesión del flujo de completion.  
La única autoridad nueva usable es **Credizona backend en el momento de escribir la encuesta** (conoce LRW → solicitud → usuario/CI → insert exitoso).

---

## 3. Ataque obligatorio contra Opción B

### 3.1 Cadena

1. Atacante obtiene LRW ajeno (URL, invite, leak, enumeration).  
2. Llama `JANUS: emit handoff for LRW X` desde un browser cualquiera (o curl).  
3. JANUS verifica: LRW existe, rechazo, P1–P10 completed.  
4. Emite `handoff_code`.  
5. Atacante abre Mi Plan con ese code.  
6. Redeem → PII/contexto de la víctima.

### 3.2 ¿Qué corta la cadena HOY?

| Defensa propuesta | ¿Corta? | Motivo |
|-------------------|---------|--------|
| CORS / Origin / Referer | **NO** | No son credenciales; spoofeables / irrelevantes server-to-server |
| UA / IP | **NO** | Compartidos, proxies, no bind episodio |
| “LRW completed” | **NO** | Es el **input** del ataque tras encuesta legítima o forzada |
| Timestamp cercano | **NO** | Atacante espera sync y llama igual |
| TTL / rate limit / ocultar URL | **NO** | Complementos; no possession proof |
| “LRW difícil” | **NO** | Ya expuesto en producto |

**Resultado:** la cadena **no se corta**.  

```text
OPTION_B_SECURE: NO
OPTION_B_DECISION: B_DESCARTADA
ATTACK_LRW_TO_HANDOFF_BLOCKED: NO
```

---

## 4. Rate limiting / enumeration (complementario, no auth)

Aplicable a **cualquier** surface `reference → handoff` (si existiera B) y a `handoff → context` (redeem):

| Control | Rol |
|---------|-----|
| Rate limit por IP | Anti-abuso |
| Rate limit por reference/code | Anti-spray |
| Respuestas indistinguibles invalid/expired/consumed | Anti-oracle |
| One-time redeem + TTL | Anti-replay |
| Logging sin plaintext token | Forense |
| Alertas por bursts | Ops |

```text
RATE_LIMITING_REQUIRED: YES (complemento)
ENUMERATION_PROTECTION_REQUIRED: YES (complemento)
```

**Principio:** rate limiting **no** convierte LRW en authorization.

---

## 5. Opción A — `doEncuestaSinOferta` como ancla

### 5.1 ¿El backend ya conoce lo suficiente?

Tras validaciones actuales (`solicitudesController::doEncuestaSinOferta`):

| Dato | Disponible en ese request | Tag |
|------|---------------------------|-----|
| LRW | `$_POST['lrw']` + `getByLrw` | CONFIRMADO |
| Solicitud / `solicitudes_id` | `$Solicitud` | CONFIRMADO |
| `usuarios_id` | en solicitud | CONFIRMADO |
| CI | vía `Clientes->get(usuarios_id)` (no usado hoy en el método, pero alcanzable) | CONFIRMADO capacidad |
| Encuesta creada | `Encuesta::crear` + `encuestas_id` | CONFIRMADO |
| Completion exitoso | solo si llega a `ApiResponseOk()` | CONFIRMADO |
| Auth del browser | **No** — cualquiera con LRW puede POSTear | CONFIRMADO |

**Propiedad de seguridad alcanzable (realista):**

> “El **servidor Credizona** acaba de persistir con éxito la encuesta de **este** episodio; la capability se emite **en ese mismo control flow**.”

Eso **no** es prueba criptográfica de un browser humano único, pero **sí** liga emisión al acto de completion en el origen de verdad — suficiente para romper el ataque B (JANUS ya no emite solo por LRW público).

Límite residual (preexistente): atacante que **completa** la encuesta ajena antes que la víctima recibe el handoff. Mitigar eso es otro problema (auth en encuesta); fuera del mínimo de este handoff.

### 5.2 Variantes A

| | A1 Persist CZ | A2 Assertion firmada | A3 CZ→JANUS emit S2S |
|--|---------------|----------------------|----------------------|
| **Idea** | CZ genera random, guarda hash, lo devuelve | CZ firma `jti|lrw|exp|purpose` (o blob), browser lleva blob | Tras OK, CZ llama JANUS autenticado “emit for LRW”; JANUS crea code; CZ lo reenvía |
| **Cambios CZ** | Tabla tokens + mint en `doEncuestaSinOferta` + FE | Mint/sign en mismo método + FE; secret compartido | ~llamar `JanusComm` post-crear + FE |
| **Cambios JANUS** | Redeem: validar vs sync **o** llamar CZ redeem | Redeem: verify HMAC/JWT + consume `jti` | **Emit** + **Redeem**; tabla `token_hash` |
| **Cambios Mi Plan** | BE redeem client + FE `/e/{code}` | Igual | Igual |
| **Nueva DB CZ** | YES | NO (si assertion self-contained) | NO |
| **Nueva DB JANUS** | YES (o dependencia CZ) | YES (`jti` consumed) | YES (tokens) |
| **Nueva ENV/secret** | Posible CZ↔JANUS si redeem cruzado | YES shared signing secret | Reutilizar/extender HMAC tracking |
| **Nueva S2S CZ→JANUS** | NO en emit (sí si redeem pide a CZ) | NO en emit | **YES** en emit |
| **Seguridad** | Alta si one-time+TTL | Alta si secret sano + one-time | Alta: confianza = CZ backend autenticado |
| **Complejidad** | Media (2 almacenes o sync) | Baja–media | Media (emit path + fallos red) |
| **Ops** | Sync lag si JANUS solo espeja | Emit local; redeem necesita JANUS | Emit falla si JANUS down en el click de encuesta |

### 5.3 Evidencia nueva relevante para A3

Ya existe canal **Credizona backend → JANUS** autenticado:

| Pieza | Evidencia | Tag |
|-------|-----------|-----|
| Cliente PHP | `Janus/JanusComm.php` — HMAC-SHA256 `timestamp.rawBody`, headers `X-Janus-Timestamp` / `X-Janus-Signature` | CONFIRMADO |
| Endpoint hoy | Solo `POST /tracking/events` (`JanusConstantes::ENDPOINT_EVENTS`) | CONFIRMADO |
| Verificación JANUS | `src/lib/czTrackingHmac.js` + `src/routes/tracking-events.js`; secret `CZ_TRACKING_HMAC_SECRET`; ventana ±300s; rate limit | CONFIRMADO |
| Uso actual | `trackJanus` / form steps — **no** encuesta/handoff | CONFIRMADO |

**¿Reutilizar ese auth es correcto?**  
- **Correcto a nivel de trust:** el caller es el mismo (backend Credizona), ya confiado para ingest.  
- **Cuidado:** no mezclar payload de tracking con emit sin **endpoint/purpose distintos**.  
- **Ops:** secret aparece en clone PHP (`JanusConstantes`) — riesgo de filtración ya existente; no se documenta el valor aquí. Preferible ENV dedicado o rotación — `OPEN_HUMAN_DECISION`.

API Bearer CZ (`apiController` + `CZ_API_BEARER_TOKEN`) es **JANUS→Credizona** (pull sync), dirección inversa — útil para pull on-demand en redeem, **no** como auth de emit browser.

---

## 6. A3 en detalle (viabilidad)

```text
browser
  → POST doEncuestaSinOferta
  → CZ persiste encuesta OK
  → CZ S2S HMAC → JANUS POST /internal/.../handoff/emit { lrw, purpose, cz_solicitud_id? }
  → JANUS crea handoff_code (random), guarda hash, bind episodio
  → CZ responde al browser { handoff_code }
  → CTA Mi Plan /e/{handoff_code}
  → Mi Plan BE → JANUS redeem(handoff_code)
  → contexto allowlisted
```

| Tema | Diseño mínimo | Tag |
|------|---------------|-----|
| Auth CZ→JANUS | Mismo esquema HMAC que tracking; endpoint nuevo | DESIGNED + CONFIRMADO patrón |
| Payload emit | `{ lrw, purpose: "miplan_handoff", solicitude_ref? }` — **sin PII extra** si JANUS ya tiene fila; opcional `encuesta_just_completed: true` | DESIGNED |
| Response emit | `{ handoff_code, expires_at }` | DESIGNED |
| Idempotencia | Misma encuesta/solicitud: re-emit **rota** code previo o devuelve mismo si aún unused — ver OPEN | OPEN_HUMAN_DECISION |
| Doble click submit | Segunda encuesta → fail “ya realizada”; no segundo code si primera OK | CONFIRMADO comportamiento actual fail |
| Refresh gracias | Sin code en página AS-IS; si CTA solo en success AJAX, refresh pierde code → UX re-entry OUT OF SCOPE / fallback futuro | DESIGNED |
| Back button | Puede re-mostrar form; submit falla si completed | CONFIRMADO |
| TTL | Corto (candidato **15 min**) — distinto de entry_token email (días) | DESIGNED + OPEN |
| JANUS down en emit | Encuesta ya guardada; browser sin CTA útil — degradación: mensaje “continuar más tarde” / S1 email | DESIGNED |

**Viabilidad:** **SÍ**, con cambios mínimos en `doEncuestaSinOferta` + endpoint JANUS emit + FE CTA + redeem Mi Plan↔JANUS.

---

## 7. Diseño de `handoff_code`

| Requisito | Valor | Tag |
|-----------|-------|-----|
| Generación | `crypto.randomBytes(32)` (o equiv.) | DESIGNED |
| Entropía | ≥ 128 bit (prefer 256) | DESIGNED |
| Formato browser | URL-safe base64/hex opaco | DESIGNED |
| PII en token | **NO** | CONFIRMADO requisito |
| Almacenamiento | **hash** (SHA-256) en JANUS; plaintext solo al emitir una vez | DESIGNED (alineado CONTRACT-01) |
| Binding | `external_ref=LRW`, `purpose=miplan_handoff`, CI/cz_id server-side | DESIGNED |
| Estados | `issued` → `consumed` \| `expired` \| `revoked` | DESIGNED |
| One-time | **YES** primer redeem exitoso | DESIGNED |
| TTL | Candidato 15 min (OPEN: 5–30) | OPEN |
| URL | Solo el code en path/query Mi Plan | DESIGNED |
| History risk | Code en history = capability hasta TTL/consume → TTL corto + one-time | CONFIRMADO riesgo |
| Logs | Log `token_hash` prefix / request id; **nunca** code completo | DESIGNED |

---

## 8. Canje en Mi Plan

```text
CTA: https://miplan…/e/{handoff_code}   # sin CI, sin LRW, sin PII

Mi Plan FE  →  POST Mi Plan BE { handoff_code }   # UNTRUSTED input = solo code
Mi Plan BE  →  JANUS S2S redeem(handoff_code)     # autenticado Mi Plan↔JANUS
JANUS       →  validate purpose/TTL/state → resolve episodio → allowlist → mark consumed
```

**Prohibido:** FE/BE Mi Plan pidiendo “contexto para LRW X” sin capability.

### Contexto mínimo confirmado a devolver (si existe en JANUS)

| Incluir | No inventar |
|---------|-------------|
| funnel `credizona_rejected`, `external_ref` LRW | `monto_solicitado` |
| CI, nombre, apellido, email, celular | `motivo_rechazo` |
| `fecha_nacimiento`, `relacion_laboral`, `salario` | |
| P1–P10 + `completed_at` (lifetime CI rule) | |
| BCU subset si ya en JANUS | |

Mi Plan aún pide deudas/gastos (ENTRY audits) — no cambia esta decisión.

**Endpoints nuevos (conceptual):**  
- JANUS: emit (CZ) + redeem (Mi Plan) — **no implementados** hoy.  
- Mi Plan: entry redeem proxy — **no existe** cliente JANUS productivo.

---

## 9. Trust boundaries

### Opción B (descartada)

```text
Browser (UNTRUSTED)
  --LRW--> JANUS emit     ← confianza mal puesta: LRW ≠ auth
  --code--> Mi Plan → JANUS redeem → PII
```

IDOR/enumeration en **emit**.

### Opción A3 (recomendada)

```text
Browser UNTRUSTED
  --P1-10+LRW--> Credizona backend
                     │  ← TRUST NACE AQUÍ (completion write)
                     │  actor autenticado hacia JANUS: CZ server (HMAC)
                     ▼
                   JANUS emit (solo caller HMAC)
                     │
Browser <-- code -----┘
  --code--> Mi Plan FE (UNTRUSTED)
  --code--> Mi Plan BE --S2S--> JANUS redeem ← TRUST de PII aquí
```

| Riesgo | Dónde |
|--------|-------|
| IDOR emit | Mitigado: emit no es público; solo CZ HMAC |
| Replay code | TTL + one-time en redeem |
| PII leak URL | Evitado (solo opaque code) |
| PII en logs | Política hash-only |
| Encuesta sin auth | Residual preexistente |

**Principio:** ningún ID de browser se vuelve authorization solo por existir en DB.

---

## 10. Comparación A vs B

| Criterio | A (esp. A3) | B |
|----------|-------------|---|
| Requiere backend CZ | **YES** (mínimo en `doEncuestaSinOferta`) | NO (solo FE→JANUS) |
| Requiere frontend CZ | YES (CTA post-AJAX) | YES |
| Nueva llamada S2S | A3: YES emit; A2: NO emit | Browser→JANUS (inseguro) |
| Browser posee proof real | Recibe code **después** de proof server-side | **NO** — solo LRW |
| Confía en LRW como auth | **NO** | **SÍ (fallo)** |
| Resiste IDOR emit | YES (HMAC CZ) | **NO** |
| Resiste enumeration LRW→handoff | YES | **NO** |
| Full prefill seguro | YES (con redeem) | **NO** |
| Complejidad | Media-baja | Baja pero insegura |
| Cambios mínimos seguros | A3 o A2 | N/A |

---

## 11. Decisión

### B DESCARTADA

JANUS tendría que confiar en LRW/browser sin possession proof adicional.  
Ninguna capability actual corta el ataque §3.

### A REQUIRED — variante **A3**

**Por qué A3 (evidencia, no elegancia):**

1. La única ancla de confianza demostrable está en **Credizona backend post-write**.  
2. Ya existe **HMAC CZ→JANUS** reutilizable para autenticar ese ancla (`JanusComm` + `czTrackingHmac`).  
3. JANUS permanece hub: **emite y canjea** tokens (alineado a `token_hash` en CONTRACT-01).  
4. Browser nunca llama “emit by LRW”.  
5. Mi Plan nunca resuelve por LRW crudo.

**A2** queda como alternativa segura si ops rechaza dependencia de JANUS en el path de encuesta (emit local firmado). Misma propiedad de seguridad; menos hub-centric.

**A1** viable pero más superficie DB en Credizona sin ganancia de seguridad vs A3.

```text
READY_FOR_IMPLEMENTATION: NO
```

Implementación solo tras revisión humana (TTL, idempotencia re-emit, secret rotation, degradación si JANUS down).

---

## OPEN_HUMAN_DECISIONS

1. TTL exacto handoff post-encuesta (candidato 15 min).  
2. Re-emit idempotente vs rotar code en doble success.  
3. ¿Secret HMAC tracking compartido con emit, o secret dedicado?  
4. Degradación UX si emit S2S falla tras encuesta OK.  
5. ¿Pull on-demand Credizona en redeem si sync lag de P1–P10?  
6. Alcance BCU en allowlist V1.

---

```text
HANDOFF_CODE_ARCH_01_STATUS: COMPLETE_AUDIT_NO_IMPL
LRW_FORMAT: LRW-PREFIX_PLUS_DASH_SEGMENTS_OBSERVED_GENERATOR_IS_CDV
LRW_ENTROPY_ASSESSED: NO_CONFIRMADO_CDV_SOURCE_UNAVAILABLE
LRW_ENUMERABLE: POSSIBLE_IF_STRUCTURED__EXPOSURE_ALREADY_SUFFICIENT
LRW_SAFE_AS_REFERENCE: YES
LRW_SAFE_AS_AUTHORIZATION: NO
EXISTING_BROWSER_CAPABILITY_FOUND: NO
CAPABILITY_DESCRIPTION: NONE
CAPABILITY_VERIFIABLE_BY_JANUS: NO
ATTACK_LRW_TO_HANDOFF_BLOCKED: NO
OPTION_B_SECURE: NO
OPTION_B_DECISION: B_DESCARTADA
OPTION_A_REQUIRED: YES
RECOMMENDED_A_VARIANT: A3
CZ_BACKEND_CHANGE_REQUIRED: YES
CZ_FRONTEND_CHANGE_REQUIRED: YES
NEW_CZ_TO_JANUS_S2S_REQUIRED: YES_FOR_A3_EMIT
EXISTING_CZ_TO_JANUS_AUTH_REUSABLE: YES_HMAC_TRACKING_PATTERN
JANUS_NEW_ENDPOINT_REQUIRED: YES_EMIT_AND_REDEEM
MIPLAN_NEW_ENDPOINT_REQUIRED: YES_REDEEM_PROXY
HANDOFF_CODE_REQUIRED: YES
HANDOFF_CODE_ONE_TIME: YES
HANDOFF_CODE_TTL: CANDIDATE_15_MIN_OPEN
PII_IN_TOKEN: NO
PII_IN_URL: NO
USER_REIDENTIFICATION_REQUIRED: NO_ON_A3_HAPPY_PATH
OTP_REQUIRED: NO_ON_A3_HAPPY_PATH
P1_P10_REPEAT_REQUIRED: NO_ON_A3_HAPPY_PATH
RATE_LIMITING_REQUIRED: YES_COMPLEMENTARY
ENUMERATION_PROTECTION_REQUIRED: YES_COMPLEMENTARY
TRUST_ESTABLISHED_AT: CREDIZONA_BACKEND_POST_ENCUESTA_SUCCESS_THEN_JANUS_HMAC_EMIT
MINIMUM_IMPLEMENTATION_SCOPE: DOENCUESTASINOFERTA_EMIT_CALL_PLUS_FE_CTA_PLUS_JANUS_EMIT_REDEEM_PLUS_MIPLAN_REDEEM_CLIENT
SECURITY_BLOCKERS: OPTION_B_NO_POSSESSION_PROOF;_LRW_PUBLIC;_NO_BROWSER_CAPABILITY;_REDEEM_STACK_NOT_BUILT
OPEN_HUMAN_DECISIONS: TTL;_REEMIT_POLICY;_HMAC_SECRET_SCOPE;_EMIT_FAILURE_UX;_SYNC_LAG_PULL;_BCU_ALLOWLIST
READY_FOR_IMPLEMENTATION: NO
```
