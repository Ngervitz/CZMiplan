# MOTOR-EXTRACTION-01 — Server-side boundary (mapa ejecutable)

**Repo:** Ngervitz/CZMiplan  
**Input:** `dev/backend-arch/MOTOR-PORTABILITY-00.md` (leído completo)  
**Date:** 2026-09-23  
**Scope:** mapa de extracción; **sin** implementar backend, **sin** mover código, **sin** cambiar reglas/thresholds  
**Decisión cerrada (no re-evaluada):** motor determinístico → Node.js/Express; frontend captura inputs / llama API / renderiza

Clases de evidencia: **CONFIRMED_FROM_CODE** · **CONFIRMED_FROM_CONFIG** · **INFERENCE** · **UNCERTAIN**

---

## 0. Principios de extracción

1. **Una sola fuente de verdad** de reglas al final de la migración.  
2. **Extraer/adaptar** código existente antes que reescribir.  
3. **Misma entrada + misma `engine_version` ⇒ mismo resultado** (salvo campos explícitamente no deterministas documentados).  
4. **No “corregir”** inconsistencias de thresholds durante la extracción; preservar comportamiento AS-IS.  
5. Frontera mínima: `ENGINE INPUT → SERVER-SIDE ENGINE → ENGINE RESULT → FRONTEND PRESENTATION`.

---

## 1. Inventario de extracción (desde PORTABILITY-00)

### 1.1 ENGINE_CORE (debe vivir server-side; decide diagnóstico / plan / stage / acciones / next_step UX)

