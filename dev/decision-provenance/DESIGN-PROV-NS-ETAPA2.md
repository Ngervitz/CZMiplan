# DESIGN — PROV-NS ETAPA 2

**Initiative:** DECISION-PROVENANCE-01  
**Phase:** PROV-NS — Etapa 2 (design only)  
**Date:** 2026-08-11  
**Inputs audited:** `FINDINGS-PROV-NS-ETAPA1.md`, `ns-etapa1-trace.js`, `js/ui.js` next-step pipeline, `js/algorithms.js` NBA + guardrail, PROV-FS/ACT shapes  
**Production code changes:** NONE

---

## Amendment — `source_layer` stable enum (pre-implementation)

**Status:** Approved design amendment **before** PROV-NS Etapa 3 instrumentation.  
**Not** an incidental coding-time decision.

| Stable `source_layer` | Maps from (implementation) | Covers |
| --------------------- | -------------------------- | ------ |
| `NS_L3_CONTENT` | `resolveNextStepContent` | Primary visible / computed / `display.none` |
| `NS_L4_HERO` | `_resolveHeroNextActionText` | Hero visible |

Persisted contract:

```text
source_layer = "NS_L3_CONTENT" | "NS_L4_HERO"
```

Invariant: a pure rename/refactor of the underlying JS functions must not change historical interpretation of `source_layer`.

Tone still does **not** change `source_layer` (remains `tone_code` only).

### Related debt (deferred — do not fix in PROV-NS)

```text
PROVENANCE-SOURCE-LAYER-DEBT
```

FS/ACT may still use function-name `source_layer` values (`resolveFinancialStage`, `seleccionarAccionesRecomendadas`, etc.). Treatment: **DEFERRED**. Do not reopen PROV-FS / PROV-ACT or migrate those fields in Etapa 3. Evaluate before external consumers (assistant) depend on them in production.

---

## 1. Executive conclusion

```text
PROV-NS ETAPA 2: CLOSED
```

### What we are provenanceing

**Canonical product decision `next_step`** = the **user-visible** next-step guidance package when the product shows one:

| Aspect | Field role |
| ------ | ---------- |
| Semantic identity | `value` = final `actionKey` |
| Copy identity | `text_ref` = deterministic catalog id for the string shown (not rationale) |
| Winning content rule | `reason_code` + `source_layer` + `evidence` |
| Tone transform | `tone_code` (nullable) when L3b changed text |
| Visibility | `display.status` + `display.surface` |

One object: `diag.next_step_provenance`.  
Decision and display are **fields of the same object**, not two sibling contracts — justified because L4 is a gate on the same pipeline, not a second independent decision engine.

### Discrepancies vs prompt summary

None material vs Etapa 1 findings/code. Validated additions for design:

1. **`BUG-NS-GUARD-REASON` is user-observable** (key + text change), not metadata-only → `PRODUCT_BUG_SEPARATE_FROM_PROVENANCE`; does **not** block design (`BUG_DOES_NOT_BLOCK_PROVENANCE_DESIGN`).
2. Visible Primary text vs `coherence.nextStepText` often **differ** when Primary owns (e.g. L2 `ordenar_panorama` text vs L3 `confirmar_saldo…` text) — assistant must use L3/Primary stamps, never raw L2 alone.

---

## 2. Validated semantics of final next_step

```text
COMPLETE + Primary renders:
  FINAL = resolveNextStepContent(...).{actionKey, text}  // post-tone
  surface = primary_action_card ("Tu prioridad hoy")

COMPLETE + Primary absent + Hero embeds next-step:
  FINAL text = _resolveHeroNextActionText → prefers coherence.nextStepText
  surface = hero_embedded
  (rare under UX-CONSOLIDATION-01 when Primary would have text)

INCOMPLETE:
  no next-step copy shown (Paso prioritario CTA)
  L3 may still compute key/text internally → COMPUTED_NOT_VISIBLE
```

Tab "Acción prioritaria" is dead (`hideAccionPrioritaria === true`) — **out of canonical surfaces**.

