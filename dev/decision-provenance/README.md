# DECISION-PROVENANCE-01 — Baseline & tooling

**Status: CLOSED** — see [`CIERRE-GLOBAL.md`](./CIERRE-GLOBAL.md) (2026-08-11).

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
node dev/decision-provenance/act-layer-a-qa.js
node dev/decision-provenance/ns-layer-a-qa.js
node dev/decision-provenance/ns-etapa1-trace.js
```

Requires harness override `CZ_DECISION_PROVENANCE=true` after product load (see `harness.js`). Product default remains `false`.

Phase docs: `FINDINGS-PROV-FS.md` / `FINDINGS-PROV-ACT.md` / `FINDINGS-PROV-ACT-CLOSURE.md` / `FINDINGS-PROV-NS-ETAPA1.md` / `DESIGN-PROV-NS-ETAPA2.md` / `FINDINGS-PROV-NS.md` / **`CIERRE-GLOBAL.md`**.

### PROVENANCE-SOURCE-LAYER-DEBT (POST_CLOSE_REQUIRED for assistant consumers)

FS/ACT `source_layer` values may still use JS function names. PROV-NS uses stable enums (`NS_L3_CONTENT`, `NS_L4_HERO`). Migrate FS/ACT **before** external/assistant production consumers depend on those strings. Does not reopen PROV-FS/ACT as part of DECISION-PROVENANCE-01.

### FUTURE RESPONSE CONTRACT INVARIANT

When `next_step_provenance.value` and the effective user-visible content diverge because of tone, an assistant explanation MUST NOT be generated from `value` + `reason_code` alone. The future Response Contract must reconcile `value`, `reason_code`, `text_ref`, and `tone_code` so deterministic causality does not contradict what the user saw.
