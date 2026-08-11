# FINDINGS — PROV-NS ETAPA 1

**Initiative:** DECISION-PROVENANCE-01  
**Phase:** PROV-NS — Etapa 1 (audit only)  
**Date:** 2026-08-11  
**HEAD at audit start:** `38d1dc5` (PROV-ACT closed)  
**Production code changes:** NONE

---

## A. Executive conclusion

```text
PROV-NS ETAPA 1: COMPLETE
```

The live `next_step` pipeline is **not** a single calculation. It is a layered chain of tables + if/else branches. The conceptual map `L0→L1→L2→L3→tone` is **directionally correct** but **incomplete**:

1. **L3 is a decisional writer**, not only a content resolver — `_nextStepActionKeyForNarrative` can **replace** L0/L1/L2 keys.
2. A **display-routing layer (L4)** decides whether Primary Action Card or Hero embedded text is user-visible; those paths can consume **different writers**.
3. **Tone** claims not to change `actionKey` but can swap displayed copy to another action’s known text → **MIXED**.

Final user-visible next step (complete profile, Primary renders):

```text
resolveNextStepContent(diag, st, coherence).text
  → renderPrimaryActionCard (“Tu prioridad hoy”)
```

Hero embedded next-step is suppressed when Primary owns the surface (UX-CONSOLIDATION-01).

---

## B. Validated Decision Map

```text
INPUTS (deterministic)
  fin / planId / st completeness / interpretacion_v2
  financial_stage → narrative_decision (mode, profile_tier, focus_target)
  plan_guardrail_reason (when stamped)
        ↓
[L0 Motor NBA]  interpretarDiagnostico()
  NBA_MAP[causa] + severity/dti/critico overrides
  → iv2.next_best_action (+ narrativa_jerarquizada.siguiente_paso)
        ↓  crea / condiciona / reemplaza (interno)
[L1 Key]  _resolveNextStepKeyFromDiag()
  zero-active-debt | dti≥1 | iv2.next_best_action | narrativa.accion | ordenar_panorama
        ↓  transforma (early returns) | preserva NBA
[L2 Coherence]  resolveDashboardCoherence()
  healthy_organized → optimizar_deuda_cara | mantener_disciplina   [REEMPLAZA]
  ingreso_cero     → revisar_ingresos                              [REEMPLAZA]
  else             → L1 key + legacy text                          [PRESERVA + presenta]
        ↓
[L3 Resolve]  resolveNextStepContent()
  branch order (mutually exclusive first-match):
    1. no narrative_mode → legacy (coherence text/key)             [PRESERVA L2 / presenta]
    2. focus≠DEFAULT && narrative base.text → narrative key/text   [REEMPLAZA L2]
    3. _coherenceOverridesNextStep → coherence key/text            [PRESERVA/REEMPLAZA vía L2]
    4. narrative base.text → narrative key/text                    [REEMPLAZA L2 a menudo]
    5. fallback coherence/legacy                                   [PRESERVA L2]
        ↓
[L3b Tone]  _applyNextStepNarrativeProfileTierTone()
  may replace TEXT with another known action copy; actionKey unchanged
        ↓  solo presenta | MIXED (copy can imply another action)
[L4 Display]  Primary vs Hero ownership
  Primary owns when complete + non-empty resolveNextStepContent.text
  else Hero: _resolveHeroNextActionText prefers coherence.nextStepText
  incomplete: neither Primary next-step nor Hero next-step (Paso prioritario CTA)
        ↓
FINAL USER-VISIBLE NEXT STEP
  Primary: resolveNextStepContent.text (+ actionKey for navigation semantics)
  OR Hero embedded text (rare when Primary absent)
  OR no next-step copy (incomplete)
```

**Corrections vs prior conceptual map**

| Prior assumption | Validated reality |
| ---------------- | ----------------- |
| L3 only “resolves” content from prior key | L3 **selects** key via `_nextStepActionKeyForNarrative` |
| tone is purely presentational | Tone can swap to another action’s **known text** while keeping key → MIXED |
| Single final surface | Primary vs Hero can diverge; incomplete suppresses next-step |
| L2 healthy_organized always wins | Only when L3 coherence-override branch fires (`OPTIMIZATION`+`DEFAULT` or `revisar_ingresos`). Non-DEFAULT focus **beats** healthy_organized |