---

## 3. Decision vs display model

| Concept | Meaning | In provenance? |
| ------- | ------- | -------------- |
| Computed content | L3 (and tone) result | Yes — always when flag ON |
| Visible content | What user actually saw | Yes — via `display` + same `value`/`text_ref` when visible |
| Not visible | Incomplete / empty | `display.status = none`; content fields still stamped for QA |

**Precedent (PROV-ACT):** internal selection ≠ canonical user surface.  
**NS application:** stamp computed always; **assistant allowlist only when `display.status === "visible"`**.

Do **not** invent a second top-level object unless Etapa 3 discovers an attach-point conflict (not expected).

---

## 4. Proposed provenance shape

```js
diag.next_step_provenance = {
  schema_version: 1,
  decision: "next_step",

  // Semantic identity (navigation / action family). Unchanged by tone.
  value: "mantener_disciplina",

  // Deterministic copy identity for the string shown (or computed). NOT rationale.
  text_ref: "known:mantener_disciplina",

  reason_code: "NS_NARR_OPT_MANTENER",
  source_layer: "NS_L3_CONTENT", // or "NS_L4_HERO" when Hero owns visible package
  evidence: { /* allowlisted inputs for reason_code only */ },

  // Null/omitted when tone did not rewrite text.
  tone_code: null, // or "NS_TONE_AT_RISK_SWAP_ESTABILIZAR"

  display: {
    status: "visible", // "visible" | "none"
    surface: "primary_action_card", // "primary_action_card" | "hero_embedded" | "none"
  },
};
```

FLAG OFF: field absent (identical to today).

---

## 5. Field-by-field justification

| Campo | Necesidad | Consumer | Obligatorio | Fuente |
| ----- | --------- | -------- | ----------- | ------ |
| `schema_version` | Compatibilidad evolutiva | QA / future readers | sí | constant `1` |
| `decision` | Discriminar entre provenances en diag | Assistant allowlist / QA | sí | `"next_step"` |
| `value` | Identidad semántica final (`actionKey`) | EXPLAIN / QA / nav family | sí | post-L3 `actionKey` (tone no la cambia) |
| `text_ref` | Explicar qué copy vio el usuario sin rationale LLM; key≠text | EXPLAIN / QA | sí | catalog id (ver §9) |
| `reason_code` | Regla ganadora de selección de contenido | EXPLAIN / QA | sí | branch real L3 o L2-hero |
| `source_layer` | Writer ganador del paquete explicado | EXPLAIN / QA | sí | stable enum `NS_L3_CONTENT` \| `NS_L4_HERO` |
| `evidence` | Inputs usados por esa regla | EXPLAIN / QA | sí | allowlist §8 |
| `tone_code` | Honestidad cuando L3b reescribe text | EXPLAIN / QA | no (omit si null) | L3b branch |
| `display.status` | Visible vs computed-not-shown | Assistant gate / QA | sí | L4 |
| `display.surface` | Primary vs Hero vs none | Assistant / QA | sí | L4 |

**Rejected fields (no consumer / redundant):**

| Rejected | Why |
| -------- | --- |
| `override_history` / full chain | §11 — unnecessary for product explain |
| Literal `text` / copy as rationale | Prefer `text_ref`; copy is reconstructible from catalogs |
| `initial_key` / L0 NBA | Not required to explain final |
| `coherence_key` alongside value | Only if surface=hero and text from coherence — then `value`/`reason_code` already reflect that path |
| Raw `narrative_decision` object | Too wide; evidence carries mode/focus/tier scalars when used |
| `assistant_eligible` boolean | Derivable: `display.status === "visible"` — avoid duplicate |

---

## 6. reason_code catalog

Derived only from real branches. `reason_code` = **content-selection winner for the stamped package** (visible when display visible, else computed).

### A. `resolveNextStepContent` first-match (Primary path / computed)

