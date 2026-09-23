# FINDINGS — ASSISTANT HARNESS v1

**Baseline:** `ASSISTANT_HARNESS_BASELINE_V1`  
**Captured:** 2026-08-12T17:05:35.349Z  
**HEAD:** `f79cdc9eb00b91592736956897135e3794450f45`  
**System Prompt v1 SHA-256:** `6086b4ccaaa7fc416f10009f6c7121dcf92b8097c8b007508c40eccc1e723580`  
**PRODUCTION_CODE_CHANGES:** NONE

This document records the first harness run. It does **not** recapture after prompt or production edits. Later prompt changes must create a new results version and compare against this baseline.

ASSISTANT-01 is **not** complete. This stage only measures whether the frozen System Prompt + closed contracts survive first QA.

---

## A. Executive summary

LAYER 1 (PRE_LLM_GUARDS) was executed against contractual DEV fixtures: **19/19 PASS**. DEV allowlist/mismatch validation: **3/3 PASS**.

LAYER 2 (LLM_RESPONSE_CONTRACT) was **not** executed: no `CZ_CLAUDE_API_KEY` / `ANTHROPIC_API_KEY` in this environment. Status: `LIVE_MODEL_QA_NOT_EXERCISED`. 29 LLM fixtures exist and were not scored. No model outputs were invented.

`text_ref` has a production stamp (text → id) but **no production id → visible copy resolver**. Classification: `TEXT_REF_RESOLUTION_GAP` for integration readiness. Contract fixtures that include `visible_copy` already resolved do **not** prove the real pipeline.

No production assistant_context builder, DTO endpoint, or interpretation-assistant adapter exists. The harness builds allowlisted contexts from DEV fixtures only.

---

## B. Infraestructura encontrada

| Piece | Status |
|---|---|
| Capability / provenance design | CLOSED (do not reopen) |
| `assistant_context` production builder | **NOT_PRESENT** |
| Allowlisted DTO endpoint for this assistant | **NOT_PRESENT** |
| Interpretation assistant system prompt (prior) | **NOT_PRESENT** (Plus IA prompt is a different product) |
| OpenAI/Claude adapter for this assistant | **NOT_PRESENT** |
| Plus Claude proxy `api/plus/generate.js` | Exists; **not used** (different prompt, different product) |
| Intent router / free text | DEFERRED_TO_V1.1 |
| Prior assistant harness | **NOT_PRESENT** |
| Provenance QA harness | `dev/decision-provenance/harness.js` (unrelated; not modified) |

Harness therefore constructs `assistant_context` from DEV-only fixtures. No product endpoint was implemented.

---

## C. text_ref audit

### How `next_step_provenance.text_ref` is generated today

`_nsTextRefForEffectiveText(text, actionKey)` in `js/ui.js:2621-2641` maps **effective visible text → id**:

1. exact match `_REVISAR_INGRESOS_NEXT_STEP` → `const:revisar_ingresos`
2. exact match `_ZERO_ACTIVE_DEBT_NEXT_STEP` → `const:zero_active_debt`
3. exact match `CZ_DTI_ACCION_PRIORITARIA` → `const:dti_accion_prioritaria`
4. exact match in `_NEXT_STEP_KNOWN_TEXTS` → `known:<key>`
5. prefix match for healthy coherence copy → `coh:healthy_alto` / `coh:healthy_mantener`
6. **fallback:** `known:<actionKey>` if that key exists in the catalog, even if `text` is not that key's copy (`js/ui.js:2639`)

`_nsTextRefFromCoherence` (`js/ui.js:2643-2651`) prefers coherence keys before falling through to the text matcher.

### Formats that exist in production

- `known:...` from `_NEXT_STEP_KNOWN_TEXTS` (`js/ui.js:2475-2486`)
- `const:revisar_ingresos` / `const:zero_active_debt` / `const:dti_accion_prioritaria` (`js/ui.js:1811`, `2116-2118`)
- `coh:healthy_alto` / `coh:healthy_mantener` (`js/ui.js:2424-2429`, `2631-2638`)
- `null` when text is empty (`js/ui.js:2622`)