**Related but NOT next_step writers**

- `resolveNarrativeDecision` / `attachNarrativeDecisionToDiag` — inputs to L3, not next_step itself
- `actionNarrativeTaxonomy.getNextStepNarrativeFamilies` — metadata families only
- Tab “Acción prioritaria” — gated by `hideAccionPrioritaria: true` always → not user-visible

---

## C. Writer Inventory

| Layer | Archivo | Función | Input | Output | Condición | Puede sobrescribir | Qué sobrescribe | Precedencia | Semántica o presentación | Evidencia |
| ----- | ------- | -------- | ----- | ------ | --------- | -----------------: | --------------- | ----------- | ------------------------ | --------- |
| L0 | `js/algorithms.js` | `interpretarDiagnostico` NBA block | `causa_principal`, severity, `dti_ratio`, flujo | `iv2.next_best_action` | always in motor | crea | — | 1 | DECISIONAL | ~1968–2057 |
| L0b | `js/algorithms.js` | `textoParaNarrativa` + narrativa fill | NBA entry | `siguiente_paso.texto` | after NBA | no key | copy for legacy | 1b | PRESENTATIONAL (copy for key) | ~1691+, ~2096 |
| L1 | `js/ui.js` | `_resolveNextStepKeyFromDiag` | diag, st | action key | always when called | sí | L0 if zero-debt / dti | 2 | DECISIONAL | 2369–2382 |
| L2 | `js/ui.js` | `resolveDashboardCoherence` | fin, planId, confidence, guardrail | `nextStepKey`+`nextStepText`+tier | healthy / ingreso_cero / else | sí (healthy, ingreso_cero) | L1 | 3 | MIXED (key+copy) | 2389–2461 |
| L3 | `js/ui.js` | `_nextStepActionKeyForNarrative` | mode, focus, fin, iv2, st | action key or null | CLARITY/RECOVERY/STAB/OPT | sí | L0–L2 when L3 uses it | 4a | DECISIONAL | 2509–2534 |
| L3 | `js/ui.js` | `_nextStepTextForActionKey` | actionKey, narrativa | text | lookup | no | — | 4b | PRESENTATIONAL | 2537–2554 |
| L3 | `js/ui.js` | `_sanitizeNextStepFocusTarget` | mode, focus | sanitized focus | always in L3 narrative | transforma focus | raw focus | 4pre | SEMANTIC_TRANSFORM (focus only) | 2488–2507 |
| L3 | `js/ui.js` | `_coherenceOverridesNextStep` | coherence, mode, focus | bool | revisar_ingresos \| healthy+OPT+DEFAULT | gate | — | 4gate | DECISIONAL gate | 2594–2600 |
| L3 | `js/ui.js` | `resolveNextStepContent` | diag, st, coherence | `{text,actionKey,source,…}` | orchestrator | sí | L2 (often) | 4 | MIXED | 2603–2664 |
| L3b | `js/ui.js` | `_applyNextStepNarrativeProfileTierTone` | text, narrative profile_tier, mode, focus | text | AT_RISK+RECOVERY / HEALTHY+OPT+DEFAULT | text only | prior text | 5 | MIXED | 2562–2577 |
| L2-legacy text | `js/ui.js` | `_resolveDashboardNextStepTextLegacy` | diag, st | text/null | incomplete→null; zero-debt; dti; narrativa | no key | — | used by L2 else | PRESENTATIONAL | 2580–2591 |
| L4 | `js/ui.js` | `_willRenderPrimaryActionCard` | diag, st, coherence | bool | incomplete→false; empty text→false | n/a | surface choice | 6 | PRESENTATIONAL routing | 3978–3998 |
| L4 | `js/ui.js` | `renderPrimaryActionCard` | resolveNextStepContent | HTML | complete + text | n/a | — | 6a FINAL | PRESENTATIONAL | 4001+ |
| L4 | `js/ui.js` | `_resolveHeroNextActionText` | coherence first, else resolve | text | incomplete→null | sí (source choice) | may ignore L3 key path | 6b alt | MIXED routing | 3881–3886 |
| L4 | `js/ui.js` | `_renderDashboardHeroCard` | suppress if Primary | HTML | UX consolidation | n/a | suppresses hero next-step | 6c | PRESENTATIONAL | 3944–3974 |