| reason_code | writer | source_layer | condición real | evidence |
| ----------- | ------ | ------------ | -------------- | -------- |
| `NS_LEGACY_NO_NARRATIVE` | `resolveNextStepContent` | `NS_L3_CONTENT` | `_normalizeHeroNarrativeMode` falsy | `{ legacy: true }` |
| `NS_NARR_FOCUS_NONDEFAULT` | + `_nextStepActionKeyForNarrative` | `NS_L3_CONTENT` | `focusTarget !== "DEFAULT"` && `base.text` | `{ narrative_mode, focus_target, action_key }` |
| `NS_COH_REVISAR_INGRESOS` | coherence override | `NS_L3_CONTENT` | `_coherenceOverridesNextStep` && key `revisar_ingresos` | `{ coherence_profile_tier, coherence_next_step_key: "revisar_ingresos" }` |
| `NS_COH_HEALTHY_OPTIMIZATION` | coherence override | `NS_L3_CONTENT` | healthy_organized + OPTIMIZATION + DEFAULT | `{ coherence_profile_tier: "healthy_organized", narrative_mode: "OPTIMIZATION", focus_target: "DEFAULT", coherence_next_step_key, costo_nivel }` |
| `NS_NARR_CLARITY` | narrative base | `NS_L3_CONTENT` | mode CLARITY → `ordenar_panorama` | `{ narrative_mode: "CLARITY" }` |
| `NS_NARR_RECOVERY_DTI` | narrative base | `NS_L3_CONTENT` | RECOVERY && dti≥1 | `{ narrative_mode, dti_ge_1: true }` |
| `NS_NARR_RECOVERY_MORA` | narrative base | `NS_L3_CONTENT` | RECOVERY && (causa mora \|\| cantMoras>0) | `{ narrative_mode, mora: true }` |
| `NS_NARR_RECOVERY_LIBERAR` | narrative base | `NS_L3_CONTENT` | RECOVERY else → liberar_margen | `{ narrative_mode, focus_target }` |
| `NS_NARR_STABILIZATION` | narrative base | `NS_L3_CONTENT` | STABILIZATION → confirmar_saldo_stock_deuda | `{ narrative_mode: "STABILIZATION" }` |
| `NS_NARR_OPT_CREDIT_BUILDING` | narrative base | `NS_L3_CONTENT` | OPT + CREDIT_BUILDING | `{ narrative_mode, focus_target }` |
| `NS_NARR_OPT_LEARNING` | narrative base | `NS_L3_CONTENT` | OPT + LEARNING | `{ narrative_mode, focus_target }` |
| `NS_NARR_OPT_ZERO_DEBT` | narrative base | `NS_L3_CONTENT` | OPT + zero active debt complete | `{ narrative_mode, zero_active_debt: true }` |
| `NS_NARR_OPT_COSTO_ALTO` | narrative base | `NS_L3_CONTENT` | OPT + costoDeudaNivel alto | `{ narrative_mode, costo_nivel: "alto" }` |
| `NS_NARR_OPT_MANTENER` | narrative base | `NS_L3_CONTENT` | OPT else → mantener_disciplina | `{ narrative_mode, focus_target }` |
| `NS_FALLBACK_COHERENCE_OR_LEGACY` | fallback branch | `NS_L3_CONTENT` | no base.text; uses coherence/legacy | `{ used_coherence_text: bool, coherence_next_step_key }` |

### B. Hero-visible content when Primary absent and Hero uses coherence text first

| reason_code | writer | source_layer | condición | evidence |
| ----------- | ------ | ------------ | --------- | -------- |
| `NS_HERO_COH_HEALTHY_ALTO` | L2 healthy alto | `NS_L4_HERO` | hero text from coh && key optimizar | `{ profile_tier, costo_nivel }` |
| `NS_HERO_COH_HEALTHY_MANTENER` | L2 healthy else | `NS_L4_HERO` | hero text from coh && mantener | `{ profile_tier }` |
| `NS_HERO_COH_REVISAR_INGRESOS` | L2 ingreso_cero | `NS_L4_HERO` | hero + revisar | `{ plan_guardrail_reason: "ingreso_cero" }` |
| `NS_HERO_COH_LEGACY` | L2 else text | `NS_L4_HERO` | hero + coherence text from legacy path | `{ coherence_next_step_key }` |
| `NS_HERO_RESOLVE_CONTENT` | falls through to resolve | `NS_L4_HERO` | no coherence text; uses resolve text | reuse L3 reason_code from resolve + `source_layer: "NS_L4_HERO"` |

