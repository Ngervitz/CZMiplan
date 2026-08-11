# DECISION-PROVENANCE-01 — Etapa 2 Fase 1 findings (PROV-FS)

## 1. Baseline global v1

| Field | Value |
|-------|-------|
| Product code snapshotted | `d5f41b97703ec4393cab46150481863b53045df0` |
| Baseline fixtures commit | `fefb1b87def45f86c4514b2ba6c27ec0e1e9c9f0` |
| Path | `dev/decision-provenance/baseline-v1/` |
| Profiles | 41 (31 Layer A FS + 10 Layer B sample) |
| Surfaces | `financial_stage`, `next_step` (actionKey+text), `acciones_visibles` |

## 2. Diff report — financial_stage_provenance

**Additive only.** Flag `CZ_DECISION_PROVENANCE` default `false` (`js/config.js`).

When enabled, `attachFinancialStageToDiag` sets `diag.financial_stage_provenance` without changing `diag.financial_stage`.

### Layer A regression

- **255/255 PASS** (`node dev/decision-provenance/fs-layer-a-qa.js`)
- All Layer A `financial_stage` values **identical** to baseline (flag OFF and ON)
- Full 41-profile corpus stage identity vs baseline: **0 mismatches** (flag OFF)
- `reason_code` matched expected branch for every Layer A case
- Existing `dev/stage-01-qa.js`: **69/69 PASS**

## 3. BUG-FS-CLARITY-LOW-MISS

**Status: `CONFIRMED_UNREACHABLE`**

- `_stageLowConfidenceBlocksStaging` **can** return `true` in isolation when `confidence_level==="low"` and `missing_payment_information` and `flujoLibre < 0`.
- Inside `resolveFinancialStage`, `_stageHasRecoveryPressure` evaluates first and returns true on `flujoLibre < 0` (`FS_REC_FLUJO_NEG`).
- Therefore `FS_CLARITY_LOW_MISS` never becomes the winning reason for the cascade.
- Documented by tests in `fs-layer-a-qa.js` — **not fixed** (OUT_OF_SCOPE).

## 4. Commits (separate)

1. Baseline only — `fefb1b8`
2. PROV-FS instrumentation + QA — (this change set)

## Next (not in this phase)

- PROV-ACT
- PROV-NS
