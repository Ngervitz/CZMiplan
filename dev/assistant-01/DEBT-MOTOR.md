# ASSISTANT-01 — Deuda de motor / contexto

DEV register. Does not implement FIX 1/2/3. Does not change production.

No prior `MOTOR-01` / `MOTOR-02` / `MOTOR-03` files existed in the repo.
This document formalizes those IDs from named gaps in this track, plus MOTOR-04.

| ID | Name | Status | Owner |
|---|---|---|---|
| ASSISTANT-MOTOR-01 | Action rationale (EXPLAIN_ACTION) | OPEN — blocks LLM “porqué” of actions | Cursor / motor Mi Plan |
| ASSISTANT-MOTOR-02 | Production `text_ref` → visible copy resolver | OPEN (`TEXT_REF_RESOLUTION_GAP`) | Cursor / motor Mi Plan |
| ASSISTANT-MOTOR-03 | Production `assistant_context` builder | OPEN (`CONTEXT_BUILDER_GAP`) | Cursor / motor Mi Plan |
| ASSISTANT-MOTOR-04 | `metric_links` causal mapping | OPEN (`CONTEXT_GAP`) | Cursor / motor Mi Plan |

## MOTOR-01

Real user-facing rationale for why a recommended action was selected.
Until this exists, EXPLAIN_ACTION uses a deterministic fallback
(visible label + urgencia if present). No thematic 4-group map.
`EXPLAIN_ACTION_SEMANTIC_TAXONOMY` is DEFERRED.

## MOTOR-02

Production has no exported id→copy resolver. DEV catalog is not the
product pipeline. Blocks claiming EXPLAIN_NEXT_STEP integration-ready.

## MOTOR-03

No production builder that assembles allowlisted `assistant_context`
from `diag` / snap. DEV `guards.buildAssistantContext` is harness-only.

## MOTOR-04 — metric_links causal mapping

**Scope:** derive `metric_links` (not emitted by production
`interpretarDiagnostico`, `js/algorithms.js` return at ~2100–2106)
via a deterministic table `causa_principal → linked metric keys`.

Draft table (not implemented; must stay aligned with `REGLAS_CAUSA`):

| causa_principal | linked keys | Basis in motor |
|---|---|---|
| `flujo_negativo` | `flujoLibre` | match: `flujoLibre < 0` |
| `mora_activa` | `cantMoras` (and/or mora flag) | match: `cantMoras > 0 \|\| tiene_mora_declarada` |
| `stock_deuda_alto` | `dti_ratio` | match: `dti_ratio >= 1` |
| `estres_alto` | *(none — not a fin metric)* | match: `estres_score <= 1` (P5) |
| `presion_informal` | `cantInformales` | match: informal + count |
| `deuda_cara` | `ratio` (+ prio tipo, not a metrics bag field) | match: prio tipo + `ratio > 0.4` |
| `demasiadas_deudas` | `ratio` | match: `totalDeudas > 4 && ratio > 0.35` |
| `sin_accion` | *(none — P8 score)* | match: `accion_score <= 1` |
| `falta_organizacion` | *(none — residual default)* | match: always last |

**v1 until MOTOR-04 ships:** MAIN_BLOCKER `assistant_context.metrics` is
always `{}` (fail-closed). Production does not emit `metric_links` for
any causa. No exception is “already demonstrable by another emitted
field” — using `REGLAS_CAUSA` in the builder *is* MOTOR-04, not a
bypass. Do not ship a partial one-row mapping (`flujo_negativo` only)
ahead of the table + drift test.

Owner: Cursor / motor Mi Plan.

## EXPLAIN_ACTION_SEMANTIC_TAXONOMY

**DEFERRED.** The 4-group map (atraso/BCU/flujo/hábitos) does not
partition `_BANCO_ACCIONES_MAESTRO` (12/29 ambiguous). v1 fallback
does not name a thematic group.

## Drift Layer B / C

**DEFERRED.** Layer A (static stamp vs contract) is implemented.
Layer B (runtime winner) and Layer C (gate vs contract) are incremental.

