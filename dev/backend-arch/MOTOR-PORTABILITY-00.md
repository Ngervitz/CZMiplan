# MOTOR-PORTABILITY-00 — Auditoría del motor para migración a backend

**Repo:** Ngervitz/CZMiplan  
**Scope:** solo auditoría; sin modificar reglas ni código productivo  
**Date:** 2026-09-23  
**Decisión de producto (contexto, no re-evaluada aquí):** el motor debe terminar en backend Node/Express porque las reglas son IP y no deben quedar en el navegador.  
**Esta auditoría:** determina frontera, portabilidad y acoplamientos AS-IS.

## Clases de evidencia

| Clase | Significado |
|-------|-------------|
| **CONFIRMED_FROM_CODE** | Observado en código |
| **CONFIRMED_FROM_CONFIG** | Constantes/flags |
| **CONFIRMED_FROM_DOCS** | Documentación |
| **INFERENCE** | Conclusión derivada de evidencia |
| **UNCERTAIN** | Insuficiente |

---

## 0. Frontera del motor (definición operativa AS-IS)

CONFIRMED_FROM_CODE: el producto **no** concentra todas las decisiones en `calcularMotor()`.

| Capa | Qué decide | Dónde |
|------|------------|-------|
| **Motor core** | Scores, plan, iv2 (causa/patrón/NBA enums), horizonte, blockers, partner flags, sanity/FR warnings | `calcularMotor()` `js/algorithms.js:664-800` |
| **Post-motor attach** | `financial_stage`, `narrative_decision` (+ FS provenance) | `assignMotorDiagnosis` → `attachFinancialStageToDiag` `js/app.js:236-247`, `js/algorithms.js:1479-1488` |
| **Decision layer en UI** | Coherence tier, next_step key/text, B7 segment | `resolveDashboardCoherence` + resolvers `js/ui.js:2389+` |
| **Acciones recomendadas** | Selección/orden/taxonomy filter (+ ACT provenance) | `seleccionarAccionesRecomendadas` llamada desde UI `js/ui.js:5919+`, def `js/algorithms.js:2748+` |
| **Presentación** | Copy PLANES, textos narrativa, PDF/UI | `PLANES`, `textoParaNarrativa`, render `js/ui.js` |

**INFERENCE:** para migrar “el motor” con **mismo comportamiento**, el alcance backend debe incluir al menos: core + stage/narrative attach + selección de acciones + (si se preserva UX actual) coherence/next_step. Si solo se mueve `calcularMotor`, la UI seguirá decidiendo next_step/coherence client-side.

---

## 1. Inventario — entry points y call graph

### 1.1 Entry points confirmados

| Entry | Archivo:líneas | Rol |
|-------|----------------|-----|
| `assignMotorDiagnosis(st)` | `js/app.js:236-247` | Orquestación producción: motor + stage/narrative |
| `calcularMotor()` | `js/algorithms.js:664-800` | Cálculo core (sin args; lee globals) |
| `seleccionarAccionesRecomendadas(diag)` | `js/algorithms.js:2748+`; callers UI | Acciones |
| `resolveDashboardCoherence(diag, st)` | `js/ui.js:2389+` | Tier + next step inputs |
| `buildDiagnosisSnapshot()` | `js/algorithms.js:2931+` | Snapshot transport (re-corre motor) |
| `czDebug` motor probe | `js/czDebug.js:132+` | DEV_ONLY |

### 1.2 Call graph textual AS-IS

