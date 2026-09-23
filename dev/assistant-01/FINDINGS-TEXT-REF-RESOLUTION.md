# FINDINGS — TEXT_REF_RESOLUTION_GAP

**Initiative:** ASSISTANT-01  
**Scope:** Audit only. No resolver. No production / PROV-NS / prompt / harness changes.  
**PRODUCTION_CODE_CHANGES:** NONE  
**Date:** 2026-08-12

Evidence classes used below are exclusive:

- **CONFIRMED_FROM_CODE** — read from current production source
- **CONFIRMED_FROM_TEST** — observed on existing PROV-NS corpus / directed PROV-NS cases / HTML render
- **NOT_EXERCISED** — branch or ID not observed in those cases
- **INFERENCE** — conclusion that follows from the above, not a new measurement

This document does not propose a resolver, backend, schema, or PROV-NS change.

---

## Verdict

```text
TEXT_REF_RESOLUTION AUDIT: COMPLETE — REVERSIBLE_BY_COMPOSITION
```

| Question | Result |
|---|---|
| Production `text_ref → copy` function? | No. **CONFIRMED_FROM_CODE** |
| Can copy be reconstructed from existing maps without inventing copy? | Yes, for every family actually stamped in the exercised corpus. **CONFIRMED_FROM_TEST** |
| Is `text_ref` the UI source of truth? | No. The UI interpolates the resolved string. **CONFIRMED_FROM_CODE** |
| Does `known:actionKey` fallback lose information? | Yes, if entered. **CONFIRMED_FROM_CODE**. Not observed in the real corpus. **NOT_EXERCISED** |

DEV `dev/assistant-01/text-ref-catalog.js` `resolveTextRefDevOnly` is a harness mirror (`INTEGRATION_READY: false`). It is not production and is not treated as proof of a production reverse path.

---

## 1. Where and how `text_ref` is generated

### CONFIRMED_FROM_CODE

The only production writers of `next_step_provenance.text_ref` are in `js/ui.js`. No other file under `js/` assigns `text_ref`.

Computers (not mere copies):

| Function | Role | File:line |
|---|---|---|
| `_nsTextRefForEffectiveText(text, actionKey)` | Primary stamp: effective string → id | `js/ui.js:2621-2641` |
| `_nsTextRefFromCoherence(coherence)` | Coherence-key stamp; else delegates to the function above | `js/ui.js:2643-2651` |
| `_nsBuildContentProvenance` | Copies `fields.text_ref` into the provenance object | `js/ui.js:2724-2729` |
| `attachNextStepProvenance` | Final write to `diag.next_step_provenance` | `js/ui.js:2988` |

Call sites that **compute** a ref (not just reuse `base.text_ref`):

| Site | When | File:line |
|---|---|---|
| Legacy resolve | no `narrative_decision` | `js/ui.js:2759-2761` |
| Focus non-DEFAULT | narrative path | `js/ui.js:2799` |
| Coherence override | `revisar_ingresos` or healthy_organized OPT DEFAULT | `js/ui.js:2819` |
| Narrative base | default narrative winner | `js/ui.js:2825` |
| Fallback coherence/legacy | empty narrative base | `js/ui.js:2836-2838` |
| Tone re-stamp | only if `_nsDetectToneCode` is truthy | `js/ui.js:2844-2846` |
| Attach, missing base | flag ON, no provisional provenance | `js/ui.js:2924` |
| Attach, Hero + coherence text | Primary does not own; Hero shows coherence string | `js/ui.js:2951` |

Call sites that **reuse** an already computed ref:

| Site | File:line |
|---|---|
| Primary owns display | `js/ui.js:2937` |
| Hero shows resolve text (not coherence) | `js/ui.js:2961` |
| Display none | `js/ui.js:2979` |

### Stamp algorithm (`_nsTextRefForEffectiveText`)

Order is strict. First match wins. **CONFIRMED_FROM_CODE** `js/ui.js:2621-2641`.