### Reverse catalog / function

**No production function** `text_ref → copy`. Stamping is one-way (copy → id).

A DEV-only mirror of the same constants lives in `dev/assistant-01/text-ref-catalog.js`. That mirror is **not** a new catalog and is **not** wired into production.

### Can copy be recovered unambiguously from `text_ref`?

For the known/const/coh IDs above, **yes, if** a resolver is given those private constants. Several IDs share copy:

- `const:dti_accion_prioritaria` === `known:confirmar_saldo_stock_deuda`
- `coh:healthy_alto` === `known:optimizar_deuda_cara`
- `coh:healthy_mantener` === `known:mantener_disciplina`

ID → copy is unambiguous. Copy → ID is not (stamping prefers `const:` then `known:` then `coh:`).

The fallback `known:actionKey` (`js/ui.js:2639`) can stamp an ID whose catalog copy is **not** the shown text. That is a real integration risk.

### PRE-tone vs POST-tone

POST-tone. After `_applyNextStepNarrativeProfileTierTone` (`js/ui.js:2562-2577`), if text changed, `text_ref` is re-stamped from the **effective** text (`js/ui.js:2841-2846`). `value` (actionKey) is unchanged. `tone_code` records the swap (`NS_TONE_AT_RISK_SWAP_ESTABILIZAR`, `NS_TONE_HEALTHY_SWAP_MANTENER`).

### Interaction: value / text_ref / tone_code

| Field | Role |
|---|---|
| `value` | Semantic action key; tone must not change it |
| `text_ref` | Identifier of **visible** copy after tone |
| `tone_code` | Null, or the swap that made value ≠ visible copy |

Resolution can be done without an LLM **if** a deterministic id→copy map is exposed. Production does not expose one.

### Classification

`TEXT_REF_RESOLUTION_GAP` — integration readiness.

Contract tests that ship `visible_copy` already resolved are **contract tests**, not integration proof.

---

## D. PRE_LLM guards

Executed. **19/19 PASS.**

| ID | Result |
|---|---|
| D1_why_available | PASS |
| D1_why_missing | PASS |
| D2_blocker_available | PASS |
| D2_blocker_missing_null | PASS |
| D2_blocker_missing_empty | PASS |
| D3_ns_display_none | PASS (no question, no LLM call) |
| D4_ux1d2_suppressed_not_qualified | PASS |
| D4_canonical_visible_qualifies | PASS |
| D4_ver_mas_collapsed_qualifies | PASS (PROV-ACT: collapsed still canonical) |
| D5_visible_without_selection_reason | PASS |
| D6_multiple_no_selection | PASS (question available; chips; no LLM) |
| D6_multiple_after_disambiguation | PASS (context for selected action only) |
| D7_all_four_top3 | PASS (WHY, BLOCKER, NEXT; ACTION available but not top 3) |
| D7_no_why / no_blocker / no_next / no_action / only_action | PASS (dynamic promotion) |
| P_text_ref_null_display_visible | PASS (question may be available; LLM call blocked) |

These guards are **DEV contractual logic**, not production UI. Wiring them into product is a later stage.

Builder mismatch rejects (LAYER 1 DTO): **3/3 PASS** (`Q_builder_*`).

---

## E. Fixture matrix

All LLM fixtures are `SYNTHETIC_CONTRACT_FIXTURE` unless noted. None are evidence of a live product branch.

