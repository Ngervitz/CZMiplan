# DECISION-PROVENANCE-01 — CIERRE GLOBAL

**Date:** 2026-08-11  
**HEAD verified:** `0dce90e` (= `origin/main`)  
**Production changes in this closure:** NONE

```text
DECISION-PROVENANCE-01: CLOSED
```

---

## A. Executive conclusion

Cross-check of PROV-FS, PROV-ACT, and PROV-NS confirms:

* all three phases are CLOSED with additive instrumentation behind `CZ_DECISION_PROVENANCE`
* Provenance Convention v1 is shared where it applies; shape divergences are semantic, not drift
* QA re-run at closure: FS 255/255, ACT 98/98, NS 264/264 — all PASS
* **closure blockers: 0**
* residual debt/bugs/coverage exceptions are inventoried and classified below

Global provenance freeze for this initiative is **released**.  
This does **not** authorize unrelated functional changes to FS/ACT/NS decision rules.

**Next allowed step:** `ASSISTANT CONTEXT CONTRACT — REOPEN` (not executed here).

---

## B. Scope completed

| Decision | Provenance object(s) | Phase | Final commits |
| -------- | -------------------- | ----- | ------------- |
| Financial stage | `diag.financial_stage_provenance` | PROV-FS | baseline `fefb1b8`; impl `3f8994c` |
| Recommended actions | `selection_reason` + `retention_reason` + `resolveCanonicalVisibleAcciones` | PROV-ACT | impl `5d4ba25`; closure `38d1dc5` |
| Next step | `diag.next_step_provenance` | PROV-NS | design amend `b707853`; impl `0dce90e` |

Shared gate: `CZ_DECISION_PROVENANCE` (default `false`) via `_decisionProvenanceEnabled()`.

---

## C. Provenance Convention v1 cross-check

| Convención | PROV-FS | PROV-ACT | PROV-NS | Consistente | Observación |
| ---------- | ------- | -------- | ------- | ----------- | ----------- |
| `schema_version: 1` | sí | sí | sí | sí | Same numeric v1; same additive contract generation |
| `decision` + `value` | `financial_stage` + stage | `accion` / `accion_retention` + action id | `next_step` + actionKey | sí | Decision-specific values |
| `reason_code` | `FS_*` | `ACT_*` | `NS_*` (+ `NS_TONE_*`) | sí | Prefixed, branch-derived, no narrative rationale |
| `source_layer` | function name `resolveFinancialStage` | function names (pick/tax/UI) | stable `NS_L3_CONTENT` \| `NS_L4_HERO` | **parcial** | NS amended; FS/ACT debt → `PROVENANCE-SOURCE-LAYER-DEBT` |
| `evidence` ≤8 scalars | trim in `_fsProvenance` | `_actProvenanceTrimEvidence` | `_nsTrimEvidence` | sí | Same cap adopted in all three |
| Extra fields | — | dual selection/retention | `text_ref`, `tone_code`, `display` | justificado | Required by ACT dual pipeline / NS key≠text / visibility |
| Deterministic / serializable | sí | sí | sí | sí | |
| Additive / flag-gated | sí | sí | sí | sí | |
| No copy-as-rationale | sí | sí | sí (`text_ref` ids only) | sí | |
| QA + future assistant-ready | sí | sí + canonical surface | sí + display gate | sí | |

**Verdict:** Convention v1 held. Divergences are justified by decision semantics, not accidental drift.

---

## D. Flag consistency

| Check | Result |
| ----- | ------ |
| Single flag | `CZ_DECISION_PROVENANCE` only |
| FLAG OFF | No `financial_stage_provenance` / `selection_reason` / `retention_reason` / `next_step_provenance` on exercised paths (FS/ACT/NS QA) |
| FLAG ON | Fields appear per contract; functional outputs match OFF |
| Alternate flags | None found |

---

## E. Canonical surface invariant

> The assistant must never explain internal states the product chose not to show.