| Priority | Condition | Family emitted | Input used |
|---|---|---|---|
| 0 | `text` null/empty | `null` | — |
| 1 | `text === _REVISAR_INGRESOS_NEXT_STEP` | `const:revisar_ingresos` | literal string |
| 2 | `text === _ZERO_ACTIVE_DEBT_NEXT_STEP` | `const:zero_active_debt` | literal string |
| 3 | `text === CZ_DTI_ACCION_PRIORITARIA` | `const:dti_accion_prioritaria` | literal string |
| 4 | `text === _NEXT_STEP_KNOWN_TEXTS[k]` for some `k` | `known:<k>` | literal string vs catalog |
| 5 | `actionKey === "optimizar_deuda_cara"` and prefix `"Priorizá la deuda de mayor costo"` | `coh:healthy_alto` | prefix + actionKey |
| 6 | `actionKey === "mantener_disciplina"` and prefix `"Mantené el ritmo de pagos actual"` | `coh:healthy_mantener` | prefix + actionKey |
| 7 | `actionKey` is a key of `_NEXT_STEP_KNOWN_TEXTS` | `known:<actionKey>` | **actionKey only** (text not compared) |
| 8 | else | `null` | — |

`_nsTextRefFromCoherence` does **not** always inspect text. **CONFIRMED_FROM_CODE** `js/ui.js:2643-2651`:

- `nextStepKey === "revisar_ingresos"` → `const:revisar_ingresos` (key, not text)
- `profileTier === "healthy_organized"` + `optimizar_deuda_cara` → `coh:healthy_alto` (key, not text)
- `profileTier === "healthy_organized"` + `mantener_disciplina` → `coh:healthy_mantener` (key, not text)
- else → `_nsTextRefForEffectiveText(coherence.nextStepText, coherence.nextStepKey)`

### Answers required by the brief

**Is `text_ref` computed from literal text, actionKey, coherence, constants, or something else?**

**CONFIRMED_FROM_CODE:** mixed.

- Exact-match families (`const:*`, `known:*` at priority 4) use the **literal effective string**.
- Coherence healthy/revisar stamps in `_nsTextRefFromCoherence` use **coherence keys**, not a text compare.
- Prefix `coh:*` inside `_nsTextRefForEffectiveText` uses **prefix of text + actionKey**.
- Fallback `known:<actionKey>` uses **actionKey** only.

**Fallbacks:** empty → `null`; unmatched text with known actionKey → `known:<actionKey>`; unmatched text with unknown actionKey → `null`.

**Can more than one text produce the same `text_ref`?**

**CONFIRMED_FROM_CODE:** yes, via priority 7. Any non-catalog string plus `actionKey="liberar_margen"` stamps `known:liberar_margen`.

**CONFIRMED_FROM_TEST (synthetic, not a product fixture):** shown `"Copy no catalogado que el usuario vería."` + `actionKey=liberar_margen` → `known:liberar_margen`. Catalog copy for that id is the liberar_margen sentence. Strings differ.

**Can a `text_ref` fail to identify the shown copy unequivocally?**

**CONFIRMED_FROM_CODE:** yes if priority 7 fired: the id names a catalog row that is not the shown string.

**INFERENCE:** if only priorities 1–6 fire, each emitted id maps to one catalog/const/L2 string. Copy→id is many-to-one (see §4 duplicates); id→copy is one-to-one among those maps.

---

## 2. PRE-tone vs POST-tone

### CONFIRMED_FROM_CODE — narrative path (`resolveNextStepContent`, `js/ui.js:2739-2867`)

1. Select `text` / `actionKey` / `reasonCode` (focus, coherence override, narrative base, or fallback).
2. **First stamp** of `textRef` from that `text` (PRE-tone). Lines 2799 / 2819 / 2825 / 2836-2838.
3. `textBeforeTone = text` (2841).
4. `text = _applyNextStepNarrativeProfileTierTone(...)` (2842). Function `js/ui.js:2562-2577`. Does **not** change `actionKey`.
5. `toneCode = _nsDetectToneCode(textBeforeTone, text, ...)` (2843). Detector `js/ui.js:2709-2721`.
6. **Re-stamp only if `toneCode` is truthy** (2844-2846): `textRef = _nsTextRefForEffectiveText(text, actionKey)` on the POST-tone string.
7. Return `out.text` (POST-tone) and `out.provenance.text_ref`.

Tone apply (`js/ui.js:2562-2577`) can replace text with:

- `_NEXT_STEP_KNOWN_TEXTS.estabilizar_atraso` when `AT_RISK` + `RECOVERY` + heuristics
- `_NEXT_STEP_KNOWN_TEXTS.mantener_disciplina` when `HEALTHY` + `OPTIMIZATION` + `DEFAULT` + heuristics
- otherwise the original `text`