| Función / bloque | Archivo | Responsabilidad | Destino | Deps actuales | Inputs requeridos | Outputs | Side effects | Cambio mínimo Node |
|------------------|---------|-----------------|---------|---------------|-------------------|---------|--------------|-------------------|
| `calcularMotor` | algorithms.js:664-800 | Orquesta scores/plan/iv2/guards/partners | BACKEND | PRE, CZState, Date.now | ver §5 INPUT | diag core | mutates `fin.score*` | Inyectar input bag; no globals |
| `calcularFinanciero` | :131-186 | Ratio, flujo, moras, scoreFin, DTI | BACKEND | CZState, PRE, TASAS, getTotalMonthlyExpenses? | ingreso, gastos, custom_expenses, deudas, TASAS | `fin` | mutates via stock | Firma con args explícitos |
| `calcularEncuesta` + `p2n` + `surveyIsActive` | survey.js:8+,93-136 | Score/nivel encuesta | BACKEND | `TIENE_ENCUESTA` | respuestas, flag encuesta | `enc` | none | Inyectar flag; no URL |
| `asignarPlan` | algorithms.js:229-237 | planId raw | BACKEND | PRE.respuestas | enc, fin, respuestas | planId | none | Pasar respuestas |
| `applyPlanGuardrail` + `_guardrail*` | :513-662 | plan final | BACKEND | PRE, TIENE_ENCUESTA, BCU flag, snap | diag parcial, flags config | plan+meta | none | Inyectar config+snap BCU |
| `aplicarGuardrailSeveridad` | :479-502 | Cap scores | BACKEND | SEVERITY_* | scores, severity | capped | none | Inyectar caps |
| `interpretarDiagnostico` (enums decisión) | :1749-2126 | causa/patrón/NBA/severity/confianza | BACKEND | PRE, _deudas | result, deudas, ingreso | `interpretacion_v2` | none | Separar copy opcional (§OPEN) |
| `calcularSeveridadFinanciera` | :1107-1195 | severity_level | BACKEND | PRE fallback | fin, deudas, ingreso | severity | none | Ingreso explícito |
| `calcularHorizonte` | :326-346 | Horizonte | BACKEND | — | fin, ingreso | horizonte | none | AS_IS |
| `calcularBloqueadores` | :294-321 | Blockers | BACKEND | — | fin | [] | none | AS_IS |
| `evaluarDebtSanityGuard` / `buildHorizonteEstabilizacionRequerida` | :353-373 | Sanity override | BACKEND | — | fin, ingreso | flags/horizonte | none | AS_IS |
| `evaluarFinancialRealityWarning` | :435-465 | FR warning | BACKEND | — | fin, ingreso | flags | none | AS_IS |
| `deudasActivasParaCalculo` / `isDeudaPagada` | :12-20 | Filtro activas | BACKEND | — | deudas | []/bool | none | AS_IS |
| `evaluarStockDeuda` / `evaluarCostoDeuda` | :87-129 | DTI / costo | BACKEND | — | fin, ingreso / interes | mutates fin / nivel | mutates fin | Preferir return puro (sin cambiar fórmula) |
| `calcularPrioridad` / `deudaPrioritaria` | :193-222 | Prioridad | BACKEND | PRE, TASAS, _deudas | deuda/deudas, ingreso, TASAS | prio | none | Inyectar |
| Partner signals + `calcularRecommendedTools` | :810-903 | recommended_tools | BACKEND | PRE, TASAS | deudas, fin, TASAS | flags + ids | none | Inyectar |
| `calcularDebtDataQuality` + behavioral aggregate (en motor) | :689-714,1092-1100 | Señales conductuales | BACKEND | _deudas | deudas | behavioral | none | Pasar deudas |
| `resolveFinancialStage` + helpers `_stage*` | :1208-1477 | financial_stage | BACKEND | PRE, hasCompletedFinancialInputs, provenance flag | diag, completeness bag, ingreso | stage (+prov) | `_lastProvenance` | Completeness como input |
| `attachFinancialStageToDiag` | :1479-1488 | Attach stage+narrative | BACKEND | — | diag, st-fields | mutates diag | mutates | Orquestador server |
| `resolveNarrativeDecision` + attach | :1503-1596 | narrative_decision | BACKEND | CZ_ENTRY_CONTEXT, user_intent | stage, intent, entry, planId | object | mutates diag | Inyectar |
| `seleccionarAccionesRecomendadas` + gates/orden/taxonomy | :2179-2855 | Acciones | BACKEND | CZState via `_evalCtxAcciones` | diag + ctx bag | acciones (+prov) | mutates | MC-6/MC-8 |
| `_BANCO_ACCIONES_MAESTRO` (condiciones/ids/urgencia) | :2205-2293 | Catálogo decisión | BACKEND | — | — | templates | none | Copy texto puede ser SUPPORT |
| `resolveDashboardCoherence` | ui.js:2389-2461 | profileTier + nextStepKey/Text | BACKEND | completeness UI helpers | diag + completeness | coherence | none | Extraer de ui.js |
| Next-step key/text resolvers (`_resolveNextStep*`, `resolveNextStepContent` decisión) | ui.js:2369-2867 | next_step visible | BACKEND | diag, coherence | keys/text | none | Extraer; copy tables viajan |
| `isRetryEligible*` (si coherence/retry lo usa) | algorithms.js:375-428 | Retry gate | BACKEND | PRE, SEVERITY | diag, st | bool | none | Inyectar |
| `isIncompleteFinancialProfile` (gate coherence) | ui.js:2108+ | Incomplete | BACKEND o SUPPORT | st | bool | none | Misma semántica que completeness |
| `hasCompletedFinancialInputs` (+ helpers básica/deuda/gastos) | app.js:1867+ | Completeness | BACKEND (lógica) / FRONTEND (set flags) | CZState | st flags | bool | none | Evaluar en server desde flags enviados **o** recompute desde inputs — ver OPEN_DECISIONS |

**INFERENCE (PORTABILITY-00 §0):** sin coherence/next_step/acciones en el server, el frontend seguiría decidiendo rutas UX → no hay IP única ni paridad completa.

### 1.2 ENGINE_SUPPORT (tablas/config/helpers; server; no son “orquestador”)

