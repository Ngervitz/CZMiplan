# MIPLAN-JOURNEY-01 — Persistencia e identidad de journeys

**Tipo:** IMPLEMENTATION  
**Fecha:** 2026-09-25  
**Repo:** CZMiplan  
**Cierra:** `BLOCKED_BY_HUMAN_DECISION` de `A3-HANDOFF-IMPLEMENTATION-01` (journey_id)

```text
PRODUCTION_DEPLOYED: NO
MIGRATIONS_APPLIED_PROD: NO
JANUS_CHANGED: NO
CREDIZONA_CHANGED: NO
CPANEL_TOUCHED: NO
```

---

## 1. JOURNEY_CURRENT_STATE_AUDIT (pre-implementación)

| Área | Estado real (código) | Doc |
|------|----------------------|-----|
| Tablas | `identities_anonymous`, `diagnoses`, `financial_captures`, `expense_captures`, `debt_captures`, `shadow_results` | Coincide DATA-01 / B2 |
| `journey_id` | **Ausente** en DB y código productivo | A3 lo marcaba BLOCKED; audit INTEGRATION también |
| `anonymous_id` | Header `X-MiPlan-Anonymous-Id`; LS `cz_anonymous_id` (`js/identity.js`) | Coincide |
| `entry_context` | JSON en snapshot + `financial_captures`; ENTRY-01 `cdv_rejected` / `organic` / `seo_organic` | Coincide |
| Handoff A3 | `POST /v1/handoff/redeem` + cache **in-memory 2 min** por sha256(code) | A3 doc; **no durable** |
| Continuidad post-redeem | `sessionStorage` context + strip URL `/e/{code}` | `js/handoffEntry.js` |
| Diagnosis persist | `miplan_persist_diagnosis` RPC; append-only; sin journey FK | B2/DATA-01 |
| `JANUS-MIPLAN-CONTRACT-01.md` | **No encontrado** en repo (referenciado por A3). Contexto allowlisted confirmado en código JANUS `buildAllowlistedContext` + audit INTEGRATION | Diferencia doc↔archivo: prevalece código |

**Conclusión audit:** A3 entrega contexto; falta identidad durable del recorrido. Cache RAM no sobrevive restart/multi-instance.

---

## 2. Modelo implementado

Conceptos separados (sin colapsar):

| Concepto | Rol |
|----------|-----|
| CI | Persona/dedup JANUS — **no** journey |
| LRW | Provenance episodio — **no** auth / **no** journey |
| handoff_code | Capability one-time — bootstrap only |
| anonymous_id | Identidad V1 dispositivo (1 : N journeys) |
| journey_id | Instancia concreta de flujo (UUID server-side) |
| diagnosis_id | Diagnóstico append-only; FK opcional → journey |

Tabla `public.journeys` + `diagnoses.journey_id` **nullable**.

---

## 3. Schema

Ver: `server/migrations/20260925120000_miplan_journey_01.sql`

### `journeys`

| Columna | Notas |
|---------|-------|
| `journey_id` | UUID PK, server-generated |
| `anonymous_id` | FK → `identities_anonymous` |
| `tenant_id` | Reservado (V1 default) |
| `entry_type` | `janus_handoff` \| `virgin_miplan` \| `provider_referral` (check; solo handoff creado ahora) |
| `funnel` | p.ej. `credizona_rejected` |
| `commercial_originator` | p.ej. `COPANEL_CREDIZONA` (mapeo audit INTEGRATION) |
| `source_system` | `credizona` / `janus` |
| `external_ref_type` / `external_ref` | `lrw` + LRW (nullable para virgin) |
| `bootstrap_key` | UNIQUE `handoff:<sha256(code)>` — **no** bearer |
| `bootstrap_context` | JSON allowlisted (retry durable) |
| `created_at` / `updated_at` | timestamps |

### `diagnoses.journey_id`

Nullable FK. Históricos sin valor siguen válidos.

### RPCs

- `miplan_resolve_handoff_journey` — lookup/create atómico por `bootstrap_key`
- `miplan_assert_journey_owned` — ownership check
- `miplan_persist_diagnosis` — reemplaza firma 8-arg por 9-arg con `p_journey_id uuid DEFAULT NULL` (omitible; sin overload ambiguo)

RLS: journeys sin grants a `anon`/`authenticated` (mismo posture B2).

---

## 4. Lifecycle

```text
/e/{handoff_code}
  → POST /v1/handoff/redeem + X-MiPlan-Anonymous-Id
  → lookup journeys.bootstrap_key
       HIT + same anon → return journey_id + bootstrap_context (no JANUS)
  → else JANUS redeem
       OK → sanitize context → insert journey (UNIQUE bootstrap_key)
       already_redeemed → lookup again; miss → 409
  → FE: sessionStorage context + journey_id; history.replaceState strip code
```

Refresh sin code: FE restaura context/`journey_id` desde sessionStorage — **no** segundo redeem.

---

## 5. Relación anonymous_id

`1 anonymous_id : N journeys` — confirmado por UNIQUE solo en `bootstrap_key`, no en anonymous_id.

Dos handoffs distintos (episodios distintos) → dos journeys con el mismo anon.