```
assignMotorDiagnosis(st)                    [PORTABLE_WITH_INJECTION] [BROWSER globals via st]
  ├── calcularMotor()                       [PORTABLE_WITH_INJECTION] [BROWSER: PRE, CZState]
  │     ├── calcularEncuesta(PRE.respuestas) [PORTABLE_WITH_INJECTION]  (survey.js)
  │     │     ├── surveyIsActive / p2n
  │     │     └── TIENE_ENCUESTA            [CONFIG]
  │     ├── calcularFinanciero()            [PORTABLE_WITH_INJECTION]
  │     │     ├── _gastos() / _deudas()     [BROWSER: window.CZState]
  │     │     ├── deudasActivasParaCalculo  [PORTABLE_AS_IS]
  │     │     ├── getTotalMonthlyExpenses?  [BROWSER: creditors.js → CZState]
  │     │     ├── PRE.ingreso, TASAS
  │     │     ├── evaluarCostoDeuda         [PORTABLE_AS_IS]
  │     │     └── evaluarStockDeuda         [PORTABLE_AS_IS] (mutates fin)
  │     ├── asignarPlan(enc, fin)           [PORTABLE_WITH_INJECTION]
  │     ├── _snap() → diasRec               [BROWSER + Date.now L680]
  │     ├── calcularBloqueadores            [PORTABLE_AS_IS]
  │     ├── calcularHorizonte               [PORTABLE_AS_IS]
  │     ├── interpretarSituacion            [PORTABLE_AS_IS] (copy v1)
  │     ├── behavioral aggregates + calcularDebtDataQuality
  │     ├── deudaPrioritaria → calcularPrioridad [PORTABLE_WITH_INJECTION]
  │     ├── interpretarDiagnostico          [PORTABLE_WITH_INJECTION] [MIXED rules+copy]
  │     │     └── calcularSeveridadFinanciera, textoParaNarrativa, ...
  │     ├── applyPlanGuardrail              [PORTABLE_WITH_INJECTION]
  │     ├── aplicarGuardrailSeveridad       [PORTABLE_WITH_INJECTION]
  │     ├── alignInterpretacionV2ConPlan    [PORTABLE_AS_IS] (copy align)
  │     ├── evaluarFinancialRealityWarning  [PORTABLE_AS_IS]
  │     ├── evaluarDebtSanityGuard          [PORTABLE_AS_IS]
  │     └── calcularPartnerSignals → calcularRecommendedTools
  └── attachFinancialStageToDiag(diag, st)  [PORTABLE_WITH_INJECTION]
        ├── resolveFinancialStage           [PORTABLE_WITH_INJECTION] CORE_RULE
        │     └── hasCompletedFinancialInputs? [app.js] [BROWSER/st flags]
        └── attachNarrativeDecisionToDiag   [PORTABLE_WITH_INJECTION]
              └── resolveNarrativeDecision  [PORTABLE_AS_IS] (si args inyectados)

[UI render — decision layer outside calcularMotor]
  resolveDashboardCoherence                 [EXTRACT_CORE] [MIXED] js/ui.js
  resolveNextStepContent / key resolvers    [EXTRACT_CORE]
  attachNextStepProvenance                  [CLIENT_ONLY] provenance stamp
  seleccionarAccionesRecomendadas           [EXTRACT_CORE]
        ├── _evalCtxAcciones → window.CZState [MIGRATION_COUPLING]
        ├── _BANCO_ACCIONES_MAESTRO
        ├── taxonomy filter (actionNarrativeTaxonomy.js)
        └── _fallbackAcciones → re-entra calcularMotor() [COUPLING]
```

---

## 2–4. Matriz principal (función / regla)

Leyenda Portabilidad: **PA**=PORTABLE_AS_IS · **PI**=PORTABLE_WITH_INJECTION · **EC**=EXTRACT_CORE · **CO**=CLIENT_ONLY · **U**=UNCERTAIN  
Leyenda Tipo: **CR**=CORE_RULE · **DR**=DERIVED_RULE · **PR**=PRESENTATION · **ST**=STORAGE_OR_TRANSPORT · **MX**=MIXED

