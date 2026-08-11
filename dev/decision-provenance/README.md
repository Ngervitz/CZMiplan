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

See `FINDINGS-PROV-FS.md` / `FINDINGS-PROV-ACT.md` for phase results.

```bash
node dev/decision-provenance/fs-layer-a-qa.js
node dev/decision-provenance/act-layer-a-qa.js
```