Detector returns a code only when `textBefore !== textAfter` and `textAfter` equals one of those two catalog strings.

**CONFIRMED_FROM_CODE:** re-stamp is gated on `if (toneCode)`, not on `text !== textBeforeTone`. A hypothetical tone return that changed text without matching the detector would keep the PRE-tone ref. Current tone implementation only returns those two catalog strings or the original text, so that hypothetical does not exist in the present function. **INFERENCE:** under the current tone + detect pair, a successful swap always re-stamps POST-tone.

### CONFIRMED_FROM_CODE — paths with no tone

- **Legacy** (`!narrativeMode`, `js/ui.js:2746-2772`): returns before tone apply. `text_ref` is from coherence/legacy text. No POST-tone.
- **Hero coherence attach** (`js/ui.js:2947-2956`): recomputes `text_ref` via `_nsTextRefFromCoherence`, sets `tone_code: null`. This is the coherence string, not L3 POST-tone.

### CONFIRMED_FROM_TEST

| Case | `value` (actionKey) | `tone_code` | Final `text_ref` | Visible copy family |
|---|---|---|---|---|
| `DIRECTED_TONE_AT_RISK` / several `FS_A_REC_*` | `liberar_margen` | `NS_TONE_AT_RISK_SWAP_ESTABILIZAR` | `known:estabilizar_atraso` | POST-tone estabilizar catalog |
| `DIRECTED_TONE_HEALTHY_SWAP` | `optimizar_deuda_cara` | `NS_TONE_HEALTHY_SWAP_MANTENER` | `known:mantener_disciplina` | POST-tone mantener catalog |
| `DIRECTED_KNOWN_LIBERAR_NO_TONE` | `liberar_margen` | `null` | `known:liberar_margen` | PRE = POST (no swap) |
| `DIRECTED_HERO_COH_MANTENER` (resolve stubbed empty) | `mantener_disciplina` | `null` | `coh:healthy_mantener` | Hero coherence string; L3 tone discarded by attach |

`dev/decision-provenance/ns-layer-a-qa.js:237-239` already asserts tone `text_ref === "known:estabilizar_atraso"` and visible text equals the estabilizar catalog.

**Does the final `text_ref` always correspond to POST-tone copy on Primary?**  
**CONFIRMED_FROM_TEST** for exercised tone swaps: yes.  
**CONFIRMED_FROM_CODE** for a PRE-tone ref surviving a real swap: only if detect returned null after a text change; not possible with the current tone function.

**Can a PRE-tone `text_ref` survive on a visible surface?**  
**CONFIRMED_FROM_CODE:** Hero-with-coherence attach stores coherence ref and `tone_code: null` even if L3 had applied tone. Hero HTML uses `_resolveHeroNextActionText` → `coherence.nextStepText` first (`js/ui.js:4207-4211`), which is not L3 tone-swapped. Aligns with Hero, not with L3 POST-tone.  
**NOT_EXERCISED:** that Hero path in the natural motor corpus (Primary owned every complete profile that had next-step text). The directed Hero case used the same resolve-empty stub as `ns-layer-a-qa.js`.

---

## 3. Where the UI gets the visible copy

`text_ref` is **not** read by any render function. **CONFIRMED_FROM_CODE** (no `text_ref` usage under `js/` outside provenance stamp/attach).

