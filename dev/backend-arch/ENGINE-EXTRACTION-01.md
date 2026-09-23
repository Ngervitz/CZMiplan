# ENGINE-EXTRACTION-01 — Extracción server-side del motor

**Date:** 2026-09-23  
**Inputs:** MOTOR-PORTABILITY-00, MOTOR-EXTRACTION-01 (D1–D7 CLOSED), MOTOR-PARITY-00  
**Oracle:** `dev/backend-arch/parity/oracle-results.json` (NO modificado)

---

## 1. Objetivo cumplido

Motor ejecutable en Node sin browser real, preservando comportamiento AS-IS:

```
ENGINE INPUT → SERVER-SIDE ENGINE (engine/) → ENGINE RESULT
```

Reglas: **misma fuente** `js/*` (cargadas en VM). No se duplicaron thresholds.

Frontend productivo: **sin cambios** de consumo; el bundle browser sigue intacto.

---

## 2. Archivos creados

| Path | Rol |
|------|-----|
| `engine/index.js` | API pública `runEngine` |
| `engine/core/pipeline.js` | Orquestación D1 + inyección MC |
| `engine/support/clock.js` | D5 freeze `Date.now` |
| `engine/support/completeness.js` | D4 recompute |
| `engine/support/serialize-result.js` | Shape ENGINE RESULT |
| `engine/adapters/product-vm.js` | Carga `js/*` en VM (fuente única) |
| `engine/bin/check-parity.js` | Compara vs oracle 18 fixtures |
| `engine/bin/smoke.js` | Import + determinismo |
| `dev/backend-arch/ENGINE-EXTRACTION-01.md` | Este doc |

**Archivos productivos modificados:** ninguno (`js/`, `index.html`, `api/`, …).

**Oracle modificado:** NO.

---

## 3. Funciones usadas (producto, no forkeadas)

Vía VM, pipeline llama:

- `calcularMotor` → core  
- `attachFinancialStageToDiag` → stage + narrative  
- `seleccionarAccionesRecomendadas` + `applyAccionesPostMotorTransforms` → acciones  
- `resolveDashboardCoherence` + `resolveNextStepContent` (+ provenance attach) → coherence/next_step  

B7 / UX1D2: **no** invocados en ENGINE_CORE (D2).

---

## 4. Adapters

`adapters/product-vm.js`:

- Lee `js/config.js`, `creditors`, `survey`, `algorithms`, `actionNarrativeTaxonomy`, `events`, `crm`, `ui`, `app`.
- Stubs **inertes** de `document` / `localStorage` / `sessionStorage` solo dentro del sandbox para que el script cargue.
- El host Node **no** usa DOM; `require("engine")` no necesita jsdom.

---

## 5. Resolución MC-1…MC-10

| MC | Resolución efectiva |
|----|---------------------|
| MC-1 CZState | Input explícito → `ctx.CZState`; no lee localStorage real |
| MC-2 PRE | Armado desde EngineInput |
| MC-3 expenses | `gastos` + `custom_expenses` en state; product `getTotalMonthlyExpenses` |
| MC-4 Date.now | `freezeNow(ctx, now_ms)` fijo en la corrida |
| MC-5 completeness | `recomputeCompleteness` (ignora flags client) |
| MC-6 acciones ctx | State bag completo; `_evalCtxAcciones` corre en producto con ese state |
| MC-7 coherence/NS | Ejecutados en pipeline (D1) |
| MC-8 re-entry | Comportamiento producto intacto dentro de VM |
| MC-9 provenance | Flag `decision_provenance` en input |
| MC-10 BCU | `bcu_clearing_live` en input/contexto (server-owned en diseño) |

---

## 6. Dependencias browser residuales

| Host (Node) | Sandbox VM |
|-------------|------------|
| **NONE** reales | Stubs inertes document/localStorage/sessionStorage/location para load |

`BROWSER_RUNTIME_DEPENDENCIES` (host): **NONE**

---

## 7. Paridad

```
node engine/bin/check-parity.js
→ PARITY_CORPUS: 18/18 PASS
```

Diferencia encontrada durante extracción:

- `P_INCOMPLETE_PROFILE` / `completeness_recomputed.derived_checks.emailOk`  
- Causa: pipeline usaba `declared_email \|\| ""` vs oracle `\|\| "qa@example.test"`  
- Fix: alinear armado PRE/`user_email` con `capture-oracle.js` (AS-IS)  
- Oracle **no** regenerado

---

## 8. Validaciones extras

| Check | Resultado |
|-------|-----------|
| `node engine/bin/smoke.js` import | PASS |
| Determinismo 2× mismo input/now_ms | PASS |
| ENGINE RESULT self-sufficient (D1+D3 fields) | YES (plan/copy/stage/acciones/coherence/next_step) |

---

## 9. Fuera de alcance (confirmado)

- Express / HTTP / auth / Railway / Supabase  
- Cambio del frontend para consumir engine  
- Eliminación del motor del bundle browser  
- ASSISTANT-01 / Plus / Claude  
- Corrección de divergencias 0.15 vs 0.20  

---

## 10. Cómo ejecutar

```bash
node engine/bin/smoke.js
node engine/bin/check-parity.js

# Programático
node -e "console.log(require('./engine').runEngine({...}))"
```

---

SERVER_ENGINE_CREATED: YES  
NODE_IMPORT_WITHOUT_BROWSER: PASS  
PARITY_CORPUS: 18/18 PASS  
MC_1_10_IMPLEMENTATION: COMPLETE  
BROWSER_RUNTIME_DEPENDENCIES: NONE  
DETERMINISM_CHECK: PASS  
ENGINE_RESULT_SELF_SUFFICIENT: YES  
PRODUCTION_FRONTEND_CHANGED: NO  
ORACLE_MODIFIED: NO  
READY_FOR_BACKEND_INTEGRATION: YES