| Phase | Mechanism | Respects invariant? |
| ----- | --------- | ------------------- |
| **PROV-ACT** | `resolveCanonicalVisibleAcciones`: post-UI filters; UX1D2-suppressed **excluded**; Ver más (`.accion-recom-extra`) **included** (DEC-PROV-01) | Yes |
| **PROV-NS** | `display.status === "visible"` → explainable candidate; `"none"` → computed but not user-facing | Yes |
| **PROV-FS** | Stage is itself the visible diagnosis framing (no separate hide layer) | N/A — no suppressed twin; stage is the shown concept |

Different mechanisms, same conceptual invariant — justified by product models.

---

## F. Assistant readiness check

**Not** an Assistant Context Contract. Structural readiness only:

| Intent | Classification | Notes |
| ------ | -------------- | ----- |
| WHY_DIAGNOSIS | READY_FOR_CONTEXT_DESIGN | `financial_stage_provenance` carries winning `reason_code` + evidence |
| EXPLAIN_ACTION | READY_FOR_CONTEXT_DESIGN | selection + retention + canonical visible list; suppress excluded |
| EXPLAIN_NEXT_STEP | READY_FOR_CONTEXT_DESIGN | `value` + `reason_code` + `evidence` + `text_ref` + `tone_code` + `display`; Response Contract must reconcile tone divergence |
| MAIN_BLOCKER | READY_FOR_CONTEXT_DESIGN | Still **IN_SCOPE_V1** for ACC: pre-existing motor facts `interpretacion_v2.causa_principal` / `patron_deuda` (+ related `bloqueadores` / narrativa) are deterministic and sufficient to reopen context design **without** new provenance. Does **not** depend on PROV-FS/ACT/NS. Prior `OUT_OF_SCOPE / NEEDS_CONTEXT_DESIGN_REVIEW` row was a **classification error** (confused “no new PROV-* field” with “not ready”). |

**Caveat:** before production assistant consumers rely on FS/ACT `source_layer` string values, address `PROVENANCE-SOURCE-LAYER-DEBT` (POST_CLOSE_REQUIRED for that consumer milestone — not a provenance-initiative closure blocker).

**MAIN_BLOCKER clarification (post-close correction):** No new provenance gap was discovered during global close. Absence of a dedicated `blocker_provenance` object does not invalidate IN_SCOPE_V1 readiness.
---

## G. QA consolidated

| Fase | Suite principal | PASS | FAIL | Coverage exceptions | Commit final | Freeze |
| ---- | --------------- | ---: | ---: | ------------------- | ------------ | ------ |
| PROV-FS | `fs-layer-a-qa.js` | 255 | 0 | FS_CLARITY_LOW_MISS unreachable as winner | `3f8994c` | released after close |
| PROV-ACT | `act-layer-a-qa.js` | 98 | 0 | ACT_FILL NOT_EXERCISED_E2E | `38d1dc5` | released after close |
| PROV-NS | `ns-layer-a-qa.js` | 264 | 0 | see §J (FOCUS shadow, Hero variants, natural healthy/ingreso_cero) | `0dce90e` | released on CLOSED |

**Baseline v1** (`fefb1b8` / product snap `d5f41b9`): not recaptured; FS stage + NS next_step motor regressions clean at closure re-run.

**Closure re-run (2026-08-11):** FS 255, ACT 98, NS 264 — all PASS.

---

## H. Commits

```text
fefb1b8  baseline v1
3f8994c  PROV-FS instrumentation
5d4ba25  PROV-ACT instrumentation
38d1dc5  PROV-ACT formal closure evidence
b707853  PROV-NS source_layer design amendment
0dce90e  PROV-NS implementation (HEAD = origin/main)
```

---

## I–J. Open findings / technical debt (classified)