| Surface | Copy source | Function | Input | File:line | Status |
|---|---|---|---|---|---|
| Primary Action Card | `resolveNextStepContent(...).text` interpolated into HTML | `renderPrimaryActionCard` | diag, st, coherence | `js/ui.js:4336-4356` | Live. **CONFIRMED_FROM_CODE** |
| Hero embedded next-step | `_resolveHeroNextActionText` → `coherence.nextStepText` if set, else `_resolveDashboardNextStepText` → `resolveNextStepContent().text` | `_renderDashboardHeroCard` | `heroContent.nextAction` | `js/ui.js:4207-4211`, `4268-4299` | Live, but suppressed when Primary renders (`js/ui.js:4270-4276`, `4318`). **CONFIRMED_FROM_CODE** |
| Hero incomplete | Hardcoded incomplete-diagnosis copy | `_renderDashboardHeroCard` | — | `js/ui.js:4236-4262` | Not next_step catalogs. **CONFIRMED_FROM_CODE** |
| Narrativa “Primer paso recomendado” | `resolveNextStepContent().text`, omitted when `coherence.nextStepText` exists | `renderNarrativaInterpretacion` | `textoPaso` | `js/ui.js:3730-3733`, `3752-3756`, `3784` | Live only if coherence has no `nextStepText`. Incomplete profiles take a different HTML path (`js/ui.js:3724-3725`, `3079+`) with no next_step catalog. **CONFIRMED_FROM_CODE** |
| “Acción prioritaria” card | `resolveNextStepContent().text` | IIFE in `renderTabPlan` | — | `js/ui.js:4496-4509` | Gated by `coherence.hideAccionPrioritaria`, which is initialized `true` and never flipped (`js/ui.js:2420`, `2459`). **CONFIRMED_FROM_CODE**. **NOT_EXERCISED** as a visible surface. |

Tab assembly: Hero then Primary (`js/ui.js:4443-4452`).

### True source of truth of what the user sees

**CONFIRMED_FROM_CODE:** the **resolved string** (`resolveNextStepContent().text` on Primary; `coherence.nextStepText` on Hero when Hero owns). Not `text_ref`. Not `actionKey → catalog` at render time. Not a `text_ref → copy` lookup.

**CONFIRMED_FROM_TEST:** in the PROV-NS baseline + directed cases, every complete profile that had next-step text showed it on **Primary Action Card**. Hero embedded next-step did not appear unless resolve was stubbed empty. Incomplete profiles (`FS_A_INSUFF_INPUTS`, `B_INCOMPLETE_EXPENSES`) showed **no** next-step catalog copy on Primary, Hero, or narrativa; provenance still carried a `text_ref` for the computed (not displayed) string.

---

## 4. Inventory of catalogs / maps

All production copy used to stamp or display next_step lives in `js/ui.js` plus `textoParaNarrativa` in `js/algorithms.js`.

| Source | Keys | Copy | Current consumer | File:line |
|---|---|---|---|---|
| `_NEXT_STEP_KNOWN_TEXTS` | 10 actionKeys: `liberar_margen`, `estabilizar_atraso`, `reducir_costo_prioritaria`, `consolidar_deuda`, `formalizar_informal`, `definir_primer_paso`, `ordenar_panorama`, `confirmar_saldo_stock_deuda`, `mantener_disciplina`, `optimizar_deuda_cara` | Canonical narrative next-step sentences | `_nextStepTextForActionKey`, tone apply, stamp exact-match, tone detect | `js/ui.js:2475-2486` |
| `CZ_DTI_ACCION_PRIORITARIA` | (none; single string) | Same sentence as `known:confirmar_saldo_stock_deuda` | DTI ≥ 1 text; stamp `const:dti_accion_prioritaria` | `js/ui.js:1811-1812` |
| `_ZERO_ACTIVE_DEBT_NEXT_STEP` | (none) | Zero-active-debt sentence | Legacy resolve; stamp `const:zero_active_debt` | `js/ui.js:2116` |
| `_REVISAR_INGRESOS_NEXT_STEP` | (none) | Ingreso-cero sentence | Coherence `revisar_ingresos`; stamp `const:revisar_ingresos` | `js/ui.js:2117-2118` |
| L2 healthy_organized literals | `optimizar_deuda_cara` / `mantener_disciplina` | Same sentences as the two known keys | `resolveDashboardCoherence` | `js/ui.js:2424-2429` |
| `textoParaNarrativa` `siguiente_paso` map | 8 acciones (no `mantener_disciplina`, no `optimizar_deuda_cara`) | Same sentences as the overlapping known keys | Motor fills `narrativa_jerarquizada[].texto`; `_nextStepTextForActionKey` may return `n.texto` | `js/algorithms.js:1732-1743`, `2095-2097`; consumer `js/ui.js:2537-2554` |
| `_nextStepTextForActionKey` | actionKey | DTI const, else `n.texto` / `textoParaNarrativa(n)` if `n.accion === actionKey`, else known catalog | `resolveNextStepContent` narrative base | `js/ui.js:2537-2554` |
| DEV mirror `KNOWN` / `CONST` / `COH` | same ids | copies of the production strings | ASSISTANT-01 harness only | `dev/assistant-01/text-ref-catalog.js` |