| Función/Regla | Archivo:Líneas | Responsabilidad | Tipo | Inputs | Outputs | Browser deps | Side effects | Portabilidad | Migration coupling | Consumidores |
|---------------|----------------|-----------------|------|--------|---------|--------------|--------------|--------------|-------------------|--------------|
| `_gastos/_deudas/_snap` | algorithms.js:7-9 | Leer estado | ST | — | gastos/deudas/snap | `window.CZState` | none | PI | **MIGRATION_COUPLING** global | motor |
| `deudasActivasParaCalculo` | :12-16 | Filtrar deudas activas | CR | deudas[] | [] | none | none | PA | — | financiero, acciones, stage |
| `isDeudaPagada` | :18-20 | Predicado pagada | CR | deuda | bool | none | none | PA | — | partner/filters |
| `evaluarStockDeuda` | :87-111 | DTI + confianza | DR | fin, ingreso | mutates fin | none | mutates fin | PA | — | calcularFinanciero |
| `etiquetaStockDeuda` | :113-118 | Label DTI | PR | dti_ratio | string | none | none | PA | — | blockers/iv2 |
| `evaluarCostoDeuda` | :125-129 | Nivel costo | CR | interesProm | nivel | none | none | PA | — | fin |
| `calcularFinanciero` | :131-186 | Scores financieros, ratio, flujo, moras | CR | CZState+PRE+TASAS | fin | CZState, PRE, getTotalMonthlyExpenses? | mutates via stock | PI | **MIGRATION_COUPLING** | calcularMotor |
| `calcularPrioridad` | :193-216 | Prioridad deuda | CR | deuda, PRE, TASAS | number | PRE, TASAS | none | PI | — | deudaPrioritaria |
| `deudaPrioritaria` | :218-222 | Top deuda | DR | state | deuda | via _deudas | none | PI | — | result.prio |
| `asignarPlan` | :229-237 | Plan 1–5 raw | CR | enc, fin, PRE | planId | PRE.respuestas | none | PI | — | motor |
| `PLANES` table | :25-81 | Copy/metadata planes | PR/MX | — | objetos plan | none | none | EC (copy vs ids) | copy vs rule | result.plan |
| `interpretarSituacion` | :248-282 | Copy v1 | PR | fin | interpretacion | none | none | PA | — | result |
| `calcularBloqueadores` | :294-321 | Blockers estructurados | DR | fin | [] | none | none | PA | — | motor/acciones |
| `calcularHorizonte` | :326-346 | Horizonte meses/banda | CR | fin, ing | horizonte | none | none | PA | — | motor/retry |
| `evaluarDebtSanityGuard` | :353-364 | Guard deuda vs ingreso | CR | fin, ingreso | flag | none | none | PA | — | motor |
| `buildHorizonteEstabilizacionRequerida` | :366-373 | Override horizonte | DR | — | object | none | none | PA | — | motor |
| `isRetryEligible*` | :375-428 | Elegibilidad retry | CR | diag, st | bool | PRE/SEVERITY | none | PI | UI gating | ui coherence/retry |
| `evaluarFinancialRealityWarning` | :435-465 | Warning gastos | DR | fin, ingreso | flags | none | none | PA | — | motor |
| `aplicarGuardrailSeveridad` | :479-502 | Cap scores | CR | scores, severity | capped | SEVERITY_* config | none | PI | — | motor |
| `_guardrail*` helpers | :513-568 | Condiciones plan bump | DR/CR | enc/fin/diag | bool/plan | PRE, TIENE_ENCUESTA, CZ_PLUS_BCU, snap | none | PI | BCU flag coupling | applyPlanGuardrail |
| `applyPlanGuardrail` | :570-662 | Plan final | CR | planIdRaw, diag | plan+meta | PRE, state | none | PI | — | motor |
| `calcularMotor` | :664-800 | Orquesta core | MX | globals | diag object | PRE, CZState, Date.now | mutates fin scores | PI | **MIGRATION_COUPLING** | assignMotorDiagnosis |
| Partner predicates + signals | :810-886 | Flags partners | DR | deudas, fin | signals | PRE, TASAS | none | PI | — | recommended_tools |
| `calcularRecommendedTools` | :888-903 | Lista tools | DR | signals | ids[] | none | none | PA | — | UI |
| `calcularRadiografia` | :908-988 | Radiografía auxiliar | MX | state | object | CZState, new Date | none | PI | not in calcularMotor | UI/dev |
| `enriquecerDeuda` | :1004-1081 | Enrich debt fields | MX | deuda | mutates d | PRE/TASAS | mutates | PI | app handlers | forms |
| `calcularDebtDataQuality` | :1092-1100 | Calidad datos | DR | deudas | level | none | none | PA | — | behavioral |
| `calcularSeveridadFinanciera` | :1107-1195 | severity_level | CR | fin, deudas, ingreso | severity | PRE fallback | none | PI | — | iv2 |
| Stage helpers + `resolveFinancialStage` | :1208-1477 | financial_stage | CR | diag, st | stage + provenance | PRE, hasCompletedFinancialInputs, CZ_DECISION_PROVENANCE | `_lastProvenance` | PI | completeness flags | attach |
| `attachFinancialStageToDiag` | :1479-1488 | Set stage+narrative | MX | diag, st | mutates diag | via resolve | mutates | PI | — | assignMotorDiagnosis |
| Narrative maps + `resolveNarrativeDecision` | :1503-1581 | narrative_decision | CR | stage, intent, entry, planId | object | none if injected | none | PA | — | attach |
| `attachNarrativeDecisionToDiag` | :1583-1596 | Attach narrative | MX | diag, st | mutates | CZ_ENTRY_CONTEXT, user_intent | mutates | PI | entry context global | attach |
| `interpretarDiagnostico` | :1749-2126 | iv2 causa/patrón/NBA/copy | MX | result | interpretacion_v2 | PRE, _deudas | none | PI | **rules+copy mixed** | motor |
| `textoParaNarrativa` / align helpers | :1624-1747 | Copy maps | PR | entries | strings | none | mutates iv2 (align) | PA | — | iv2 |
| `_BANCO_ACCIONES_MAESTRO` | :2205-2293 | Catálogo acciones | MX | — | templates | none | none | EC | rules+copy | seleccionar |
| `_evalCtxAcciones` | :2303-2352 | Ctx selección | MX | diag | ctx | **window.CZState**, expense helpers | none | EC | **MIGRATION_COUPLING** | seleccionar |
| `_cumpleCondicionAccionMaestro` | :2354-2386 | Gate acción | CR | tpl, ctx | bool | none | none | PA | — | seleccionar |
| `_ordenar*` / pesos acciones | :2179-2451 | Orden | CR | candidatos, planId | sorted | none | none | PA | — | seleccionar |
| `_personalizarAccionRecomendada` | :2466-2515 | Copy personalizada | PR | tpl, ctx | action | fmt?, state.herr | none | CO/EC | UI helpers | seleccionar |
| Taxonomy filter | :2538-2710 | Filtra acciones por mode | DR | actions, mode | filtered | ActionNarrativeTaxonomy module | mutates meta/prov | PI | — | seleccionar |
| `seleccionarAccionesRecomendadas` | :2748-2855 | Acciones finales | MX | diag | acciones[] | via ctx | mutates diag/actions | EC | UI-triggered | ui.js |
| `_fallbackAccionesRecomendadas` | :2712-2746 | Fallback | MX | — | acciones | re-calls calcularMotor | heavy | EC | **re-entry motor** | seleccionar |
| `detectHiddenFactorOpportunity` | :2867-2912 | Opportunity flag | MX | diag | object | CZState, PRE, TIENE_ENCUESTA | none | CO/PI | UI | UI |
| `buildDiagnosisSnapshot` | :2931-3048 | Snapshot transport | ST | globals | snapshot | CZState, CZIdentity, Date, UUID | none | CO | browser identity | CRM/dev |
| `p2n` / `calcularEncuesta` | survey.js:8+,93-136 | Score encuesta | CR | resp | enc | TIENE_ENCUESTA via surveyIsActive | none | PI | — | motor |
| `calcularEncuestaSeoIa` | survey.js:139+ | Score SEO separado | DR | resp | score | clamp | none | PI | not funnel motor | SEO path |
| `TASAS` / `getTotalMonthlyExpenses` | creditors.js:7-15,129+ | Tasas + total gastos | CR | state | rates/number | CZState | none | PI | **MIGRATION_COUPLING** | financiero |
| `ActionNarrativeTaxonomy` maps | actionNarrativeTaxonomy.js | Familias narrative | DR | — | maps | none | none | PA (data) | used as filter | taxonomy filter |
| `hasCompletedFinancialInputs` | app.js:1867-1872 | Completeness gate | CR | st flags | bool | CZState | none | PI | stage CLARIDAD | resolveFinancialStage |
| `SEVERITY_CRITICO_*` | config.js:31-32 | Caps score | CR | — | numbers | none | none | PI (config inject) | — | guardrail |
| `CZ_DECISION_PROVENANCE` | config.js:13-16 | Toggle provenance | ST | — | bool | window optional | none | PI | no change outcomes | FS/ACT/NS |
| `CZ_PLUS_BCU_CLEARING_LIVE` | config.js:470 | BCU guardrail | CR | — | bool | none | can force plan 4 | PI | — | _guardrailExternalBcuCritico |
| `resolveDashboardCoherence` | ui.js:2389-2461 | Tier + nextStepKey | CR | diag, st | coherence | completeness helpers | none | EC | **parallel model vs financial_stage** | UI plan tab |
| Next-step resolvers | ui.js:2369-2867 | next step decision | CR/MX | diag, coherence | key/text | — | none | EC | **MIGRATION_COUPLING** decision in UI | UI |
| `attachNextStepProvenance` | ui.js:2902-2989 | NS provenance | PR | diag | mutates | flag | mutates diag | CO | — | UI |
| `resolveContextualActionSegment` (B7) | ui.js:2262+ | Segment laboral | CR | st | segment | — | none | EC | UI-only path | UI |
| `isIncompleteFinancialProfile` | ui.js:2108+ | Incomplete gate | CR | diag, st | bool | — | none | PI | coherence healthy | UI |