---

## D. Decision vs Presentation

| Layer / writer | Classification |
| -------------- | -------------- |
| L0 NBA | DECISIONAL |
| L0 narrativa texto | PRESENTATIONAL |
| L1 key | DECISIONAL |
| L2 coherence key branches | SEMANTIC_OVERRIDE (healthy, ingreso_cero) / DECISIONAL |
| L2 coherence text | PRESENTATIONAL (bundled with override) → overall MIXED |
| L3 narrative key map | DECISIONAL |
| L3 resolve orchestration | MIXED |
| L3b tone | MIXED (comment says tone-only; can inject another action’s copy) |
| L4 Primary/Hero routing | PRESENTATIONAL (routing) with MIXED risk when Hero prefers coherence over L3 |

**Where semantic decision ends (Primary path):**  
After `resolveNextStepContent` returns `{actionKey, text}` **post-tone**.  
Tone may still alter the **meaning implied by copy** without changing `actionKey`.

**Pure presentation after that:** HTML wrappers, labels (“Tu prioridad hoy”), Hero suppress flag.

---

## E. Precedence Map

| Orden | Layer / writer | Puede reemplazar anterior | Condición | Resultado |
| ----- | -------------- | ------------------------: | --------- | --------- |
| 1 | L0 NBA_MAP | crea | causa_principal | base NBA |
| 1a | L0 severity critico | sí | severity_level===critico (early) | estabilizar_atraso |
| 1b | L0 dti≥1 | sí | dti_ratio≥1 | confirmar_saldo_stock_deuda |
| 1c | L0 critico re-apply | sí | after confidence block | estabilizar_atraso |
| 2 | L1 zero-active-debt | sí | complete zero active debt | mantener_disciplina |
| 2a | L1 dti≥1 | sí | dti≥1 | confirmar_saldo_stock_deuda |
| 2b | L1 else | no | iv2 NBA / narrativa | preserve L0 |
| 3 | L2 healthy_organized | sí | tier healthy (plan 1–3, ratio≤0.15, …, conf≠low) | optimizar \| mantener + fixed text |
| 3a | L2 ingreso_cero | sí | plan_guardrail_reason==="ingreso_cero" | revisar_ingresos |
| 3b | L2 else | no | — | L1 + legacy text |
| 4 | L3 focus≠DEFAULT + base | **sí** | narrative focus sanitized ≠ DEFAULT | narrative key **beats L2** |
| 4a | L3 coherence override | sí | revisar_ingresos \| healthy+OPT+DEFAULT | L2 key/text |
| 4b | L3 narrative DEFAULT base | sí | base.text | narrative key (often ≠ L2) |
| 4c | L3 fallback | no | — | L2/legacy |
| 5 | L3b tone | text only | AT_RISK/HEALTHY heuristics | may change copy |
| 6 | L4 Primary | n/a | complete + text | **FINAL** for typical UX |
| 6alt | L4 Hero | may show L2 text | Primary absent | alt FINAL |

**Precedence is procedural** (code order / first matching branch), not a separate priority table.

**Critical interaction:** L2 `healthy_organized` does **not** win against L3 when `focusTarget !== "DEFAULT"` (e.g. STABILIZATION → `BUDGET_STABILIZATION`). Observed: L2=`optimizar_deuda_cara` → L3=`confirmar_saldo_stock_deuda`.

---

## F. Real Trace Cases

### CASE: B_HEALTHY_NO_DEBT

```text
inputs: OPTIMIZACION, no debts, narrative OPTIMIZATION/DEFAULT
L0: ordenar_panorama
L1: ordenar_panorama
L2: ordenar_panorama (tier=standard — healthy blocked by confidence low)
L3: mantener_disciplina (OPTIMIZATION narrative map)
tone: no textΔ vs base
FINAL Primary: mantener_disciplina
initial != final
```