| Ítem | Archivo | Destino | Notas |
|------|---------|---------|-------|
| `TASAS` | creditors.js:7-15 | BACKEND | IP de tasas |
| `SEVERITY_CRITICO_*` | config.js:31-32 | BACKEND | Caps |
| `STAGE_RATIO_*`, `STAGE_DTI_*` | algorithms.js:1208-1210 | BACKEND | Stage thresholds |
| `TIENE_ENCUESTA`, `CZ_PLUS_BCU_CLEARING_LIVE`, `CZ_DECISION_PROVENANCE` | config.js | BACKEND (valores efectivos en request/config server) | Client no debe poder forzar BCU live en prod |
| `ActionNarrativeTaxonomy` maps | actionNarrativeTaxonomy.js | BACKEND | Filter data |
| `clamp` y version strings algoritmo | config.js | BACKEND | `engine_version` |
| `textoParaNarrativa` / `alignInterpretacionV2ConPlan` / `interpretarSituacion` | algorithms.js | BACKEND (si se preserva payload copy AS-IS) o FRONTEND map por ids | OPEN_DECISIONS copy ownership |
| `PLANES` (ids + metadata no-copy) | algorithms.js:25-81 | BACKEND ids; copy PRESENTATION | Separar sin cambiar ids |
| `etiquetaStockDeuda` | :113-118 | BACKEND o PRESENTATION | Label derivado |
| Pure expense total function | creditors.js:129+ (extraída) | BACKEND | Reemplaza getTotalMonthlyExpenses global |
| `_personalizarAccionRecomendada` | :2466-2515 | BACKEND si acciones salen listas; else FRONTEND | Depende fmt/herr |

### 1.3 PRESENTATION (FRONTEND; no decide)

| Ítem | Archivo | Destino |
|------|---------|---------|
| Render dashboard/tabs/hero | ui.js | FRONTEND |
| Copy UI / colores (`colorScore`) | config.js / ui.js | FRONTEND (puede duplicar bands **solo** para color hasta cleanup) |
| PDF Plus / celebrations / consent UI | plusReport, celebrations, consent | FRONTEND |
| `attachNextStepProvenance` **stamp** (si engine ya emite next_step) | ui.js:2902+ | FRONTEND puede omitir; ideal ENGINE emite NS prov | Ver MC-9 |
| GTM/analytics enrichment display | analytics.js | FRONTEND |

### 1.4 STORAGE_TRANSPORT

| Ítem | Archivo | Destino | Notas |
|------|---------|---------|-------|
| `guardarLocal` / `cargarLocal` / `cr_v3` | app.js:1074+ | FRONTEND (cache UX) → REMOVE_AFTER_MIGRATION como fuente de verdad del diag | Tras migración, diag authoritative = ENGINE RESULT |
| `buildDiagnosisSnapshot` | algorithms.js:2931+ | BACKEND o REMOVE_AFTER_MIGRATION | Hoy re-corre motor + identity browser; reemplazar por serialize(ENGINE RESULT)+server ids |
| Identity LS/SS | identity.js | FRONTEND | No es regla motor |
| CRM stub fetch | crm.js | fuera de engine | DESIGNED_ONLY |

### 1.5 CLIENT_ONLY / fuera del core

| Ítem | Destino | Notas |
|------|---------|-------|
| `enriquecerDeuda` (form UX) | FRONTEND hasta que validación server exista | No dentro de `calcularMotor` hoy |
| `calcularRadiografia` | FRONTEND o BACKEND later | No en call graph de calcularMotor |
| `detectHiddenFactorOpportunity` | FRONTEND o ENGINE_SUPPORT later | UI opportunity |
| `calcularEncuestaSeoIa` | FRONTEND/SEO path | Separado del funnel motor |
| `resolveContextualActionSegment` (B7) | OPEN — ver §8 | Decisión en UI; ¿paridad? |
| `czDebug` motor probe | DEV_ONLY | |
| Creditor dictionary UX (`DEBT_TYPES` labels) | FRONTEND | TASAS sí van al engine |

### 1.6 Lógica UI que es decisión de negocio (CONFIRMED_FROM_CODE)

| Bloque | Archivo | Por qué es decisión | Destino extracción |
|--------|---------|---------------------|-------------------|
| `resolveDashboardCoherence` | ui.js:2389+ | Elige `profileTier` y `nextStepKey/Text` | ENGINE_CORE |
| `_resolveNextStepKeyFromDiag` / `_nextStepActionKeyForNarrative` / overrides | ui.js:2369-2600 | Identidad del next step | ENGINE_CORE |
| `resolveNextStepContent` (rama decisión) | ui.js:2739+ | Árbol next step | ENGINE_CORE |
| Call sites `seleccionarAccionesRecomendadas` | ui.js:5919+ | Disparan selección | Caller pasa a API; función → BACKEND |
| B7 `resolveContextualActionSegment` | ui.js:2262+ | Segmenta por laboral×ingreso×deudas | OPEN_DECISIONS |

