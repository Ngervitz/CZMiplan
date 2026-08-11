# DECISION-PROVENANCE-01 — PROV-ACT Etapa 2 findings

## PASO 0 precheck

| Check | Result |
|-------|--------|
| Git | clean (untracked `dev/narrative-05-qa.js` only) |
| HEAD | `3f8994c` (PROV-FS) |
| Baseline valid | **YES** — since `d5f41b9`, only FS provenance + config flag; **no** action pipeline functional diff in `ui.js` |
| Flag semantics | `_decisionProvenanceEnabled()` — OFF: no provenance fields attached; ON: attach |
| Call-site | `renderAccionesRecomendadasHtml` → `seleccionarAccionesRecomendadas` → transforms → UX1D2 hide |

No `BASELINE_STALE_RISK`.

## Implementation summary

See commit message and IMPLEMENTATION REPORT in agent response.

## QA

```bash
node dev/decision-provenance/act-layer-a-qa.js
```

**84/84 PASS** (plus related suites: FS 255, actions-arch-02 52, acciones-recom 19).

### Exceptions

1. **ACT_FILL live path** — rare (quotas usually fill to 5). Instrumented identically; QA verifies attach helper shape. Justified.
2. **Baseline acciones for direct FS profiles** — capture used `(fin.ingreso)\|\|100000` so ingreso 0 became 100000. Regression compares **motor** profiles only.
3. **DEC-PROV-01.4** — primary S1 case had accessible=3 (no Ver-más); secondary probe when available.

## Flag

Same `CZ_DECISION_PROVENANCE`. OFF: no `selection_reason`/`retention_reason` on motor outputs. ON: provenance present; functional ids/order match baseline (motor corpus).