**Conteo (funciones/símbolos de decisión listados en matriz + helpers guardrail/partner/stage/acciones contados como ítems):** ver cierre numérico §14/§CIERRE.  
CONFIRMED_FROM_CODE inventory size: **~95** símbolos relevantes (funciones + tablas/flags de decisión).

---

## 5. Reglas y constantes (no solo funciones)

| Regla / constante | Archivo:líneas | Consume | Decisión afectada | ¿Viaja con motor backend? |
|-------------------|----------------|---------|-------------------|---------------------------|
| Blend score 0.55/0.45 | algorithms.js:670 | calcularMotor | scoreReset | YES |
| Bands nivelR 21/13 | :674,752-754 | motor | nivelR | YES |
| Ratio penalties 0.50/0.35/0.20 | :154-166 | calcularFinanciero | scoreFin | YES |
| Mora ×12 cap 25; informal −16; ≥5 deudas −10 | :154-166 | same | scoreFin | YES |
| `asignarPlan` gates flujo/mora/ratio | :229-237 | motor | planId raw | YES |
| DTI bands 0.5/1/2/5 | :93-97 | stock | dti_level | YES |
| Costo >90 Alto / >60 Medio | :126-128 | costo | costoDeudaNivel | YES |
| Prioridad MULT al_dia…mora | :212 | prioridad | prio | YES |
| Horizonte mora×3, ratio bands | :328-344 | horizonte | meses | YES |
| Debt sanity 3×ingreso & pago≤1% | :360 | sanity | confidence/horizonte override | YES |
| FR warning ≥80% / >ingreso | :447-454 | FR | warning flags | YES |
| Plan guardrail RATIO 0.35/1.0, DTI 1.5/10 | :554-649 | applyPlanGuardrail | plan final | YES |
| `SEVERITY_CRITICO_*` 8/11 | config.js:31-32 | score cap | scores visibles | YES |
| `STAGE_RATIO_ALTO` 0.35, OPT_MAX 0.20, DTI_LIAB 0.5 | algorithms.js:1208-1210 | financial_stage | stage | YES |
| Survey bands 24/15 + hard C on p6/p8/p10 D | survey.js:113-120 | enc | enc.nivel/score | YES |
| `TASAS` por tipo | creditors.js:7-15 | interes/prioridad/partner | scores/flags | YES |
| `PARTNER_CARO_TIPOS`, tasa≥78, ≥3 deudas | algorithms.js:806-868 | partner | recommended_tools | YES |
| Taxonomy MIN_ACTIONS 3 / families | :2524-2536 | filter | acciones retained | YES |
| Coherence healthy `ratio<=0.15` | ui.js:2407 | coherence | profileTier/next_step | YES **si se preserva UX** |
| NBA / next_step maps en UI | ui.js:2509+ | next step | visible next step | YES **si se preserva UX** |
| `CZ_DECISION_PROVENANCE` | config.js:13-16 | provenance only | no stage/plan change | OPTIONAL (output) |