---

## 2. Resolución conceptual MC-1…MC-10

| ID | Problema actual | Dependencia concreta | Cómo desacoplar | Qué inyectar | Ownership final | Riesgo de alterar comportamiento |
|----|-----------------|----------------------|-----------------|--------------|-----------------|----------------------------------|
| **MC-1** | Motor lee estado vía globals | `_gastos/_deudas/_snap` → `window.CZState` algorithms.js:7-9 | Eliminar readers globales; pasar objetos en `EngineInput` | `gastos`, `custom_expenses`, `deudas`, `snap` | BACKEND lee solo input; FRONTEND mantiene CZState para forms | **Bajo** si se pasa el mismo snapshot que hoy leería CZState |
| **MC-2** | `PRE` global | `PRE.ingreso`, `PRE.respuestas` | Incluir en input; sync PRE→input en adapter client | `ingreso`, `respuestas` | FRONTEND captura; BACKEND consume | **Bajo** si adapter usa mismos syncs (`syncPreIngresoFromState`, SEO survey) antes del call |
| **MC-3** | Expense total vía creditors+CZState | `getTotalMonthlyExpenses()` algorithms.js:135-136; creditors.js:129+ | Función pura `(gastos, custom_expenses, exclusions) → number` **misma fórmula** | totals o raw expenses + misma fn server | BACKEND | **Medio** si se omite custom_expenses o exclusiones |
| **MC-4** | `diasRec` no determinista | `Date.now` algorithms.js:679-680 | **D5 CLOSED:** backend fija `now_ms` al inicio de la ejecución | `now_ms` server-owned | BACKEND | **Bajo** con freeze en tests/oracle |
| **MC-5** | Stage depende completeness app | `hasCompletedFinancialInputs` algorithms.js:1225; app.js:1867 | **D4 CLOSED:** server deriva flags desde campos raw + predicados producto; ignora booleans client | declared_*, ingreso, deudas, gastos, `no_debts_declared` | BACKEND | **Bajo** si misma derivación que oracle |
| **MC-6** | Acciones leen CZState | `_evalCtxAcciones` algorithms.js:2304 | Construir `acciones_ctx` en engine desde EngineInput (gastos, herr, expense helpers puros) | mismos campos que ctx hoy | BACKEND | **Medio** — hay que portar helpers de expense presentation usados en ctx |
| **MC-7** | next_step/coherence en UI | ui.js:2389+ | **D1 CLOSED:** forman parte de ENGINE_CORE V1; UI solo renderiza | diag ya en engine pipeline | BACKEND decide; FRONTEND presenta | **Alto** si se deja en client tras cutover |
| **MC-8** | Fallback re-entra `calcularMotor` | algorithms.js:2713 | Fallback recibe `diag` ya calculado / o llama orquestador interno **una vez**; prohibir segundo entry externo | diag in-memory | BACKEND | **Medio** — hay que preservar mismo resultado del fallback sin doble entry observable |
| **MC-9** | NS provenance muta diag en UI | ui.js:2902+ | Emitir `next_step_provenance` en ENGINE RESULT cuando flag on; UI deja de recalcular | flag provenance + coherence/next_step ya resueltos | BACKEND stamp; FRONTEND DISPLAY only | **Bajo** si flag off (default); contract AS-IS |
| **MC-10** | BCU flag puede forzar plan 4 | `_guardrailExternalBcuCritico` algorithms.js:542-549; config.js:470 | Flag solo desde **server config**; client puede enviar snap fields pero no forzar live=true en prod | `bcu_clearing_live` (server), snap BCU fields | BACKEND owns flag | **Bajo hoy** (flag false); **Alto** al activar live sin same snap shape |

---

## 3. Reglas duplicadas (mapa; sin “fix”)

