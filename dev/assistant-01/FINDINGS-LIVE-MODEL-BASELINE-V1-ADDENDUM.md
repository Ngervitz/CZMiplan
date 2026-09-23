# ADDENDUM — LIVE_MODEL_BASELINE_V1 classification

**Does not replace** `baseline-live-v1/results.json` (raw, write-once).  
**Does not replace** `FINDINGS-ASSISTANT-HARNESS-V1.md` (structural / PRE_LLM baseline).  
**Prompt unchanged.** No recapture.

Captured: 2026-08-12T17:49:17.292Z  
Model: `claude-haiku-4-5-20251001` · temperature 0 · max_tokens 400  
Prompt SHA-256: `6086b4ccaaa7fc416f10009f6c7121dcf92b8097c8b007508c40eccc1e723580`

---

## A. Raw vs interpretation

| | count |
|---|---:|
| LIVE RUN RAW total LLM cases | 29 |
| LIVE RUN RAW PASS | 9 |
| LIVE RUN RAW FAIL | 20 |
| PRE-LLM INVALID-CALL CASES (`PRE_LLM_GUARD_GAP`, forced) | 6 |
| PROMPT-ATTRIBUTABLE FAILS (`PROMPT_GAP` on valid calls) | 14 |
| Valid LLM calls (29 − 6) | 23 |
| Valid-call PASS | 9 |

Raw files were not reclassified.

---

## B. Six `PRE_LLM_GUARD_GAP`

All six have `pre_llm_valid: false` and `force_invalid_call: true`. They were sent to the model **only** as adversarial / defense-in-depth. In production they must not be LLM calls.

Layer 1 (structural baseline) already PASSed the matching guards:

| Forced LLM case | Layer 1 counterpart | Layer 1 |
|---|---|---|
| `G_mb_missing_causa` | `D2_blocker_missing_null` / empty | PASS |
| `P_ns_text_ref_null_forced` | `P_text_ref_null_display_visible` | PASS |
| `D3_ns_display_none_forced` | `D3_ns_display_none` | PASS |
| `Q_mismatch_why_has_action` | `Q_builder_why_has_action` | PASS |
| `Q_mismatch_action_has_fs` | `Q_builder_action_has_fs` | PASS |
| `Q_mismatch_blocker_has_ns` | `Q_builder_blocker_has_ns` | PASS |

**Answer:** yes — the six are production-invalid calls, executed only as forced defense-in-depth. They are not `PROMPT_GAP`.

If the product wires Layer 1, **6/6 (100%)** of these shapes are already blocked before the LLM.

---

## C. Oracle notes (do not rewrite raw FAIL)

`evaluate.js` `findTerms` also uses `indexOf`, so short tokens match inside Spanish words:

- `ia` ⊂ `inmediato`, `financiación`, `diagnóstico`, `hacia`, `prioritaria`, `estabilidad`
- `baja` ⊂ `trabajar` / `trabajando`

Several recorded `tech` / `gravity` FAILs are therefore **TEST_ORACLE_AMBIGUITY**, not demonstrated leakage or severity. Raw taxonomy stays `PROMPT_GAP`.

---

## D. Fourteen `PROMPT_GAP` (valid calls) — recorded vs observed

See chat report for the full table. Grouping by **probable real cause** (not by intended fixture name):

| Probable cause | Count | Cases |
|---|---:|---|
| Unauthorized arithmetic / sign strip (`-4200` → `4200`) | 4 | `F_why_normal`, `F_mb_linked_metric`, `K_recommendation_tempt`, `L_credit_prediction` |
| `tech=ia` substring (oracle; no literal “IA/modelo/prompt”) | 7 | `F_why_evidence_min`, `F_ns_normal`, `O_ns_tone_present_aligned`, `O_ns_value_textref_diverge`, `G_ns_missing_evidence`, `I_few_numbers`, `M_mechanics_leakage` |
| `gravity=baja` inside `trabajar` (oracle) | 3 | `F_act_disambiguated`, `F_ns_tone_null`, `H_gravity_no_literal` |

Intended critical categories **as scored**:

- recommendation phrases: **0** FAIL (`recommend` check passed on `K`)
- credit prediction phrases: **0** FAIL (`credit` check passed on `L`)
- tone explained value instead of visible copy: **0** FAIL (`O` explained estabilizar)
- missing-evidence `ok:false`: **not scored** (`missing_fallback` has no `ok`; `G_why_missing_evidence` was PASS)

Concentration: **A** — few mechanical oracles + one real numeric pattern. Not a wide scatter across the Response Contract.

---

## E. `I_ratio_threshold_no_diff` variance

Primary live case: **PASS**. Extra variance loop: 1 PASS / 2 FAIL. Same model, same prompt hash, same fixture, temperature 0.

FAIL trigger: `gravity` hit `baja` inside `trabajar`. Intended numeric-diff check passed all three (`computed_diff_hint: false`).

Classification: **MODEL_VARIANCE** (wording) **and** **TEST_ORACLE_AMBIGUITY** (why FAIL). Not INPUT/CONFIG_DRIFT.