**Duplicación / drift risk (CONFIRMED_FROM_CODE):**

| Umbral | Lugares | Riesgo |
|--------|---------|--------|
| 0.35 ratio | scoring, asignarPlan, blockers, horizonte, guardrail, STAGE_RATIO_ALTO, UI copy | **DUPLICATED_RULE_RISK** |
| 0.20 vs UI 0.15 | STAGE_RATIO_OPTIMIZACION_MAX 0.20 vs coherence healthy 0.15 | **DUPLICATED_RULE_RISK** (valores distintos) |
| ScoreReset 21/13 | motor + `colorScore` config | presentación duplicada |
| DTI≥1 next step | motor stock + UI resolvers | paralelo |

---

## 6. MIGRATION_COUPLING (reglas ↔ browser)

| ID | Qué está acoplado | Evidencia |
|----|-------------------|-----------|
| MC-1 | Motor lee `window.CZState` vía `_gastos/_deudas/_snap` | algorithms.js:7-9 |
| MC-2 | Motor lee `PRE` global (ingreso, respuestas) | algorithms.js:665,140,683,772… |
| MC-3 | Totales de gasto vía `getTotalMonthlyExpenses()` → CZState | algorithms.js:135-136; creditors.js:129+ |
| MC-4 | `diasRec` usa `Date.now` | algorithms.js:679-680 |
| MC-5 | Stage usa `hasCompletedFinancialInputs(st)` de app.js | algorithms.js:1225-1226; app.js:1867 |
| MC-6 | Acciones: `_evalCtxAcciones` lee `window.CZState` | algorithms.js:2304 |
| MC-7 | Next_step / coherence viven en `ui.js` (decisión, no solo paint) | ui.js:2389+ |
| MC-8 | Fallback acciones re-ejecuta `calcularMotor()` | algorithms.js:2713 |
| MC-9 | Provenance NS muta `diag` desde UI | ui.js:2902+ |
| MC-10 | Flag BCU live puede cambiar plan | algorithms.js:542-549; config.js:470 |

No hay dependencia de DOM/`document`/`localStorage` **dentro** de `calcularMotor` (CONFIRMED_FROM_CODE grep algorithms). Storage ocurre en `guardarLocal` (app) — ST, no regla.