### C. tone_code (orthogonal; does not replace reason_code)

| tone_code | condición | effect on text_ref |
| --------- | --------- | ------------------ |
| *(omit)* | no rewrite | text_ref from pre-tone selection |
| `NS_TONE_AT_RISK_SWAP_ESTABILIZAR` | AT_RISK + RECOVERY + margen heuristics | → `known:estabilizar_atraso` |
| `NS_TONE_HEALTHY_SWAP_MANTENER` | HEALTHY + OPT + DEFAULT + heuristics | → `known:mantener_disciplina` |

---

## 7. source_layer / winning-writer model

| Situation | `source_layer` | Notes |
| --------- | -------------- | ----- |
| Primary visible | `NS_L3_CONTENT` | Includes coherence-override **branch inside** L3 — do **not** set L2 if Primary shows L3 output |
| Hero visible via coherence text | `NS_L4_HERO` | Winning visible writer is Hero path |
| Hero visible via resolve fallback | `NS_L4_HERO` | Same layer; reason may mirror L3 content codes under `NS_HERO_RESOLVE_CONTENT` |
| Not visible | `NS_L3_CONTENT` | Computed stamp; `display.surface = "none"` |

**Tone:** does **not** become `source_layer`. Tone is `tone_code` only.  
Rationale: tone never changes `value`/`actionKey`; changing `source_layer` for tone would mis-attribute the semantic decision.

**Forbidden:** L0 / motor as `source_layer` when final came from L3/L4.  
**Forbidden in persisted contract:** raw JS function names as `source_layer`.

---

## 8. Evidence allowlist

| reason_code family | Evidence requerida | Prohibida / no necesaria |
| ------------------ | ------------------ | ------------------------ |
| `NS_LEGACY_*` | `{ legacy: true }` | diag/st completos, P1–P10 |
| `NS_NARR_FOCUS_*` | mode, focus, action_key | income, Equifax, scores |
| `NS_COH_REVISAR_*` | coherence key + optional guardrail reason | ingreso crudo si reason ausente |
| `NS_COH_HEALTHY_*` | profile_tier, mode, focus, next_step_key, costo_nivel | NBA L0, full fin |
| `NS_NARR_CLARITY` | narrative_mode | focus unused for key |
| `NS_NARR_RECOVERY_DTI` | mode, `dti_ge_1` (boolean) | raw dti float optional — prefer boolean used by branch |
| `NS_NARR_RECOVERY_MORA` | mode, `mora: true` | debt list |
| `NS_NARR_RECOVERY_LIBERAR` | mode, focus | — |
| `NS_NARR_STABILIZATION` | mode | focus (sanitized but key ignores) |
| `NS_NARR_OPT_*` | mode + discriminators used (focus / zero_debt / costo) | unused OPT siblings |
| `NS_FALLBACK_*` | flags above | — |
| Hero COH_* | tier / guardrail / key as used | L3 narrative fields unused by Hero text path |
| tone evidence | *none extra* — encoded in `tone_code` + `text_ref` | do not store matched substrings of copy |

**Hard caps (align FS/ACT):** ≤ 8 evidence keys; scalars/enums/booleans only; no PII; no Equifax; no raw survey answers.

---

## 9. key / text / tone model

### Answers

1. **`actionKey` (`value`) remains semantic / navigation authority** — tone comment and code preserve it.
2. **`text` can change practical meaning for the user** — confirmed: liberar key + estabilizar copy.
3. **Tone is MIXED** — presentational intent, decisional effect on perceived guidance.
4. Provenance must keep **`value` + `text_ref` + optional `tone_code`**.
5. **Yes** — `tone_code` (stable id), not free text.
6. **Literal text persistence: NOT required for product provenance** if `text_ref` is used.