| ID | Intent | Layer | Kind | Live |
|---|---|---|---|---|
| D1–D7, P_text_ref_null_display_visible | guards | PRE_LLM | guard | n/a (PASS) |
| F_why_normal / min / severity_literal | WHY_DIAGNOSIS | LLM | happy | NOT_EXERCISED |
| G_why_missing_evidence | WHY_DIAGNOSIS | LLM | missing B | NOT_EXERCISED |
| F_mb_linked_metric / no_linked / J_mb_multiple | MAIN_BLOCKER | LLM | happy/adv | NOT_EXERCISED |
| G_mb_missing_causa | MAIN_BLOCKER | LLM | type A forced | NOT_EXERCISED |
| F_act_selection_simple / disambiguated | EXPLAIN_ACTION | LLM | happy | NOT_EXERCISED |
| N_act_selection_plus_retention | EXPLAIN_ACTION | LLM | retention | NOT_EXERCISED |
| F_ns_normal / tone_null | EXPLAIN_NEXT_STEP | LLM | happy | NOT_EXERCISED |
| O_ns_tone_present_aligned / value_textref_diverge | EXPLAIN_NEXT_STEP | LLM | critical | NOT_EXERCISED |
| P_ns_text_ref_null_forced / D3_ns_display_none_forced | EXPLAIN_NEXT_STEP | LLM | type A | NOT_EXERCISED |
| G_ns_missing_evidence | EXPLAIN_NEXT_STEP | LLM | missing B | NOT_EXERCISED |
| H_gravity_no_literal / authorized_alto | WHY_DIAGNOSIS | LLM | adversarial | NOT_EXERCISED |
| I_few_numbers / ratio_threshold_no_diff | WHY_DIAGNOSIS | LLM | adversarial | NOT_EXERCISED |
| K_recommendation_tempt | MAIN_BLOCKER | LLM | adversarial | NOT_EXERCISED |
| L_credit_prediction | WHY_DIAGNOSIS | LLM | adversarial | NOT_EXERCISED |
| M_mechanics_leakage | EXPLAIN_ACTION | LLM | adversarial | NOT_EXERCISED |
| Q_mismatch_* (3) | mixed | LLM forced + builder | mismatch | builder PASS; LLM NOT_EXERCISED |
| R_defense_in_depth | WHY_DIAGNOSIS | LLM | SYNTHETIC_DEFENSE_IN_DEPTH_TEST | NOT_EXERCISED |

MAIN_BLOCKER fixtures include synthetic `metric_links`. Production `interpretarDiagnostico` does **not** emit that field (`js/algorithms.js:2100-2106`). That is a `CONTEXT_GAP` for a future builder, not a harness FAIL.

---

## F. Happy paths

NOT_EXERCISED (no live model). Fixtures exist for all four IN_SCOPE_V1 intents.

---

## G. Missing data

Type A (should never reach LLM): `G_mb_missing_causa`, `P_ns_text_ref_null_forced`, `D3_ns_display_none_forced`, `Q_mismatch_*`. PRE_LLM/builder reject in DEV. Prompt fallback not scored.

Type B (valid DTO, incomplete explanation): `G_why_missing_evidence`, `G_ns_missing_evidence`. NOT_EXERCISED.

---

## H. Gravedad / calificación

NOT_EXERCISED. Evaluator is ready: mechanical list of eight families plus semantic paraphrases; amplification of authorized `alto` is a separate check.

---

## I. Números

NOT_EXERCISED. Evaluator allowlists numbers present in `assistant_context` JSON and flags computed-diff hints (`7 puntos`, `0.07`).

---

## J. Causalidad adicional

NOT_EXERCISED. Fixtures: linked vs unlinked metrics; causa without metric_links.

---

## K. Recomendación / simulación / contrafactual

NOT_EXERCISED. Phrase heuristics in `evaluate.js`.

---

## L. Predicción crediticia

NOT_EXERCISED.

---

## M. Internal mechanics leakage

NOT_EXERCISED. Fixtures deliberately contain `reason_code`, `source_layer`, `ACT_PICK_C1`, `ACT_TAX_RESTORE_MIN`, `text_ref` IDs.

---

## N. Retention

NOT_EXERCISED. Fixture `N_act_selection_plus_retention` includes `ACT_TAX_RESTORE_MIN`.

---

## O. tone / text_ref divergence

NOT_EXERCISED. Critical fixtures `O_ns_value_textref_diverge` / `O_ns_tone_present_aligned`: `value=liberar_margen`, visible copy = estabilizar atrasos, `tone_code=NS_TONE_AT_RISK_SWAP_ESTABILIZAR`. Contract only: `visible_copy` is pre-resolved in the fixture (`TEXT_REF_RESOLUTION_GAP` for real pipeline).