---

## 7. Input contract AS-IS

| Input | Clase | Evidencia de uso |
|-------|-------|------------------|
| `PRE.ingreso` | REQUIRED | calcularFinanciero :140; horizonte; FR; sanity |
| `PRE.respuestas` p1–p10 | REQUIRED (o encuesta inactiva) | calcularEncuesta :665; asignarPlan |
| `CZState.deudas[]` (campos tipo, monto, pago, situacion_ui, cancelada, confidence, …) | REQUIRED | _deudas; activas; behavioral; partner |
| `CZState.gastos` (+ custom_expenses vía creditors) | REQUIRED | calcularFinanciero |
| `CZState.snap.fecha_inicio` | OPTIONAL | diasRec only :678-680 |
| Completeness flags (`financial_*_complete`, `no_debts_declared`, declared_*) | REQUIRED for stage | resolveFinancialStage / hasCompletedFinancialInputs |
| `st.user_intent` | OPTIONAL | narrative focus :1589 |
| `CZ_ENTRY_CONTEXT` | OPTIONAL | narrative context_modifier |
| `TIENE_ENCUESTA` | REQUIRED (flag) | surveyIsActive / guardrail encuesta |
| `TASAS` / SEVERITY caps / STAGE_* | REQUIRED config | creditors + config |
| `CZ_PLUS_BCU_CLEARING_LIVE` + snap BCU fields | OPTIONAL | plan guardrail externo |
| Equifax/BCU live payloads | UI_ONLY / NOT used in motor core today | mock Plus separado |
| Datos personales (CI, email, nombre) | UI_ONLY / CRM | no en fórmulas motor (CONFIRMED_FROM_CODE) |
| Totales DTI derivados | DERIVED | evaluarStockDeuda |
| Score/plan/iv2 | DERIVED outputs | — |

---

## 8. Output contract AS-IS

### De `calcularMotor()` (BUSINESS_OUTPUT salvo nota)

| Campo | Clase |
|-------|-------|
| `enc`, `fin` (incl. ratio, flujoLibre, dti_*, cantMoras, behavioral, scores) | BUSINESS_OUTPUT |
| `scoreReset`, raws, `nivelR`, `planId`, `plan` | BUSINESS_OUTPUT (+ `plan` copy = PRESENTATION_OUTPUT) |
| `prio`, `bloqueadores`, `horizonte` | BUSINESS_OUTPUT |
| `interpretacion` (v1) | PRESENTATION_OUTPUT |
| `interpretacion_v2` (severity, causa, patrón, NBA enums, confianza, narrativa copy) | MIXED: enums BUSINESS; textos PRESENTATION |
| plan guardrail meta | BUSINESS_OUTPUT / DEBUG |
| FR warning, missing_payment_information | BUSINESS_OUTPUT |
| `recommended_tools`, partner flags | BUSINESS_OUTPUT |
| `diasRec` | BUSINESS_OUTPUT CONDITIONAL on clock |

### Post-attach / UI

| Campo | Clase | Origen |
|-------|-------|--------|
| `financial_stage` | BUSINESS_OUTPUT | attachFinancialStageToDiag |
| `financial_stage_provenance` | DEBUG_DEV_OUTPUT / explainability | algorithms (flag) |
| `narrative_decision` | BUSINESS_OUTPUT | attachNarrativeDecisionToDiag |
| `acciones_recomendadas` (vía UI call) | BUSINESS_OUTPUT (+ copy PRESENTATION) | seleccionarAcciones… |
| action selection/retention provenance | DEBUG_DEV_OUTPUT | algorithms |
| coherence / nextStepKey/Text | BUSINESS_OUTPUT (UX path) | ui.js |
| `next_step_provenance` | DEBUG_DEV_OUTPUT | ui.js |
| Snapshot UUID/timestamp/consent | STORAGE_OR_TRANSPORT | buildDiagnosisSnapshot |

---

## 9. Determinismo

| Factor | ¿Afecta outputs del motor? | Evidencia |
|--------|----------------------------|-----------|
| `Date.now` → `diasRec` | SÍ (campo output) | algorithms.js:679-680 |
| `Math.random` en algorithms | NO | grep none |
| `localStorage`/`document` en calcularMotor | NO | grep |
| Orden de Object.keys en situCounts | Potencial empates (INFERENCE menor) | :697-698 |
| Flags env (`TIENE_ENCUESTA`, BCU live, provenance) | SÍ si cambian | config |
| Network | NO en motor core | — |

