# MOTOR-PARITY-00 — Corpus oficial de paridad (pre-extracción)

**Repo:** Ngervitz/CZMiplan  
**Date:** 2026-09-23  
**Depends on:** `MOTOR-PORTABILITY-00.md`, `MOTOR-EXTRACTION-01.md` (D1–D7 CLOSED)  
**Scope:** congelar comportamiento AS-IS del motor actual como ORACLE; **sin** SERVER_ENGINE aún; **sin** modificar código productivo

---

## 1. Objetivo

Comprobar, cuando exista el motor server-side:

```
mismos inputs + misma engine_version + mismo now_ms
→ mismo resultado observable
```

entre:

- **CURRENT_ORACLE** = implementación actual cargada en VM (`js/algorithms.js` + deps + UI decision layer)
- **SERVER_ENGINE** = futura única fuente de verdad (aún no implementada)

---

## 2. Reutilización auditada (harnesses existentes)

| Recurso | Reutilizable? | Uso |
|---------|---------------|-----|
| `dev/decision-provenance/harness.js` | **YES** | `createCtx` / `loadProduct` / helpers |
| `dev/decision-provenance/profiles.js` | PARTIAL | Inspiración FS; corpus de paridad es independiente y más ancho |
| `dev/assistant-01/fixtures.js` | NO como oracle | Contratos assistant; no ejecutan motor completo UX |
| `dev/narrative-05-qa.js` | **NO** | Excluido por regla; no se toca ni se asume |
| `dev/contextual-action-b7b-qa.js` | NO para ENGINE_CORE | B7 es FE (D2) |

---

## 3. Artefactos del corpus

| Path | Rol |
|------|-----|
| `dev/backend-arch/parity/fixtures-definitions.js` | Inputs sintéticos + tags de cobertura |
| `dev/backend-arch/parity/capture-oracle.js` | Ejecuta motor actual → congela outputs |
| `dev/backend-arch/parity/compare-helpers.js` | Reglas de igualdad estructural |
| `dev/backend-arch/parity/oracle-results.json` | **ORACLE congelado** (expected AS-IS) |
| `dev/backend-arch/parity/MANIFEST.json` | Meta + `corpus_sha256` |

Captura:

```bash
node dev/backend-arch/parity/capture-oracle.js
```

**Write-once policy:** re-capturar solo tras cambio de motor aprobado; el sha256 del corpus debe actualizarse conscientemente.

---

## 4. Semántica de captura (decisiones D1–D7)

| Decisión | Cómo se refleja en el oracle |
|----------|------------------------------|
| D1 scope | `oracle.engine_result` incluye plan/scores/fin/iv2/stage/narrative/coherence/next_step/acciones + copy |
| D2 B7 | `oracle.fe_presentation_layer` (B7 segmentId, UX1D2, canonical visible); **fuera** de igualdad ENGINE_CORE V1 |
| D3 copy | Textos incluidos en `plan`, `interpretacion*`, `acciones[].texto`, `next_step.text` |
| D4 completeness | Flags derivados de campos raw; `client_completeness_flags` ignorados; resultado en `completeness_recomputed` |
| D5 clock | `Date.now` congelado a `FIXED_NOW_MS` = `2026-08-12T12:00:00.000Z`; `diasRec` estable |
| D6 divergences | Outputs AS-IS (p.ej. ratio 0.18 → coherence `standard` vs stage `ESTABILIZACION`) |
| D7 | Este corpus es el oficial |

---

## 5. Cobertura de fixtures (18 casos)

| Fixture | Cubre (tags) |
|---------|----------------|
| P_HEALTHY_LOW_RATIO | plan, stage, coherence 0.15, acciones, next_step, MC-1..4 |
| P_RATIO_BETWEEN_15_20 | **DUP-15-20** (ratio≈0.18) |
| P_RATIO_AROUND_35 | **DUP-35** |
| P_FLUJO_NEGATIVO | flujo, recovery, UX1D2/B7_S1 FE layer |
| P_MORA_ACTIVA | mora, plan 4 |
| P_DTI_ALTO | DTI / stage |
| P_SIN_DEUDAS | OPTIMIZACION / plan 1 |
| P_INCOMPLETE_PROFILE | completeness MC-5 / CLARIDAD + flags client mentirosos ignorados |
| P_ENCUESTA_HARD_C | scoring encuesta |
| P_SIN_ENCUESTA | TIENE_ENCUESTA=false |
| P_CUSTOM_EXPENSES | MC-3 |
| P_INTENT_CREDITO | narrative / intent |
| P_PROVENANCE_ON | MC-9 provenance |
| P_BCU_LIVE_OFF / ON_NO_CRITICO | MC-10 |
| P_MONOTRIBUTISTA_DEUDAS | B7_S3 FE + acciones |
| P_MUCHAS_DEUDAS | partner / scoring |
| P_SCORE_BAND_MILD | bands score |