### CASE: B_LOW_DEBT_STABLE / B_INTENT_CREDITO

```text
L0/L1/L2: ordenar_panorama
L3: confirmar_saldo_stock_deuda (STABILIZATION → always that key)
FINAL Primary: confirmar_saldo_stock_deuda
initial != final
```

### CASE: B_NEG_FLOW / B_MORA / B_LARGE_STOCK

```text
L0 already confirmar_saldo_stock_deuda (dti)
L1–L3 preserve
FINAL Primary: confirmar_saldo_stock_deuda
initial == final
```

### CASE: B_INCOMPLETE_EXPENSES

```text
L0–L2: confirmar_saldo_stock_deuda (L2 text null via legacy incomplete)
L3 computes: ordenar_panorama (CLARITY) with text
FINAL: Primary absent; Hero next-step null; incomplete CTA (“Paso prioritario”)
→ computed L3 ≠ user-visible next-step (none)
```

### CASE: FS_A_INSUFF_INCOME

```text
L0/L2: liberar_margen
L3: ordenar_panorama (CLARITY)
FINAL Primary: ordenar_panorama
initial != final
```

### CASE: DIRECTED healthy_organized (forced conf=high)

```text
L0: ordenar_panorama
L2: optimizar_deuda_cara (healthy_organized, costo alto)
L3: confirmar_saldo_stock_deuda (focus BUDGET_STABILIZATION beats L2)
FINAL Primary: confirmar_saldo_stock_deuda
override chain: L1→L2→L3
```

### CASE: DIRECTED OPT+healthy

```text
L2=L3=optimizar_deuda_cara via coherence override (OPTIMIZATION+DEFAULT)
```

### CASE: DIRECTED tone AT_RISK+RECOVERY

```text
actionKey final: liberar_margen (preserved)
text final: estabilizar_atraso known copy (replaced)
PROVENANCE_GAP: key ≠ implied action of text
```

### CASE: DIRECTED ingreso_cero stamp loss

```text
planIdRaw already 4 → plan_guardrail_applied false → reason null
coherence revisar_ingresos NOT activated unless reason forced
```

Harness: `dev/decision-provenance/ns-etapa1-trace.js`.

---

## G. Override Matrix

| Caso | Inicial L0 | Después L1 | Después L2 | Después L3 | Final surface | Override ocurrido |
| ---- | ---------- | ---------- | ---------- | ---------- | ------------- | ----------------- |
| B_HEALTHY_NO_DEBT | ordenar_panorama | same | same | mantener_disciplina | Primary mantener | L3 narrative |
| B_LOW_DEBT_STABLE | ordenar_panorama | same | same | confirmar_saldo… | Primary confirmar | L3 narrative |
| B_NEG_FLOW | confirmar… | same | same | same | Primary | none |
| B_MORA | confirmar… | same | same | same | Primary | none |
| B_LARGE_STOCK | confirmar… | same | same | same | Primary | none |
| B_INCOMPLETE | confirmar… | same | same | ordenar_panorama* | **none** (incomplete) | L3 computed but not shown |
| B_INTENT_CREDITO | ordenar_panorama | same | same | confirmar… | Primary | L3 narrative |
| FS_A_INSUFF_INCOME | liberar_margen | same | same | ordenar_panorama | Primary | L3 CLARITY |
| FS_A_INSUFF_ESCAPE | ordenar_panorama | same | same | mantener_disciplina | Primary | L3 OPT |
| DIRECTED healthy | ordenar_panorama | same | optimizar_deuda_cara | confirmar… | Primary | L2 then L3 |
| DIRECTED OPT+healthy | (L0) | — | optimizar… | optimizar… | Primary | L2 wins via override |
| DIRECTED tone | liberar_margen | — | — | key liberar / text estabilizar | — | tone text |

\* L3 key computed but Primary/Hero next-step suppressed.

**13 motor profiles:** `initial!=final` key on **5**; L2≠L3 key on **6**.

---

## H. History Assessment

```text
FULL HISTORY APPEARS UNNECESSARY
```

**Evidence:** Explaining the **final** Primary next step is possible with:

- final `actionKey` + final `text`
- winning writer identity (which L3 branch / tone / display surface)
- inputs that branch actually read