| ID | Dónde aparece | ¿Misma regla o distintas? | Preservar AS-IS | Fuente única **futura** (post-decisión humana) |
|----|---------------|---------------------------|-----------------|-----------------------------------------------|
| **DUP-35** | scoring :155; asignarPlan :232; blockers :309; horizonte :333; guardrail RATIO_ALTO :554; STAGE_RATIO_ALTO :1208; UI copy | Misma magnitud **0.35** en varias decisiones relacionadas pero **no un solo símbolo** | Mantener cada sitio con 0.35 al extraer (copiar literales juntos al server) | Constante única `RATIO_ALTO=0.35` **después** de confirmar que todos los usos son equivalentes (OPEN) |
| **DUP-15-20** | UI coherence healthy `ratio<=0.15` ui.js:2407 vs `STAGE_RATIO_OPTIMIZACION_MAX=0.20` algorithms.js:1209 | **Reglas distintas** (umbral UI vs stage) — CONFIRMED_FROM_CODE divergencia | **No unificar** en extracción; portar **ambos** valores a sus respectivos módulos | Decisión producto: ¿deben converger? Fuera de esta extracción |
| **DUP-21-13** | nivelR motor :674,752 vs `colorScore` config | Decisión vs presentación color | Portar bands al engine; colorScore puede seguir leyendo mismos números del RESULT | Engine dueño de nivelR; UI color deriva de `nivelR`/`scoreReset` |
| **DUP-DTI-NS** | Stock/DTI motor + UI next-step DTI≥1 | Paralelas; pueden alinearse o no | Portar ambas ramas tal cual | Engine único que ejecute **ambas** ramas en orden AS-IS |
| **DUP-MORA-FLUJO** | Stage recovery vs coherence `critical` | Semántica overlapping, outputs distintos | Portar ambas | No fusionar en v1 extracción |

**Regla de extracción:** duplicar literales en el paquete server **igual que hoy**; centralizar constantes solo en un paso posterior explícito (no esta tarea).

---

## 4. Boundary mínimo (conceptual)

```
[FRONTEND]
  captura forms / flags / intent / entry
  arma EngineInput (sin reglas)
  POST (futuro) →
[SERVER-SIDE ENGINE]  ← única implementación de reglas
  engine_version + config tablas
  pipeline:
    calcularMotor-equivalent
    → attachFinancialStage + narrative
    → seleccionarAcciones
    → coherence + next_step (+ provenance si flag)
  ← EngineResult
[FRONTEND]
  asigna result a estado de UI
  renderiza; no recalcula plan/stage/acciones/next_step
```

### 4.1 ENGINE INPUT (conceptual; no HTTP final)

| Campo | Origen típico | Notas |
|-------|---------------|-------|
| `ingreso` | declarado / PRE sync | REQUIRED |
| `respuestas` | encuesta p1–p10 | REQUIRED o vacías + `tiene_encuesta` |
| `tiene_encuesta` | flag | REQUIRED |
| `gastos`, `custom_expenses` | CZState | REQUIRED |
| `deudas[]` | CZState (campos motor) | REQUIRED |
| `snap` (`fecha_inicio`, campos BCU si existen) | CZState | OPTIONAL |
| `now_ms` | client o server clock policy | REQUIRED for diasRec parity policy |
| Completeness flags / declared_* / `no_debts_declared` | CZState | REQUIRED for stage |
| `user_intent` | CZState | OPTIONAL |
| `entry_context` | CZ_ENTRY_CONTEXT | OPTIONAL |
| `herr` / campos ctx acciones | CZState | si acciones personalizan |
| `engine_version` requested | client opcional | server puede fijar |
| **No incluir:** API keys, secretos, CI como input de fórmula |

### 4.2 ENGINE RESULT (conceptual)

| Bloque | Contenido |
|--------|-----------|
| Core diag | `enc`, `fin`, scores, `nivelR`, `planId`, guardrail meta, `prio`, `bloqueadores`, `horizonte`, `diasRec`, iv2 (enums+copy AS-IS), FR/sanity, partner flags, `recommended_tools` |
| Stage/narrative | `financial_stage`, `narrative_decision`, FS provenance si flag |
| Acciones | lista seleccionada (+ ACT provenance si flag) |
| UX path | `coherence` (tier, nextStepKey/Text, flags hide/suppress…), `next_step` resuelto, NS provenance si flag |
| Meta | `engine_version`, `computed_at`, opcional `input_hash` |