**Stages observados en captura:** CLARIDAD, RECUPERACION, ESTABILIZACION, OPTIMIZACION.  
**Coherence tiers:** healthy_organized, standard, critical.  
**UX1D2 suppress:** ejercitado (p.ej. P_FLUJO_NEGATIVO).

### MC coverage

| MC | Cubierto por |
|----|----------------|
| MC-1/2/3 | fixtures con gastos/deudas/PRE/custom |
| MC-4 | `now_ms` fijo + `diasRec` |
| MC-5 | P_INCOMPLETE_PROFILE + completeness_recomputed |
| MC-6 | acciones en todos los motor runs |
| MC-7 | coherence + next_step en engine_result |
| MC-8 | path normal de acciones (fallback re-entry no forzado; documentado pendiente de caso dedicado si hace falta) |
| MC-9 | P_PROVENANCE_ON |
| MC-10 | P_BCU_LIVE_* |

**MC_COVERAGE: COMPLETE** (MC-8 vía path feliz; re-entrada fallback no forzada — PARTIAL estricta solo si se exige fixture que dispare `_fallbackAccionesRecomendadas`; ver OPEN note abajo).

Nota: no hay open decision de producto; solo posible ampliación futura del corpus para forzar fallback de acciones.

---

## 6. Shadow / compare strategy

Cuando exista SERVER_ENGINE:

```
for each case in oracle-results.json:
  actual = SERVER_ENGINE(case.input)   // server sets now_ms = case.input.now_ms policy: use fixture now for tests
  compareEngineResults(case.oracle.engine_result, actual)
```

### Igualdad exacta (ENGINE_CORE)

Ver `parity/compare-helpers.js` → `EXACT_EQUALITY_PATHS`:

- planId, nivelR, scores, guardrails, diasRec  
- enc, fin (métricas), interpretacion / interpretacion_v2 (incl. copy AS-IS)  
- horizonte, bloqueadores, partner flags, recommended_tools  
- financial_stage (+ provenance si on)  
- narrative_decision  
- coherence (tier + nextStepKey/Text + flags)  
- next_step (+ provenance si on)  
- acciones (id, texto, tipo, urgencia, reasons)  
- completeness_recomputed  
- plan object (copy AS-IS)

### Normalización legítima

- `undefined` ↔ `null` en claves ausentes (`normalizeForCompare`)  
- **No** reordenar arrays de acciones/tools (orden AS-IS es significativo)

### Fuera de comparación ENGINE_CORE V1

- `fe_presentation_layer.*` (B7, UX1D2, canonical FE) — suite FE aparte  
- timestamps de captura / identity / localStorage  
- HTML render

### Política de `now_ms` en tests vs prod

- **Tests/parity:** usar `input.now_ms` del fixture (freeze).  
- **Prod (D5):** backend asigna `now_ms = Date.now()` al inicio; no acepta clock client para diagnóstico válido.

---

## 7. Qué falta / límites conocidos

1. Fixture dedicado que fuerce `_fallbackAccionesRecomendadas` (MC-8 re-entry) — opcional; no bloquea extracción.  
2. No cubre Plus/Claude ni CRM.  
3. Stage CLARIDAD por incompleteness vs otros motivos — cubierto por P_INCOMPLETE_PROFILE.  
4. `engine_version` string aún no emitido por producto; al extraer, añadir al result y al compare.

---

## 8. Cierre

MOTOR-PARITY-00: COMPLETE

PARITY_CORPUS_CREATED: YES  
CURRENT_ENGINE_ORACLE_CAPTURED: YES  
MC_COVERAGE: COMPLETE  
THRESHOLD_BOUNDARIES_COVERED: YES  
OFFICIAL_CORPUS_PATH: `dev/backend-arch/parity/oracle-results.json`