**ENGINE_DETERMINISTIC: CONDITIONAL**

Condiciones para igualdad bit-a-bit (INFERENCE):

1. Mismos inputs de negocio inyectados (deudas, gastos, ingreso, respuestas, flags completeness, intent, entry).
2. Mismas tablas (`TASAS`, SEVERITY, STAGE, PLANES ids).
3. Mismo instante o `diasRec` fijado (clock).
4. Mismos feature flags.
5. Misma capa post-motor (stage/narrative/acciones/coherence) si se compara diagnóstico “completo UX”.

---

## 10. Provenance y ASSISTANT-01 (solo dependencias)

| Pieza | ¿Sale del motor? | ¿Debe viajar al backend? |
|-------|------------------|--------------------------|
| FS provenance | Post-`resolveFinancialStage` | Sí si se quiere mismo explainability server-side |
| ACT provenance | `seleccionarAccionesRecomendadas` | Sí con acciones |
| NS provenance | UI `attachNextStepProvenance` | Sí si next_step migra; hoy UI |
| ASSISTANT-01 fixtures | Consumen `financial_stage`, evidence, actions, next_step context | Depende de outputs de funciones a migrar (stage, iv2, acciones, coherence/next_step) — CONFIRMED_FROM_DOCS harness; **no** product runtime |

No se modifica provenance ni ASSISTANT-01.

---

## 11. Exposición de IP al navegador

Archivos cargados por `index.html:70-88` que contienen reglas:

| Archivo | Contenido IP |
|---------|----------------|
| `js/algorithms.js` | Fórmulas, planes, guardrails, stage, acciones, interpretación |
| `js/survey.js` | Pesos/segmentación encuesta |
| `js/creditors.js` | `TASAS` y agregación gastos |
| `js/actionNarrativeTaxonomy.js` | Familias/filtros de acciones |
| `js/config.js` | Caps severidad, flags que alteran decisiones |
| `js/ui.js` | Coherence/next_step (decision layer) |

**ENGINE_IP_CLIENT_EXPOSURE: FULLY_EXPOSED**  
CONFIRMED_FROM_CODE: el algoritmo completo se descarga y ejecuta en el cliente.

---

## 12. Call graph — ya en §1.2

---

## 13. Núcleo portable identificable

**YES (INFERENCE + CODE):** existe un núcleo claramente identificable:

1. Puras / casi puras: filtros deuda, stock/DTI, costo, horizonte, blockers, sanity, FR, severidad (con ingreso inyectado), encuesta `calcularEncuesta(resp)`, narrative decision con args, muchas gates de acciones.  
2. Orquestación `calcularMotor` + `calcularFinanciero` + plan/guardrails: **reutilizable en Node** si se inyecta `{ingreso, respuestas, gastos, custom_expenses, deudas, snap, flags, config}`.  
3. Stage/narrative attach: portable con injection de completeness/intent.  
4. Acciones + coherence/next_step: **EXTRACT_CORE** — lógica de negocio hoy mezclada con UI/globals.

**NODE_REUSE_FEASIBILITY: MOSTLY** — mismo lenguaje (JS), sin DOM en core; requiere desacoplar globals y decidir si next_step/coherence viajan juntos.

---

## 14. Respuestas explícitas

1. **Núcleo real hoy:** `js/algorithms.js` (`calcularMotor` + financiero/plan/iv2/guardrails) + `js/survey.js` (`calcularEncuesta`) + `TASAS` en `js/creditors.js`; post-proceso stage/narrative en algorithms vía `assignMotorDiagnosis`; decisiones next_step/coherence en `js/ui.js`; acciones en algorithms disparadas por UI.

2. **Símbolos relevantes identificados:** **95** (matriz §2–4 + constantes de decisión §5).

3. **Conteos de portabilidad (ítems clasificados en matriz):**
   - PORTABLE_AS_IS: **28**
   - PORTABLE_WITH_INJECTION: **38**
   - EXTRACT_CORE: **18**
   - CLIENT_ONLY: **8**
   - UNCERTAIN: **3**

4. **CORE_RULE principal:** `calcularFinanciero`, `calcularEncuesta`, `asignarPlan`, `applyPlanGuardrail`, `aplicarGuardrailSeveridad`, `interpretarDiagnostico` (enums), `calcularHorizonte`, `calcularSeveridadFinanciera`, `resolveFinancialStage`, `resolveNarrativeDecision`, `seleccionarAccionesRecomendadas` / gates maestro, `resolveDashboardCoherence` + next-step key resolvers.