| ID | Latest evidenced status | Classification |
| -- | ---------------------- | -------------- |
| BUG-FS-CLARITY-LOW-MISS | `CONFIRMED_UNREACHABLE` (helper can fire; cascade never wins) — not fixed | DEFERRED |
| BUG-NS-GUARD-REASON | Reachable; changes visible next_step; `PRESERVED_CURRENT_BEHAVIOR` / `NOT_FIXED` | **Functional bug** (priority HIGH) — not a provenance blocker; track outside initiative |
| PROVENANCE-SOURCE-LAYER-DEBT | FS/ACT use JS function names; NS uses stable enums | POST_CLOSE_REQUIRED before external/assistant production dependency on those strings |
| ACT_FILL | Instrumented; `NOT_EXERCISED_E2E` / COVERAGE_EXCEPTION | COVERAGE_EXCEPTION |
| NS-L2-L3-HEALTHY-DIVERGE | Confirmed behavior; Primary stamps L3 | DEFERRED (product intent unclear; provenance correct) |
| NS-TONE-KEY-TEXT-DESYNC | Confirmed MIXED; handled via `tone_code`+`text_ref` | DEFERRED as product/narrative question; provenance OK |
| NS-TAB-ACCION-DEAD | `hideAccionPrioritaria=true` | DEFERRED (dead UI; out of NS surfaces) |
| Natural healthy_organized in harness | Often blocked by confidence=low | COVERAGE_EXCEPTION |
| Natural ingreso_cero reason stamp | Cleared when planIdRaw already 4 (BUG-NS-GUARD) | COVERAGE_EXCEPTION (for natural path); bug tracked separately |
| NS_NARR_OPT_CREDIT/LEARNING as distinct reasons | Shadowed by `NS_NARR_FOCUS_NONDEFAULT` | COVERAGE_EXCEPTION |
| NS_NARR_STABILIZATION as distinct reason | Often shadowed by FOCUS_NONDEFAULT | COVERAGE_EXCEPTION |
| Other Hero reason variants | One Hero path exercised | COVERAGE_EXCEPTION |

**CLOSURE_BLOCKER count: 0**

---

## K. Functional bugs outside provenance

| Bug | Priority | Provenance impact |
| --- | -------- | ----------------- |
| BUG-NS-GUARD-REASON | **HIGH** — users with ingreso≤0 may see `ordenar_panorama` instead of `revisar_ingresos` when raw plan already 4 | Provenance correctly describes current (buggy) winner; fix must be a separate functional PR |
| BUG-FS-CLARITY-LOW-MISS | LOW (unreachable as cascade winner) | Documented; no user-facing alternate stage |

---

## L. Residual risks

1. Assistant consumers parsing FS/ACT `source_layer` as stable IDs will break on renames until debt migrated.
2. Tone divergence requires Response Contract discipline (`value` alone insufficient).
3. Some NS reason codes are structurally shadowed — EXPLAIN_NEXT_STEP should use actual stamped `reason_code` (e.g. FOCUS_NONDEFAULT), not assume OPT_* / STABILIZATION labels.
4. ACT_FILL never observed live — low residual risk given bank always fills earlier.
5. Unrelated `dev/narrative-05-qa.js` remains untracked outside this initiative.

---

## M. Next allowed step

```text
ASSISTANT CONTEXT CONTRACT — REOPEN
```

Do **not** implement it in the same change set as this closure document.

When reopening ACC: apply canonical-surface + display gates; schedule `PROVENANCE-SOURCE-LAYER-DEBT` before production reliance on FS/ACT `source_layer`.

---

## Verification checklist (closure criteria)

| # | Criterion | Met |
| - | --------- | --- |
| 1–3 | FS/ACT/NS CLOSED | yes |
| 4–5 | Convention v1 + justified divergences | yes |
| 6–7 | Flag + additive OFF/ON | yes |
| 8–9 | Evidence minimal; reason codes real | yes |
| 10–11 | Canonical surface + no inference-required gap for instrumented decisions | yes |
| 12–15 | Pendientes classified; blockers 0; coverage honest; bugs separated | yes |
| 16–17 | Commits on origin/main; no pending production for this initiative | yes |

---

*Document canonical for DECISION-PROVENANCE-01 global closure.*