### 4.3 FRONTEND tras boundary

- Persistencia local = cache / offline UX, no autoridad de reglas.  
- Prohibido (objetivo final): volver a llamar `calcularMotor` / coherence / seleccionarAcciones en client.  
- Transición: ver §7 (doble ejecución con compare).

---

## 5. Determinismo — plan

| Fuente | Clasificación | Neutralización |
|--------|---------------|----------------|
| `Date.now` → `diasRec` | NON_DETERMINISTIC_CLOCK | Input `now_ms`; tests freeze |
| Feature flags (encuesta, BCU live, provenance) | CONFIG_SENSITIVE | Fijar en server config + versionar en `engine_version` / `config_digest` |
| Globals CZState/PRE | INPUT_LEAK | Solo EngineInput |
| `Object.keys` empates situCounts | WEAK_ORDER (INFERENCE) | Documentar; si hace falta, sort keys estable **solo si** se prueba paridad — default: preservar algoritmo actual |
| `Math.random` | N/A en motor | — |
| Network | N/A en motor | — |
| UUID en snapshot | TRANSPORT | No parte del diag de reglas; generar fuera o como meta |

**Contrato de paridad:**  
`hash(canonical(EngineResult without computed_at))` estable dado `EngineInput + engine_version + config_digest + now_ms`.

---

## 6. Estrategia de migración (secuencia mínima)

Preferencia: **extraer → adaptar firmas → paridad → cortar client rules**.

| Fase | Qué hacer | Qué no hacer | Criterio de salida |
|------|-----------|--------------|-------------------|
| **E0** | Congelar inventario (este doc + PORTABILITY-00) | Cambiar thresholds | Docs accepted |
| **E1** | Crear módulo server (ubicación concreta = BACKEND-ARCH-01) copiando/adaptando `algorithms`+`survey`+`TASAS`+taxonomy; inyectar MC-1…4 | Exponer reglas nuevas; no borrar client aún | `calcularMotor`-equiv corre en Node con fixtures |
| **E2** | Portar stage/narrative + completeness injection (MC-5) | Unificar 0.15/0.20 | Stage parity tests |
| **E3** | Portar acciones (MC-6, MC-8) | Reescribir banco de acciones | Acciones parity |
| **E4** | Extraer coherence/next_step de ui.js → engine (MC-7, MC-9) | “Simplificar” UX path | Coherence/next_step parity |
| **E5** | Adapter client: build EngineInput; **shadow mode** (server+client compare) | Remover client motor | Diff=0 en corpus perfiles |
| **E6** | Client consume solo EngineResult; motor client dead code path off | — | Feature flag |
| **E7** | REMOVE_AFTER_MIGRATION: borrar/omitir bundle de reglas del browser | — | IP no en client |

**Una implementación final:** a partir de E6, solo server ejecuta reglas; client no mantiene fork.

---

## 7. Matriz destino resumida (por archivo)

| Archivo actual | Qué migra a BACKEND | Qué queda FRONTEND | REMOVE_AFTER_MIGRATION |
|----------------|---------------------|--------------------|------------------------|
| `js/algorithms.js` | Casi todo el call graph motor+acciones+stage+narrative | Nada de reglas | Funciones motor en bundle client |
| `js/survey.js` | `calcularEncuesta` funnel | SEO survey UX / sync a input | scoring funnel client |
| `js/creditors.js` | `TASAS` + total gastos puro | Labels DEBT_TYPES, normalización UX | TASAS en client |
| `js/actionNarrativeTaxonomy.js` | maps filtro | — | client copy |
| `js/app.js` | predicados completeness (lógica) | assignMotorDiagnosis → API client; guardarLocal cache | orquestación motor local |
| `js/ui.js` | coherence/next_step decisión | render | resolvers decisión |
| `js/config.js` | severity/flags efectivos server | UI constants no-motor | caps/flags decisión en client |

---

## 8. DECISIONES HUMANAS CERRADAS (2026-09-23)

Estas decisiones cierran formalmente MOTOR-EXTRACTION-01. No se reabren sin evidencia nueva.