Prior layer values (L0 NBA, L2 coherence key) are **frequently different** from final, but they are **not required** as causal inputs to the winning rule once the winning branch is identified.

**Caveats for Etapa 2 (not a history mandate):**

1. Optional short chain is useful for **audit/debug** because overrides are common.
2. Tone can make **text imply a different action than `actionKey`** — provenance must stamp **text + key + tone rule**, not key alone.
3. Display surface (Primary vs Hero vs none) must be part of “what the user saw.”

---

## I. Evidence Boundaries

| Writer/regla | Inputs realmente usados | Inputs disponibles pero NO usados |
| ------------ | ----------------------- | --------------------------------- |
| L0 NBA_MAP | `causa_principal` | most fin fields beyond those that set causa |
| L0 severity/dti/critico overrides | `severity_level`, `dti_ratio`, mora flags, flujo/accion_score (critico block) | narrative_decision, UI st flags |
| L1 zero-debt | completeness + active debts | NBA |
| L1 dti | `dti_ratio` | causa |
| L1 else | `iv2.next_best_action` or narrativa.accion | coherence tier |
| L2 healthy_organized | planId, ratio, flujoLibre, cantMoras, incomplete, confidence, costoNivel | NBA (replaced) |
| L2 ingreso_cero | `plan_guardrail_reason` only | raw ingreso if reason missing |
| L2 else | L1 key + legacy text inputs | healthy texts |
| L3 CLARITY key | narrative_mode only → ordenar_panorama | L2 key |
| L3 RECOVERY key | dti, causa/cantMoras, focus (mostly → liberar/estabilizar/confirmar) | L2 healthy key |
| L3 STABILIZATION key | mode only → confirmar_saldo_stock_deuda | focus variants beyond sanitize |
| L3 OPTIMIZATION key | focus, zero-debt, costoNivel | L0 NBA |
| L3 coherence override gate | nextStepKey, profileTier, mode, focus, nextStepText≠null | — |
| L3b tone AT_RISK | text content heuristics + tier + mode | actionKey (unchanged) |
| L3b tone HEALTHY | text heuristics + tier + mode + focus | actionKey |
| L4 Primary gate | incomplete flag, trimmed resolve text | coherence-only text |
| L4 Hero text | incomplete; else `coherence.nextStepText` else resolve text | L3 actionKey when coherence text present |

No PII required for these rules (avoid names/emails in future evidence objects).

---

## J. Provenance Gaps

| ID | Writer | Decisión | Causal disponible al decidir | Sobrevive después | Puede ser reemplazada luego | Impacto EXPLAIN_NEXT_STEP |
| -- | ------ | -------- | ---------------------------- | ----------------- | --------------------------- | ------------------------- |
| PG-NS-01 | L0–L3 chain | final key | branch conditions in code | only final key/text in UI objects | yes (later layers) | Cannot attribute final to L0 without new stamps |
| PG-NS-02 | `resolveNextStepContent` | which sub-branch won | focus / override / base / fallback | only `source: narrative\|legacy` | tone/display | Missing fine-grained reason_code |
| PG-NS-03 | tone | text swap | tier+mode+text heuristics | final text only; key may disagree | display | Explaining text via actionKey is wrong |
| PG-NS-04 | L2 healthy vs L3 | which key | both computed | only L3 on Primary | — | Coherence.nextStepKey ≠ Primary key often |
| PG-NS-05 | L4 Hero | which source | coherence text preferred | rendered HTML | — | Alt surface can show L2 copy not L3 |
| PG-NS-06 | incomplete | no next-step shown | incomplete flags | CTA only | — | L3 may still compute a key unused by UI |

All classified: `PROVENANCE_GAP`.

---

## K. Functional Findings Outside Provenance