### `text_ref` catalog (reconstructible without storing copy)

| `text_ref` | Resolves to |
| ---------- | ----------- |
| `known:<actionKey>` | `_NEXT_STEP_KNOWN_TEXTS[actionKey]` or equivalent `textoParaNarrativa` siguiente_paso |
| `const:dti_accion_prioritaria` | `CZ_DTI_ACCION_PRIORITARIA` (currently == known confirmar string) |
| `const:zero_active_debt` | `_ZERO_ACTIVE_DEBT_NEXT_STEP` |
| `const:revisar_ingresos` | `_REVISAR_INGRESOS_NEXT_STEP` |
| `coh:healthy_alto` | healthy_organized + costo alto fixed string in L2 |
| `coh:healthy_mantener` | healthy_organized default fixed string in L2 |

Etapa 3 must map at stamp time which catalog entry was chosen (same branch that selected the string).  
QA may compare reconstructed string ≡ functional `resolveNextStepContent().text` under FLAG ON.

**If** a future path emits non-catalog copy: Etapa 3 STOP and add `text_ref: "opaque"` + QA-only hash — do not silently store full copy in product contract. Current code paths are catalog-covered.

---

## 10. L4 display model

```text
display.status:
  "visible" | "none"

display.surface:
  "primary_action_card"  — _willRenderPrimaryActionCard === true
  "hero_embedded"        — Primary false, hero shows next-step block
  "none"                 — incomplete CTA / empty text / suppressed
```

Rules:

1. Prefer Primary when it would render (product rule today).
2. Incomplete → `none` even if L3 computed text exists.
3. Do not treat `none` as "no decision" — content fields remain for QA.

---

## 11. History assessment

```text
FULL_HISTORY_UNNECESSARY
```

Revalidation of `initial != final` cases (Etapa 1 + directed):

| Case | Final explained by winning rule alone? |
| ---- | -------------------------------------- |
| B_HEALTHY_NO_DEBT → mantener | Yes — `NS_NARR_OPT_*` |
| STABILIZATION → confirmar | Yes — `NS_NARR_STABILIZATION` |
| CLARITY → ordenar | Yes — `NS_NARR_CLARITY` |
| healthy L2 optimizar → L3 confirmar | Yes — `NS_NARR_FOCUS_NONDEFAULT` / STAB |
| tone key≠text | Yes — same reason_code + `tone_code` + `text_ref` |
| incomplete computed | Yes — content reason + `display.none` |

**PRODUCT PROVENANCE:** final package only.  
**DEBUG/QA TRACE:** optional `ns-etapa1-trace.js` layer dump — **not** part of `next_step_provenance`.

---

## 12. BUG-NS-GUARD-REASON impact

### A. Observable impact

Demonstrated (`PRE.ingreso = 0`, raw plan already 4 → `plan_guardrail_reason = null`):

| | Natural (bug) | Forced `ingreso_cero` |
| - | ------------- | --------------------- |
| L2 key | `liberar_margen` | `revisar_ingresos` |
| L3/Primary key | `ordenar_panorama` (CLARITY) | `revisar_ingresos` |
| Visible text | ordenar_panorama copy | revisar_ingresos copy |

→ Changes **(1) semantic key, (2) visible text**. Not metadata-only.

### B. Reachability

**Reachable in production** whenever `ingreso <= 0` and `asignarPlan` already yields plan 4 (common), because:

```text
applied = finalId !== planIdRaw
if (!applied) reason = null
```

clears `ingreso_cero` even though force ran.

### C. Treatment

```text
PRODUCT_BUG_SEPARATE_FROM_PROVENANCE
DOCUMENT_SEPARATELY
```

- Do **not** fix inside provenance PR.
- Provenance instruments **actual** winners (`ordenar_panorama` today).
- After a future functional fix, reason_codes for those profiles change — expected.