---

## P. Intent / context mismatch

DEV builder rejects three mismatched DTOs: **PASS**. Forced LLM calls NOT_EXERCISED. Distinguishes `CONTEXT_BUILDER_GAP` (builder) vs `PROMPT_BEHAVIOR` (model, not scored).

---

## Q. Defense-in-depth synthetic test

`R_defense_in_depth` is `SYNTHETIC_DEFENSE_IN_DEPTH_TEST`. NOT_EXERCISED. A future FAIL would be prompt-robustness, not a demonstrated production attack surface (assistant_context is designed to carry deterministic enums/numbers only; no free-text user surface in v1).

---

## R. Output format

Evaluator ready (plain paragraph, no markdown/prefix/quotes/newlines). Length recorded, 2–5 sentences not a hard fail. NOT_EXERCISED on live output.

---

## S. Variance

NOT_EXERCISED. Harness would repeat 3×: gravity, numbers, recommendation, credit, tone divergence, missing evidence. Config if live: model `CZ_CLAUDE_MODEL` or `claude-sonnet-4-5`, `temperature: 0`, `max_tokens: 400`.

---

## T. PASS/FAIL totals

| Layer | PASS | FAIL | NOT_EXERCISED |
|---|---:|---:|---:|
| PRE_LLM_GUARDS | 19 | 0 | 0 |
| DTO mismatch builder | 3 | 0 | 0 |
| LLM_RESPONSE_CONTRACT | 0 | 0 | 29 |
| Variance runs | 0 | 0 | 6 cases × 3 |

No LLM FAIL was recorded because no LLM call was made.

---

## U. Failure taxonomy

No LAYER 2 FAILs.

Open classifications (not test FAILs):

| ID | Category | Notes |
|---|---|---|
| Production id→copy | `TEXT_REF_RESOLUTION_GAP` | No exported resolver |
| `metric_links` | `CONTEXT_GAP` | Needed by prompt; not in production iv2 |
| Production builder/endpoint | `CONTEXT_BUILDER_GAP` | Not implemented (by freeze) |
| Live model | `LIVE_MODEL_QA_NOT_EXERCISED` | No credential in this environment |

Known production bugs were **not** fixed and are not harness FAILs: `BUG-NS-GUARD-REASON` NOT_FIXED, `BUG-FS-CLARITY-LOW-MISS` unchanged, `PROVENANCE-SOURCE-LAYER-DEBT` unchanged.

---

## V. Blockers

1. **Live model QA cannot run here** without `CZ_CLAUDE_API_KEY` or `ANTHROPIC_API_KEY`. Prompt-behavior baseline is therefore incomplete.
2. **`TEXT_REF_RESOLUTION_GAP`** blocks claiming EXPLAIN_NEXT_STEP integration readiness.
3. **No production assistant_context builder** — LAYER 1 tests the DEV contract, not product wiring.
4. MAIN_BLOCKER **explicit metric linkage** is not a production field (`CONTEXT_GAP`).

None of these required production edits for this run. Freeze held.

---

## W. Recomendaciones para la siguiente etapa

1. Re-run `node dev/assistant-01/harness.js --live` with a real key. Write a **new** results file (do not overwrite `baseline-v1/`). Compare against this baseline.
2. Do not change System Prompt v1 until LAYER 2 FAILs are classified (`PROMPT_GAP` vs `CONTEXT_GAP` vs variance).
3. Design (not implement in a “make tests pass” pass) a production `text_ref` → visible copy resolver from existing constants; attach `visible_copy` in the future builder.
4. Decide how MAIN_BLOCKER `metric_links` is derived deterministically from causa rules — still a context-design task.
5. Keep FREE_TEXT / router / OUT_OF_SCOPE deferred.
6. Keep BUG-NS-GUARD-REASON and SOURCE-LAYER-DEBT out of this track until explicitly reopened.

---

## Files

Created under `dev/assistant-01/` only. `dev/narrative-05-qa.js` untouched.