| ID | Finding | Class |
| -- | ------- | ----- |
| BUG-NS-GUARD-REASON | `applyPlanGuardrail`: when `finalId === planIdRaw`, `reason` is cleared (`if (!applied) reason = null`). If raw plan is already 4 due to other scoring, `ingreso_cero` force still applied in spirit but **reason is null**, so L2 never selects `revisar_ingresos`. Confirmed with `PRE.ingreso=0`, `planId=4`, `plan_guardrail_reason=null`; forcing reason activates `revisar_ingresos`. | CONFIRMED |
| NS-L2-L3-HEALTHY-DIVERGE | When `profileTier===healthy_organized` but narrative focus ≠ DEFAULT (common STABILIZATION), Primary shows narrative key (`confirmar_saldo_stock_deuda`) while `coherence.nextStepKey` remains healthy override (`optimizar_deuda_cara` / `mantener_disciplina`). Confirmed with forced high confidence. May be intended (NARRATIVE-04 precedence) or product inconsistency vs B6b QA that asserts coherence keys. | CONFIRMED (behavior); intent UNCERTAIN |
| NS-TONE-KEY-TEXT-DESYNC | `_applyNextStepNarrativeProfileTierTone` can replace liberar_margen text with estabilizar_atraso copy without changing actionKey. Comment says tone must never change actionKey. | CONFIRMED |
| NS-HEALTHY-NATURAL-CONF | Provenance harness profiles rarely reach `healthy_organized` because motor confidence stays `low`. Exercised via forced confidence / e2e profiles. | NOT_EXERCISED (natural in this harness) / COVERAGE_EXCEPTION |
| NS-TAB-ACCION-DEAD | `hideAccionPrioritaria` hard-coded `true` — tab “Acción prioritaria” path never shows. | CONFIRMED (dead UI path) |

**No fixes applied** (freeze).

---

## L. QA Coverage

| Suite | Result | Branches exercised | Not exercised / notes |
| ----- | ------ | ------------------ | --------------------- |
| `dev/narrative-04-qa.js` | **PASS** 42/42 | L3 narrative consumption, Primary, isolation | Does not assert L2≠L3 healthy diverge |
| `dev/dashboard-coherence-b6b-qa.js` | **PASS** 24/24 | L2 healthy / critical / incomplete coherence object | Asserts **coherence** keys, not Primary `resolveNextStepContent` |
| `dev/ux-consolidation-01-qa.js` | VM asserts **PASS**; Playwright T/U/V **BLOCKED** (browser binary missing) | Primary owns next-step; Hero suppress; incomplete CTA | Layout viewport checks BLOCKED |
| `dev/decision-provenance/ns-etapa1-trace.js` | audit harness OK | L0→L4 traces, directed healthy/tone/guard | Not a regression suite |
| Tone AT_RISK path | **PASS** via directed fixture | text swap | Not in stock narrative-04 matrix as key≠text assert |
| ingreso_cero → revisar_ingresos | **PASS** only with forced reason | — | Natural stamp often **NOT_EXERCISED** due to BUG-NS-GUARD-REASON |
| healthy_organized natural high-conf in provenance corpus | **NOT_EXERCISED** | forced conf used | COVERAGE_EXCEPTION |

Statuses used: PASS / NOT_EXERCISED / COVERAGE_EXCEPTION / BLOCKED (no false PASS for helper-only).

---

## M. Production Code Changes

```text
PRODUCTION_CODE_CHANGES: NONE
```

Audit artifacts only:

- `dev/decision-provenance/FINDINGS-PROV-NS-ETAPA1.md` (this file)
- `dev/decision-provenance/ns-etapa1-trace.js` (read-only observation harness)

---

## Closure checklist (Etapa 1)

| # | Question | Answer with evidence |
| - | -------- | -------------------- |
| 1 | Where does next_step birth? | L0 `interpretarDiagnostico` → `iv2.next_best_action` |
| 2 | All writers? | Inventory §C |
| 3 | Order? | Map §B + Precedence §E |
| 4 | Who overrides whom? | §E; L3 narrative focus beats L2 healthy |
| 5 | Semantic final? | Primary: post-tone `resolveNextStepContent` |
| 6 | Presentation-only? | HTML/render; tone is MIXED |
| 7 | Real inputs? | §I |
| 8 | Causality losses? | §J |
| 9 | initial≠final cases? | §F/G — yes, common |
| 10 | History needed? | §H — full history appears unnecessary |
| 11 | Unexercised paths? | §L — Playwright, natural healthy, natural ingreso_cero stamp |