```text
BUG_DOES_NOT_BLOCK_PROVENANCE_DESIGN
```

We know which behavior to stamp: the live branch outcomes.

---

## 13. Other functional findings impact

| ID | Confirmed behavior? | Intended known? | Impact on design | Blocks Etapa 3? |
| -- | ------------------- | --------------- | ---------------- | --------------- |
| NS-L2-L3-HEALTHY-DIVERGE | Yes | Unknown (NARRATIVE-04 may intend L3 win) | Stamp Primary/L3; don't claim L2 won | No |
| NS-TONE-KEY-TEXT-DESYNC | Yes | Comment says tone-only; effect MIXED — intent ambiguous | `tone_code` + `text_ref` | No |
| NS-TAB-ACCION-DEAD | Yes | Likely intentional hide | Out of surfaces | No |
| Natural healthy / ingreso_cero coverage gaps | Harness limits | n/a | Directed fixtures in QA | No (COVERAGE_EXCEPTION ok) |

---

## 14. Computed-but-not-visible policy

| Question | Decision |
| -------- | -------- |
| Exist `next_step_provenance`? | **Yes** when flag ON (QA / regression) |
| Indicate decision but no display? | **Yes** — `display.status = "none"`, `surface = "none"` |
| Future assistant explain unshown decision? | **No** — violates canonical-surface principle (PROV-ACT lesson) |
| Assistant boundary | Allowlist only `display.status === "visible"` |

---

## 15. Assistant boundary (future allowlist candidate)

**May enter `assistant_context` later:**

- `decision`, `value`, `text_ref`, `reason_code`, `source_layer`, `evidence`, `tone_code`, `display`

**Must NOT enter:**

- Full layer history / L0 NBA
- `diag` / `st` / P1–P10 / Equifax
- Literal copy as rationale
- Provenance rows with `display.status === "none"`
- Dead tab surfaces

No Assistant Context Contract rewrite in this phase.

---

## 16. Instrumentation points (Etapa 3 — plan only)

| Layer | Archivo | Función | Stamp | Por qué ahí |
| ----- | ------- | ------- | ----- | ----------- |
| L3 | `js/ui.js` | `resolveNextStepContent` | Build provisional `{ value, text_ref, reason_code, evidence, tone_code }` when flag ON | Causality of key/text/tone still local |
| L3b | same | `_applyNextStepNarrativeProfileTierTone` | Set `tone_code` + adjust `text_ref` | Only place tone rewrites |
| L4 | `js/ui.js` | new `attachNextStepProvenance(diag,st,coherence)` or finalize in render Primary/Hero/incomplete | Set `display.*`; assign `diag.next_step_provenance`; adjust source/reason if Hero-coherence wins | Causality of visibility |
| Harness | `dev/decision-provenance/harness.js` | `captureNextStep` | Read `diag.next_step_provenance` | QA |

**Overwrite rule:** later finalize **replaces** the single `diag.next_step_provenance` object (winning package), does not append history.

Do **not** stamp only at L0 — would be wrong for final.

---

## 17. Mutation / preservation risks

| Risk | Mitigation for Etapa 3 |
| ---- | ---------------------- |
| `resolveNextStepContent` called many times | Finalize once per render/attach; idempotent same inputs → same stamp |
| Return object of resolve not persisted | Attach on `diag`, not only return value |
| Hero vs Primary different writers | Finalize **after** knowing `_willRenderPrimaryActionCard` |
| FLAG OFF residual fields | Never write field when flag false; strip tests |
| Coherence object ephemeral | Evidence copies scalars only |

---

## 18. Flag strategy

Reuse:

```text
CZ_DECISION_PROVENANCE
```

via `_decisionProvenanceEnabled()` — same as PROV-FS/ACT.  
No second flag (no incompatibility demonstrated).

---

## 19. QA contract for Etapa 3

### FLAG OFF