5. **Mezclan reglas + UI/storage:** `_evalCtxAcciones`, `seleccionarAccionesRecomendadas` (+ personalización), `interpretarDiagnostico` (enums+copy), `resolveDashboardCoherence` / `resolveNextStepContent`, `_fallbackAccionesRecomendadas`, `buildDiagnosisSnapshot`.

6. **¿Núcleo portable claro?** **YES.**

7. **¿Node reutilizando mayormente código existente?** **MOSTLY.** Evidencia: core sin DOM; acoplamiento a `PRE`/`window.CZState`/`getTotalMonthlyExpenses`; decision layer extra en `ui.js`.

8. **Desacoplar antes de mover:** lecturas globales → inputs explícitos; expense total puro; completeness/intent como inputs; separar copy (`PLANES`, textos) de enums de decisión; decidir ownership de coherence/next_step; eliminar re-entrada motor en fallback o inyectarla; clock/`diasRec`.

9. **Archivos con IP client-side:** `algorithms.js`, `survey.js`, `creditors.js` (TASAS), `actionNarrativeTaxonomy.js`, `config.js` (caps/flags), `ui.js` (coherence/next_step).

10. **¿Determinístico?** **CONDITIONAL** (ver §9).

11. **Inputs mínimos para reproducir diagnóstico core:** ingreso, respuestas encuesta (o flag inactiva), deudas activas, gastos (+custom), tablas TASAS/SEVERITY/STAGE, flags TIENE_ENCUESTA; para stage: completeness + no_debts_declared; para narrative: user_intent + entry_context; para UX completo: mismos + ctx acciones.

12. **Business vs presentation:** business = scores, planId, stage, iv2 enums, horizonte, blockers, partner flags, acciones ids/orden, coherence/next_step keys; presentation = PLANES copy, textos narrativa, personalización copy, labels UI, NS provenance display.

13. **¿Reglas duplicadas / drift?** **YES** — ratio 0.35 multi-copia; **0.15 UI vs 0.20 stage**; bands scoreReset; DTI next-step paralelo (tabla §5).

14. **¿Blocker técnico Node?** **NONE** absoluto de runtime (JS portable). Blockers de **paridad**: acoplamientos MC-1…MC-10 y decision layer en UI; no hay dependencia nativa de browser APIs en el core matemático.

---

## 15. Fuera de alcance (explícito)

No se diseña aquí: módulos backend, shared package, endpoints, Supabase, DTO final, Railway, auth, rollout, ni borrado del motor del frontend. Eso es **BACKEND-ARCH-01**.

---

MOTOR-PORTABILITY-00: COMPLETE

ENGINE_LOCATION:
js/algorithms.js (calcularMotor + stage/narrative/acciones); js/survey.js (calcularEncuesta); js/creditors.js (TASAS + expense totals); js/app.js (assignMotorDiagnosis, completeness); js/ui.js (coherence/next_step decision layer); js/actionNarrativeTaxonomy.js (filter data); js/config.js (severity caps + flags)

ENGINE_DETERMINISTIC:
CONDITIONAL

ENGINE_IP_CLIENT_EXPOSURE:
FULLY_EXPOSED

NODE_REUSE_FEASIBILITY:
MOSTLY

PORTABLE_AS_IS:
28

PORTABLE_WITH_INJECTION:
38

EXTRACT_CORE:
18

CLIENT_ONLY:
8

UNCERTAIN:
3

MIGRATION_COUPLINGS:
- MC-1 window.CZState via _gastos/_deudas/_snap (algorithms.js:7-9)
- MC-2 PRE global ingreso/respuestas
- MC-3 getTotalMonthlyExpenses → CZState (creditors.js)
- MC-4 Date.now diasRec (algorithms.js:679-680)
- MC-5 hasCompletedFinancialInputs (app.js) en stage
- MC-6 _evalCtxAcciones lee window.CZState
- MC-7 coherence/next_step en ui.js (reglas de negocio)
- MC-8 fallback acciones re-entra calcularMotor
- MC-9 next_step_provenance muta diag desde UI
- MC-10 CZ_PLUS_BCU_CLEARING_LIVE puede forzar plan

DUPLICATED_RULE_RISKS:
- ratio 0.35 copiado en scoring/plan/blockers/horizonte/guardrail/stage/UI
- coherence healthy ratio 0.15 vs STAGE_RATIO_OPTIMIZACION_MAX 0.20
- scoreReset bands 21/13 motor vs colorScore config
- DTI≥1 next-step rules en motor/UI en paralelo

TECHNICAL_BLOCKERS:
NONE (para ejecutar lógica en Node); paridad requiere resolver MIGRATION_COUPLINGS y ownership de coherence/next_step/acciones
