# DECISION-PROVENANCE-01 — Baseline & tooling

## baseline-v1/

Global surface snapshot captured **before** provenance instrumentation.

- `MANIFEST.json` — commit hash, capture metadata
- `surfaces.jsonl` — one profile per line: `financial_stage`, `next_step`, `acciones_visibles`

Regenerate (only on the baseline commit / pre-instrumentation tree):

```bash
node dev/decision-provenance/capture-baseline.js
```

## QA

```bash
node dev/decision-provenance/fs-layer-a-qa.js
```

Requires harness override `CZ_DECISION_PROVENANCE=true` after product load (see `harness.js`). Product default remains `false`.

See `FINDINGS-PROV-FS.md` / `FINDINGS-PROV-ACT.md` / `FINDINGS-PROV-NS-ETAPA1.md` / `DESIGN-PROV-NS-ETAPA2.md` for phase results.

### PROVENANCE-SOURCE-LAYER-DEBT (DEFERRED)

FS/ACT `source_layer` values may still use JS function names. PROV-NS uses stable enums (`NS_L3_CONTENT`, `NS_L4_HERO`). Do **not** migrate FS/ACT in PROV-NS. Revisit before assistant/production consumers depend on those older values.

### FUTURE RESPONSE CONTRACT INVARIANT

When `next_step_provenance.value` and the effective user-visible content diverge because of tone, an assistant explanation MUST NOT be generated from `value` + `reason_code` alone. The future Response Contract must reconcile `value`, `reason_code`, `text_ref`, and `tone_code` so deterministic causality does not contradict what the user saw.

```bash
node dev/decision-provenance/fs-layer-a-qa.js
node dev/decision-provenance/act-layer-a-qa.js
node dev/decision-provenance/ns-etapa1-trace.js
```
