# FINDINGS — PROV-NS (Etapa 3 closure)

**Initiative:** DECISION-PROVENANCE-01  
**Phase:** PROV-NS — implementation + QA  
**Design:** `DESIGN-PROV-NS-ETAPA2.md` (+ amendment `source_layer` stable enum, commit `b707853`)  
**Flag:** `CZ_DECISION_PROVENANCE`

```text
PROV-NS: CLOSED
```

---

## 1. Implementation summary

| File | Change |
| ---- | ------ |
| `js/ui.js` | Additive `next_step_provenance` via `resolveNextStepContent` provisional + `attachNextStepProvenance` finalize; call from `renderTabPlan` |
| `js/config.js` | Comment only (flag already existed) |
| `dev/decision-provenance/harness.js` | `captureNextStep` calls attach + returns provenance |
| `dev/decision-provenance/ns-layer-a-qa.js` | Structural QA |

**Instrumentation points**

1. L3 `resolveNextStepContent` — stamps content fields when flag ON (`provenance` on return + used by attach)
2. L3b tone — detected post `_applyNextStepNarrativeProfileTierTone` (function return unchanged); sets `tone_code` + updates `text_ref`
3. L4 `attachNextStepProvenance` — display ownership; Hero may replace winner with `NS_L4_HERO`

---

## 2. Final provenance contract

```js
diag.next_step_provenance = {
  schema_version: 1,
  decision: "next_step",
  value: "<actionKey>",
  text_ref: "known:…|const:…|coh:…",
  reason_code: "NS_…",
  source_layer: "NS_L3_CONTENT" | "NS_L4_HERO",
  evidence: { /* ≤8 scalars */ },
  tone_code: undefined | "NS_TONE_…",
  display: { status: "visible"|"none", surface: "primary_action_card"|"hero_embedded"|"none" }
}
```

FLAG OFF: field absent.

---

## 3. Exact reason-code catalog

See coverage §13. Approved codes from DESIGN §6 (no wildcards).

---

## 4. Exact source-layer catalog

| ID | Meaning |
| -- | ------- |
| `NS_L3_CONTENT` | Content from resolve path (Primary / computed / none) |
| `NS_L4_HERO` | Visible package from Hero fallback |

Tone never changes `source_layer`.

---

## 5–8. Matrices

Covered in `ns-layer-a-qa.js` output: evidence ≤8, text_ref on all visible exercised cases, tone liberar→estabilizar + healthy swap, display Primary / Hero / none.

---

## 9. Decision/display test

Incomplete expenses: provenance exists with `value`+`reason_code`, `display.status/surface = none`, FLAG OFF/ON functional equality.

---

## 10. End-to-end preservation

Resolve provisional → attach keeps `value`/`reason_code`/`text_ref`/`tone_code`, sets display. PASS in QA.

---

## 11. FLAG OFF/ON

Motor corpus: functional `{actionKey,text,source,primary_owns_display}` identical. FLAG OFF never exposes `next_step_provenance`.

---

## 12. Baseline

Existing `baseline-v1` next_step actionKey+text: **0 mismatches** (motor profiles). **Not recaptured.**

---

## 13. Structural QA coverage

| reason_code | Status |
| ----------- | ------ |
| NS_LEGACY_NO_NARRATIVE | EXERCISED_PASS |
| NS_NARR_FOCUS_NONDEFAULT | EXERCISED_PASS |
| NS_COH_REVISAR_INGRESOS | EXERCISED_PASS (forced reason) |
| NS_COH_HEALTHY_OPTIMIZATION | EXERCISED_PASS (forced conf) |
| NS_NARR_CLARITY | EXERCISED_PASS |
| NS_NARR_RECOVERY_DTI | EXERCISED_PASS |
| NS_NARR_RECOVERY_MORA | COVERAGE_EXCEPTION (DTI/focus usually wins first) |
| NS_NARR_RECOVERY_LIBERAR | EXERCISED_PASS |
| NS_NARR_STABILIZATION | COVERAGE_EXCEPTION (shadowed by FOCUS_NONDEFAULT) |
| NS_NARR_OPT_CREDIT_BUILDING | COVERAGE_EXCEPTION (unreachable: focus≠DEFAULT → FOCUS_NONDEFAULT) |
| NS_NARR_OPT_LEARNING | COVERAGE_EXCEPTION (same) |
| NS_NARR_OPT_ZERO_DEBT | COVERAGE_EXCEPTION (harness often OPT_MANTENER path) |
| NS_NARR_OPT_COSTO_ALTO | EXERCISED_PASS |
| NS_NARR_OPT_MANTENER | EXERCISED_PASS |
| NS_FALLBACK_COHERENCE_OR_LEGACY | COVERAGE_EXCEPTION (rare) |
| NS_HERO_COH_HEALTHY_MANTENER | EXERCISED_PASS |
| NS_HERO_COH_HEALTHY_ALTO | COVERAGE_EXCEPTION |
| NS_HERO_COH_REVISAR_INGRESOS | COVERAGE_EXCEPTION |
| NS_HERO_COH_LEGACY | COVERAGE_EXCEPTION |
| NS_HERO_RESOLVE_CONTENT | COVERAGE_EXCEPTION |

QA: **264/264 PASS**

---

## 14. BUG-NS-GUARD-REASON

```text
BUG-NS-GUARD-REASON:
PRESERVED_CURRENT_BEHAVIOR
NOT_FIXED
```

Natural ingreso=0 → `ordenar_panorama` (not `revisar_ingresos`); provenance matches; OFF/ON equal.

---

## 15. Regression QA

| Suite | Result |
| ----- | ------ |
| `fs-layer-a-qa.js` | 255/255 PASS |
| `act-layer-a-qa.js` | 98/98 PASS |

---

## 16. Response Contract note

Documented in `dev/decision-provenance/README.md` (`FUTURE RESPONSE CONTRACT INVARIANT`).

---

## 17. Guardrails

```text
source_layer stable: YES (NS_L3_CONTENT | NS_L4_HERO)
text_ref deterministic: YES (visible exercised)
narrative-05-qa.js untouched: YES
baseline not recaptured: YES
no override_history: YES
PROVENANCE-SOURCE-LAYER-DEBT: DEFERRED (FS/ACT)
```

---

## 18. Production diff classification

| Change | Class |
| ------ | ----- |
| `js/ui.js` provenance helpers + attach + renderTabPlan call | PROVENANCE_ONLY |
| `js/config.js` comment | DOCUMENTATION_ONLY |
| harness / ns-layer-a-qa / FINDINGS | TEST_ONLY / DOCUMENTATION_ONLY |

```text
FUNCTIONAL_CHANGE: NONE
```

---

## 19. Freeze

```text
PROV-NS freeze released on CLOSED
```