**CONFIRMED_FROM_TEST:** byte-identical overlaps:

- `textoParaNarrativa.siguiente_paso[k] === _NEXT_STEP_KNOWN_TEXTS[k]` for all 8 shared keys
- `CZ_DTI_ACCION_PRIORITARIA === _NEXT_STEP_KNOWN_TEXTS.confirmar_saldo_stock_deuda`
- L2 alto literal === `known:optimizar_deuda_cara`
- L2 mantener literal === `known:mantener_disciplina`

**Is everything needed for `text_ref → copy` already present, distributed?**

**CONFIRMED_FROM_CODE:** yes for ids the stamp actually emits (`known:*` catalog keys, `const:revisar_ingresos`, `const:zero_active_debt`, `const:dti_accion_prioritaria`, `coh:healthy_alto`, `coh:healthy_mantener`). There is no single production reverse table. Composition is: split prefix, then look up the corresponding existing constant/map.

**CONFIRMED_FROM_CODE:** that composition does **not** recover a non-catalog string if priority-7 fallback stamped `known:<actionKey>`.

Duplicate copy across ids (id→copy still unique per id):

| Ids | Shared copy |
|---|---|
| `const:dti_accion_prioritaria`, `known:confirmar_saldo_stock_deuda` | DTI / confirmar sentence |
| `coh:healthy_alto`, `known:optimizar_deuda_cara` | optimizar sentence |
| `coh:healthy_mantener`, `known:mantener_disciplina` | mantener sentence |

Stamp prefers `const:dti` over `known:confirmar` because the DTI const is checked before the known loop. `_nsTextRefFromCoherence` prefers `coh:*` by key even though `_nsTextRefForEffectiveText` would have emitted `known:*` on the same string (exact match runs before prefix `coh`).

---

## 5. Does `text_ref → copy` exist today?

**Classification: `REVERSIBLE_BY_COMPOSITION`**

Not **REVERSIBLE_ALREADY_EXISTS**: there is no production function that, given `text_ref`, returns the effective copy. **CONFIRMED_FROM_CODE**. DEV `resolveTextRefDevOnly` is explicitly not that function.

Not **NOT_REVERSIBLE_WITH_CURRENT_DATA** for the families observed in the real corpus: every exercised visible `text_ref` composed back to the HTML-visible string using only the maps in §4. **CONFIRMED_FROM_TEST**.

The unused fallback in §7 is a latent lossy branch. It does not change the classification of the ids actually produced by current copy sources. It is recorded separately; it is not treated as a PASS obtained by avoiding the branch — the corpus was the full PROV-NS baseline plus directed PROV-NS cases, not a filtered subset.

Composition used for the audit (not a production resolver):

- `known:<k>` → `_NEXT_STEP_KNOWN_TEXTS[k]`
- `const:revisar_ingresos` → `_REVISAR_INGRESOS_NEXT_STEP`
- `const:zero_active_debt` → `_ZERO_ACTIVE_DEBT_NEXT_STEP`
- `const:dti_accion_prioritaria` → `CZ_DTI_ACCION_PRIORITARIA`
- `coh:healthy_alto` → L2 / `known:optimizar_deuda_cara` string
- `coh:healthy_mantener` → L2 / `known:mantener_disciplina` string

---

## 6. Roundtrip on real cases

Method: load product via `dev/decision-provenance/harness.js` with `CZ_DECISION_PROVENANCE=true`; run `profiles.allBaselineProfiles()` the same way as baseline capture; plus directed cases already used by `ns-layer-a-qa.js` (tone, healthy, revisar, legacy) and additional directed cases needed to hit families absent from the baseline. Visible copy taken from actual HTML (`renderPrimaryActionCard`, `_renderDashboardHeroCard`, `renderNarrativaInterpretacion`). Recovered copy taken by composition over production maps. No production resolver was added.

ASSISTANT-01 fixtures that already ship `visible_copy` are **contract fixtures**, not production roundtrip. **COVERAGE_EXCEPTION** for this audit.

### By family / case