---

## 6. Relación handoff

| | |
|--|--|
| Key | `handoff:` + SHA-256(raw code) |
| Raw code | **Nunca** persistido |
| CI | **Nunca** en `bootstrap_context` (sanitize) |
| Authority | DB journey row, no cache RAM |

---

## 7. Idempotencia

| Caso | Comportamiento |
|------|----------------|
| Doble click | Mismo `bootstrap_key` → mismo `journey_id` |
| Retry post-JANUS | Lookup durable; no requiere JANUS |
| Concurrente | UNIQUE + conflict path → un journey |
| Handoff distinto | Journey nuevo |
| Anon distinto mismo code | `403 JOURNEY_OWNERSHIP_MISMATCH` |

---

## 8. Continuidad tras refresh

- `sessionStorage`: `cz_handoff_context_v1`, `cz_journey_id_v1`
- `CZIdentity.journey_id` en memoria de página
- URL limpia (`replaceState`) tras redeem
- No depende del handoff_code consumido

---

## 9. Relación diagnosis

- Body opcional `journey_id` en `POST /v1/diagnoses`
- Server: `assertOwned(journey_id, anonymous_id)` antes de persistir
- `extractEngineInput` elimina `journey_id` del snapshot del motor
- Shadow FE (`js/shadowDiagnosis.js`) adjunta journey si existe
- Sin journey_id → comportamiento virgin/histórico intacto

---

## 10. Entry / provenance

En journey (handoff Credizona):

- `funnel` = `credizona_rejected` (contrato JANUS allowlist)
- `commercial_originator` = `COPANEL_CREDIZONA`
- `source_system` desde provenance JANUS
- `external_ref` = LRW (reference only)

ENTRY-01 `entry_context` / acquisition marketing **no** se duplican en `journeys`; siguen en diagnosis snapshot.

Nota naming: ENTRY-01 usa `cdv_rejected` en URL bridge; A3/JANUS usa funnel `credizona_rejected`. Se preservan ambos vocabularios sin inventar fusión.

---

## 11. Seguridad

| Garantía | Cómo |
|----------|------|
| No IDOR por journey_id | Ownership check vs anonymous_id en assert + persist |
| journey_id ≠ auth de contexto ajeno | No endpoint que entregue bootstrap_context solo por journey_id |
| No raw handoff stored | Solo hash prefixed |
| No PII en URL | Solo code opaco pre-strip; post-strip limpio |
| LRW ≠ auth | Redeem rechaza body.lrw |
| CI ≠ browser identity | Sanitize + anonymous_id V1 |

**Gap documentado (aceptado V1):** `anonymous_id` sigue siendo bearer de dispositivo (preexistente B2). journey_id no empeora ese modelo; no se construye Auth completa.

---

## 12. Archivos modificados / creados

| Archivo | Cambio |
|---------|--------|
| `server/migrations/20260925120000_miplan_journey_01.sql` | NEW |
| `server/modules/journey/*` | NEW service/repo/sanitize |
| `server/http/routes/handoff.js` | Durable journey resolve |
| `server/app.js` | Wire journey service |
| `server/modules/diagnosis/service.js` | Optional journey_id |
| `server/modules/diagnosis/repository.js` | Pass `p_journey_id` |
| `server/http/routes/diagnoses.js` | Echo journey_id |
| `js/handoffEntry.js` | Persist journey + refresh restore |
| `js/shadowDiagnosis.js` | Attach journey_id |
| `server/bin/journey-01-test.js` | NEW tests |
| `server/bin/handoff-redeem-test.js` | Updated for journey |

---

## 13. Migration

**Creada, no aplicada en prod.**

Orden prod futuro:

1. Aplicar `20260925120000_miplan_journey_01.sql` en Supabase CZMiplan  
2. Redeploy Railway Mi Plan backend  
3. Deploy FE (Vercel) con `handoffEntry.js` / `shadowDiagnosis.js`  
4. Smoke: redeem → journey_id → diagnosis con FK

---

## 14. Tests

| Suite | Resultado esperado |
|-------|-------------------|
| `node server/bin/journey-01-test.js` | PASS |
| `node server/bin/handoff-redeem-test.js` | PASS |
| `node server/bin/smoke.js` | PASS |
| Persistence / engine parity existentes | Sin cambios de motor |

Cubre: create UUID, anon link, LRW provenance, no raw code, retry same journey, concurrent same journey, distinct handoff → distinct journey, ownership mismatch, LRW forbidden, engine strip journey_id.

---

## 15. Pasos pendientes producción

1. Aplicar migración Supabase (manual).  
2. Deploy backend + FE.  
3. Smoke E2E con A3 (tras cPanel Credizona).  
4. Opcional futuro: auto-crear `virgin_miplan` journeys; provider_referral.  
5. No implementar CI dedup / ownership comercial aquí.

---

## 16. Diferencias doc↔código registradas

- `JANUS-MIPLAN-CONTRACT-01.md` ausente como archivo; contrato allowlisted confirmado en código JANUS.  
- ENTRY-01 `cdv_rejected` vs A3 `credizona_rejected`: ambos válidos en capas distintas.