- No `diag.next_step_provenance`
- Surfaces identical to baseline / pre-instrumentation: `actionKey`, `text`, primary ownership, hero embed presence

### FLAG ON

- Functional equality for: `actionKey`, `text`, tone outcome, primary/hero visibility, incomplete CTA
- **Only** additive `next_step_provenance`

### Structural branch coverage (not arbitrary N)

| Branch | Target status |
| ------ | ------------- |
| NS_NARR_CLARITY | PASS |
| NS_NARR_STABILIZATION | PASS |
| NS_NARR_RECOVERY_* (at least one) | PASS |
| NS_NARR_OPT_MANTENER / COSTO / ZERO | PASS (≥1) |
| NS_NARR_FOCUS_NONDEFAULT | PASS |
| NS_COH_HEALTHY_OPTIMIZATION | PASS (may force conf) |
| NS_COH_REVISAR_INGRESOS | PASS (force reason OK; natural = COVERAGE_EXCEPTION) |
| NS_TONE_AT_RISK_* | PASS (directed) |
| display none incomplete | PASS |
| Primary owns / hero suppress | PASS (VM; Playwright may BLOCKED) |
| Natural healthy_organized | COVERAGE_EXCEPTION if conf stays low |
| ACT_FILL-style unreachable | N/A |

Classifications: `PASS` | `NOT_EXERCISED` | `COVERAGE_EXCEPTION` | `BLOCKED`.

New suite: `dev/decision-provenance/ns-layer-a-qa.js` (name indicative).

---

## 20. Updated implementation estimate (Etapa 3 + QA + close)

Original rough NS estimate (~1.5–2.5d) underestimated L3 decisional + tone MIXED + L4.

| Case | Estimate | Dominated by |
| ---- | -------- | ------------ |
| **Best** | ~1.5–2 days | Happy-path Primary stamps + OFF/ON equality |
| **Expected** | ~2.5–3.5 days | Full reason catalog, tone/text_ref, display finalize, directed QA |
| **High-risk** | ~4–5 days | Hero-coherence edge cases, catalog gaps, Playwright env, guardrail bug confusion in fixtures |

Effort drivers: branch matrix in `resolveNextStepContent`, `text_ref` mapping, display finalize ordering, QA proving no functional drift.

---

## 21. Open questions / blockers

**Blockers for design close:** none.

**Deferred (non-blocking):**

- Product intent of NS-L2-L3-HEALTHY-DIVERGE (document only)
- Whether to fix BUG-NS-GUARD-REASON in a separate ticket (recommended yes, outside provenance)
- Playwright browser install for layout asserts (BLOCKED locally is OK)

---

## 22. Production code changes

```text
PRODUCTION_CODE_CHANGES: NONE
```

Artifacts this stage:

- `dev/decision-provenance/DESIGN-PROV-NS-ETAPA2.md` (this file)
- `dev/decision-provenance/README.md` (link)

---

## Provenance Convention v1 for NS — closed checklist

| # | Question | Answer |
| - | -------- | ------ |
| 1 | What decision? | User-facing next-step package (semantic key + copy id + visibility) |
| 2 | Final value? | `value` = actionKey; `text_ref` = copy id |
| 3 | key vs text? | Separate fields; key authority; text via text_ref |
| 4 | tone? | `tone_code` optional |
| 5 | decision vs display? | Same object; `display.*` |
| 6 | Primary/Hero/none? | `display.surface` |
| 7 | Winning writer? | `source_layer` |
| 8 | reason code? | Catalog §6 |
| 9 | evidence? | Allowlist §8 |
| 10 | history? | `FULL_HISTORY_UNNECESSARY` |
| 11 | computed-not-visible? | Stamp + `display.none`; no assistant |
| 12 | assistant? | Visible-only allowlist subset |
| 13 | instrument where? | §16 |
| 14 | FLAG ON equality? | §19 |
| 15 | BUG-NS-GUARD blocks? | No — separate product bug |
| 16 | Etapa 3 estimate? | Expected ~2.5–3.5 days |