| Case / family | `text_ref` example | Surface | Result | Evidence |
|---|---|---|---|---|
| known normal (`ordenar_panorama`) | `known:ordenar_panorama` | Primary | ROUNDTRIP_PASS | `FS_A_INSUFF_INCOME`, others |
| known (`mantener_disciplina` without coh) | `known:mantener_disciplina` | Primary | ROUNDTRIP_PASS | `B_HEALTHY_NO_DEBT`, `FS_A_INSUFF_ESCAPE_TO_OPT` |
| known (`liberar_margen` no tone) | `known:liberar_margen` | Primary | ROUNDTRIP_PASS | `DIRECTED_KNOWN_LIBERAR_NO_TONE` |
| known (`reducir_costo_prioritaria`) | `known:reducir_costo_prioritaria` | Primary | ROUNDTRIP_PASS | `DIRECTED_CREDIT_BUILDING` |
| known (`estabilizar_atraso` via tone) | `known:estabilizar_atraso` | Primary | ROUNDTRIP_PASS | `FS_A_REC_FLUJO_NEG`, `DIRECTED_TONE_AT_RISK` |
| const DTI | `const:dti_accion_prioritaria` | Primary | ROUNDTRIP_PASS | many `FS_A_REC_*`, `B_LOW_DEBT_STABLE` |
| const revisar | `const:revisar_ingresos` | Primary | ROUNDTRIP_PASS | `DIRECTED_REVISAR_INGRESOS` |
| const zero active debt | `const:zero_active_debt` | Primary | ROUNDTRIP_PASS | `DIRECTED_ZERO_ACTIVE_DEBT_LEGACY` (legacy, no narrative) |
| coh healthy mantener | `coh:healthy_mantener` | Primary | ROUNDTRIP_PASS | `FS_A_OPT_CLEAN`, `DIRECTED_HEALTHY_COH` |
| coh healthy alto | `coh:healthy_alto` | Primary | ROUNDTRIP_PASS | `DIRECTED_COH_HEALTHY_ALTO` |
| tone swap AT_RISK | `known:estabilizar_atraso` while `value=liberar_margen` | Primary | ROUNDTRIP_PASS | POST-tone copy recovered; value not used |
| tone swap HEALTHY | `known:mantener_disciplina` while `value=optimizar_deuda_cara` | Primary | ROUNDTRIP_PASS | `DIRECTED_TONE_HEALTHY_SWAP` |
| Primary Action Card | (as above) | primary_action_card | ROUNDTRIP_PASS | dominant surface in corpus |
| Hero embedded | `coh:healthy_mantener` | hero_embedded | ROUNDTRIP_PASS | `DIRECTED_HERO_COH_MANTENER` only, via resolve-empty stub |
| Hero natural (no stub) | — | — | NOT_EXERCISED | Primary owned all complete profiles with text |
| Narrativa “Primer paso recomendado” | — | — | NOT_EXERCISED | omitted when `coherence.nextStepText` is set; incomplete uses other HTML |
| Acción prioritaria card | — | — | NOT_EXERCISED | `hideAccionPrioritaria` always true |
| Incomplete, nothing shown | `known:ordenar_panorama` computed | none | COVERAGE_EXCEPTION | `FS_A_INSUFF_INPUTS`, `B_INCOMPLETE_EXPENSES` — HTML has no next-step catalog copy; provenance still has a ref |
| Fallback `known:actionKey` in corpus | — | — | NOT_EXERCISED | `fallbackHits: []` on 51 cases |
| Fallback synthetic | `known:liberar_margen` for non-catalog text | n/a | ROUNDTRIP_FAIL if composed | not a product fixture; demonstrates loss only |
| `known:consolidar_deuda` | — | — | NOT_EXERCISED | catalog key never stamped in corpus |
| `known:formalizar_informal` | — | — | NOT_EXERCISED | same |
| `known:definir_primer_paso` | — | — | NOT_EXERCISED | same |
| `known:optimizar_deuda_cara` as id | — | — | NOT_EXERCISED | same copy appeared as `coh:healthy_alto` or was tone-swapped to mantener |
| `known:confirmar_saldo_stock_deuda` as id | — | — | NOT_EXERCISED | DTI string always won `const:dti_accion_prioritaria` first |
| `known:estabilizar_atraso` as `value` | — | — | NOT_EXERCISED | corpus used it as POST-tone `text_ref` with `value=liberar_margen` |
| ASSISTANT-01 `visible_copy` fixtures | pre-resolved in fixture | n/a | COVERAGE_EXCEPTION | does not prove production reverse |