### D1 — ALCANCE SERVER V1

**ENGINE_CORE V1** incluye toda lógica decisoria:

- core / `calcularMotor` (y call graph);
- `financial_stage` + attach;
- narrative determinística (`narrative_decision`);
- acciones (`seleccionarAccionesRecomendadas` + post-transforms de motor/UI que son decisión de lista, excl. B7/UX1D2);
- coherence (`resolveDashboardCoherence`);
- next_step (resolvers de decisión).

El frontend **no** debe conservar lógica central de decisión tras el cutover.

### D2 — B7

B7 (`resolveContextualActionSegment` + tip catalog + render) queda en **FRONTEND_PRESENTATION**.

No forma parte de ENGINE_CORE V1.

Se preserva el comportamiento UX1D2 actual que puede suprimir visualmente/canonical `flujo_negativo_accion` para S1/S3 **después** de recibir el resultado del backend (capa FE; ver corpus `fe_presentation_layer`).

### D3 — COPY / PLANES / NARRATIVA

El backend devuelve el resultado **ya resuelto**, incluyendo copy/narrativa AS-IS (`plan`, textos iv2, textos de acciones, `next_step.text`, etc.).

El frontend no debe reconstruir decisiones mediante tablas internas de PLANES/narrativa.

### D4 — COMPLETENESS

El backend **recalcula** completeness desde los inputs (misma semántica que los predicados de producto, derivando flags de funnel a partir de campos raw; **ignora** booleans de completeness enviados por el cliente).

El frontend puede calcular completeness solo para UX inmediata.

### D5 — RELOJ

`now_ms` lo define el **backend** al comenzar cada ejecución y permanece fijo durante esa ejecución.

No se confía en reloj del cliente para el diagnóstico válido.

(Tests/oracle congelan `Date.now` a un `now_ms` fijo documentado.)

### D6 — DIVERGENCIAS EXISTENTES

Se preservan AS-IS todas las divergencias detectadas (incl. **0.15 vs 0.20** y demás DUP de PORTABILITY-00) durante la migración.

No se corrigen ni unifican funcionalmente en este sprint.

### D7 — PARIDAD

Antes de extraer el motor existe corpus oficial:

`dev/backend-arch/parity/` + `dev/backend-arch/MOTOR-PARITY-00.md`

Objetivo: mismos inputs + misma `engine_version` + mismo `now_ms` → mismo resultado observable entre implementación actual (oracle) y futura server-side.

---

## 8b. OPEN_DECISIONS_BEFORE_IMPLEMENTATION

**NONE** (ninguna decisión humana pendiente que bloquee comenzar la extracción).

Pendientes explícitamente **fuera** de esta fase (BACKEND-ARCH-01 / implementación): forma del package, rutas HTTP, auth, hosting, borrado del bundle client, wiring ASSISTANT-01.

---

## 9. Criterios de “listo para extraer”

| Criterio | Estado |
|----------|--------|
| Core server identificado | YES |
| Decision logic en UI identificada | YES |
| MC-1…10 con plan de desacople | COMPLETE |
| Duplicados mapeados sin “fix” | YES |
| Determinismo planificado | COMPLETE |
| Decisiones humanas D1–D7 | CLOSED |
| Corpus de paridad oracle | YES — `dev/backend-arch/parity/` |

---

EXTRACTION_BOUNDARY: CLEAR

SERVER_CORE_IDENTIFIED: YES

UI_DECISION_LOGIC_IDENTIFIED: YES

MC_1_10_RESOLUTION: COMPLETE

DUPLICATED_RULES_MAPPED: YES

DETERMINISM_PLAN: COMPLETE

NODE_EXTRACTION_READY: YES

---

### Referencias

- `dev/backend-arch/MOTOR-PORTABILITY-00.md` (call graph, MC-1…10, duplicados, determinismo)  
- `dev/backend-arch/MOTOR-PARITY-00.md` (corpus + shadow strategy)  
- Código citado: `js/algorithms.js`, `js/survey.js`, `js/creditors.js`, `js/app.js`, `js/ui.js`, `js/config.js`, `js/actionNarrativeTaxonomy.js`