Counts from the audit run: **49 ROUNDTRIP_PASS**, **0 ROUNDTRIP_FAIL** on product cases, **2 COVERAGE_EXCEPTION** (incomplete, no visible next-step). Fallback hits in product cases: **0**.

---

## 7. `known:actionKey` fallback (`js/ui.js:2639`)

### CONFIRMED_FROM_CODE

1. **When it runs:** `text` is non-empty; it is not the three const strings; it is not an exact value of `_NEXT_STEP_KNOWN_TEXTS`; it does not match the two coh prefix rules; and `actionKey` exists in `_NEXT_STEP_KNOWN_TEXTS`.
2. **What it uses:** `actionKey` only. The shown `text` is ignored once those earlier checks fail.
3. **Can effective text differ from the catalog row for that actionKey?** Yes. That is the entry condition: exact catalog match already failed.
4. **Does that lose information?** Yes. The id `known:<actionKey>` is indistinguishable from a true exact-match stamp of that catalog row. Composition against `_NEXT_STEP_KNOWN_TEXTS[actionKey]` returns the catalog sentence, not the shown string.
5. **Can the shown copy be recovered from another property that already exists on provenance?** No. Provenance stores `value`, `text_ref`, `reason_code`, `evidence`, `tone_code`, `display`. It does not store the literal copy. `value` is the semantic actionKey and can already diverge from visible copy (tone). Re-running `resolveNextStepContent` would return the live string, but that is not a property of the persisted provenance object.
6. **Is the branch reachable?** Yes. `_nsTextRefForEffectiveText("Copy no catalogado que el usuario vería.", "liberar_margen")` returns `known:liberar_margen`.
7. **Does it appear in baseline / ASSISTANT-01 / directed PROV-NS cases?** No.

How current copy sources relate: `_nextStepTextForActionKey` returns DTI const, `n.texto` from `textoParaNarrativa`, or `_NEXT_STEP_KNOWN_TEXTS[actionKey]`. Those strings currently equal the known catalog (measured). Tone returns catalog strings. Coherence L2 literals equal known catalog. Legacy zero-debt / revisar / DTI are the const strings (priorities 1–3). **INFERENCE:** with those sources unchanged, priority 7 does not fire.

### Classification

**LOSSY_NOT_RECOVERABLE** (structural, from `text_ref` + existing maps / provenance fields)

**NOT_EXERCISED** (PROV-NS baseline, directed PROV-NS cases, ASSISTANT-01 fixtures)

Not **SAFE_REVERSIBLE**: the id does not encode whether priority 4 or 7 produced it.

Not **LOSSY_BUT_RECOVERABLE**: no other persisted provenance field holds the shown string.

---

## 8. Uncertainties / NOT_EXERCISED

- Natural Hero-owns-next-step (no harness stub): **NOT_EXERCISED** in the motor corpus.
- Narrativa “Primer paso recomendado” as a visible next-step surface: **NOT_EXERCISED** when coherence has `nextStepText`.
- “Acción prioritaria” card: **NOT_EXERCISED** (`hideAccionPrioritaria` always true).
- Catalog keys `consolidar_deuda`, `formalizar_informal`, `definir_primer_paso`: **NOT_EXERCISED** as stamped ids.
- `known:optimizar_deuda_cara` and `known:confirmar_saldo_stock_deuda` as emitted ids: **NOT_EXERCISED** (same copy emitted as `coh:*` / `const:dti`).
- Fallback `known:actionKey` on a real user profile: **NOT_EXERCISED**.
- Hypothetical tone change that detect would miss: **NOT_EXERCISED**; current tone function cannot produce it.
- `_nsTextRefFromCoherence` healthy/revisar stamps if `nextStepText` were desynced from the key: **NOT_EXERCISED**; today both are assigned in the same `resolveDashboardCoherence` block.

**INFERENCE:** `text_ref` identifies the visible copy for every path the current copy sources actually take. It is not the render source of truth. There is still no production reverse function.

---

## 9. Files

| File | Action |
|---|---|
| `dev/assistant-01/FINDINGS-TEXT-REF-RESOLUTION.md` | Created (this document) |

No production files modified. No PROV-NS files modified. No System Prompt / harness / catalog changes.

```text
PRODUCTION_CODE_CHANGES: NONE
```
