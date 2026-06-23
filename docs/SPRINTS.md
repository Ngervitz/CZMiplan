FORMAT: ID | DESCRIPTION | STATUS | QA | NOTES

# COMPLETADOS — ARQUITECTURA CORE

INTENT-01A   | User intent capture (P11) + CDV bypass                    | COMPLETE  | PASS      | ~15-20% initially, completed in subsequent work
STAGE-01     | Financial stage architecture                               | COMPLETE  | PASS      |
NARRATIVE-01 | narrative_decision layer (RECOVERY/STABILIZATION/etc)     | COMPLETE  | PASS      |
NARRATIVE-02 | Contextual narrative                                       | COMPLETE  | PASS      |
NARRATIVE-03 | Qué está pasando                                          | COMPLETE  | PASS      |
NARRATIVE-04 | Próximo paso                                              | COMPLETE  | PASS      |
NARRATIVE-05 | Recommendation narrative layer + action taxonomy          | COMPLETE  | 74/77     | 3 stale comment markers, non-behavioral, accepted
ACTIONS-ARCH-01  | Action bank architecture                              | COMPLETE  | PASS      |
ACTIONS-ARCH-02  | Action taxonomy enrichment                            | COMPLETE  | PASS      |
ACTIONS-CONTENT-01 | 29 actions with taxonomy classification             | COMPLETE  | PASS      |

# COMPLETADOS — MOTOR Y SCORING

B6a          | Separación riesgo financiero vs costo de deuda           | COMPLETE  | PASS      | interesProm ya NO afecta nivelRiesgo; nuevo campo costoDeudaNivel (Bajo/Medio/Alto)
B6b          | Dashboard Coherence Resolver                              | COMPLETE  | 24/24     | resolveDashboardCoherence() como capa entre motor y UI; elimina contradicción "En buen camino + Ordenar panorama + Retry"

# COMPLETADOS — CASOS ESPECIALES

B2d          | Fix deudas pagadas                                       | COMPLETE  | PASS      | _hasNoDeclaredDebts() alineado; dimensión deuda conocida cuando existe cualquier deuda aunque cancelada
B2e          | Copy especial zero active debt                            | COMPLETE  | 28/28     | Helper _isZeroActiveDebtCompleteProfile(); aplica en Hero + Acción prioritaria + Narrativa + Próximo paso

# COMPLETADOS — UX Y DASHBOARD

B2a          | Hero operacional                                         | COMPLETE  | PASS      | Eliminado "Ver Mi Plan Plus" del Hero; Hero = completar gastos | confirmar deudas | resumen
B2b          | CTA Editar gastos visible                                | COMPLETE  | PASS      | Ubicación: Tu situación hoy; btn-editar-gastos-situacion-hoy
B2c          | Eliminar duplicación del plan en dash-zone-diagnostico   | COMPLETE  | PASS      | Hero quedó como única fuente de título/problema/estado
B2f          | Single Edit Expenses CTA                                 | COMPLETE  | PASS      | Eliminado CTA duplicado en "Tus números"; Tus números = sección informativa solamente
B3a          | Eliminar Hidden Factor CTA duplicado                     | COMPLETE  | PASS      | Removido #cz-hf-cta; lógica HF y tracking conservados
B6c          | Debt Form UX                                             | COMPLETE  | PASS      | Confirmación visual al guardar; botón "Deuda guardada ✓"; banner éxito; "+ Agregar otra deuda"
B6d          | Composición de perfil — grid fix                        | COMPLETE  | PASS      | Grid corregido; alturas alineadas
B6e          | Smart Blocker Visibility                                 | COMPLETE  | PASS      | profileTier===healthy_organized + bloqueadores vacíos → no renderizar bloqueadores
B6e-fix      | DTI visible separado de bloqueadores                    | COMPLETE  | PASS      | Bloqueadores ocultos en perfiles sanos; DTI visible cuando hay deuda activa
B6f          | Narrative Alignment via coherence resolver               | COMPLETE  | 36/36     | narrativeOverride en resolveDashboardCoherence(); cubre healthy+deuda cara, healthy+deuda baja, sin deuda activa
B6g          | Status label review                                      | PENDING   |           | Casos healthy_organized + "Requiere acción" pueden ser conceptualmente inconsistentes
B7           | Contextual action segment (B7 schema)                   | COMPLETE  | PASS      |
B7b          | Contextual action segment refinement                     | COMPLETE  | 86/86     |
B7b-fix      | B7 fix                                                   | COMPLETE  | PASS      |
B7b-fix2     | B7 fix 2                                                 | COMPLETE  | PASS      |
UX-FIX-01    | Flex order correction                                    | COMPLETE  | 14/14     | Orden: Hero → Primary Action Card → Diagnóstico
UX-CONSOLIDATION-01-FIX | Remove duplicated next-step ownership          | COMPLETE  | 52/52     | Commit 3b0f764; Hero suppresses next-step when Primary Action Card renders

# COMPLETADOS — COPY

Copy-1a      | Copy cleanup round 1a                                   | COMPLETE  | PASS      |
Copy-1b-1    | Copy cleanup round 1b                                   | COMPLETE  | PASS      |
COPY-2B      | Realistic Optimism cleanup                               | COMPLETE  | PASS      | Eliminadas frases aspiracionales; "En buen camino" y "Plan 3 objetivo" conservados

# COMPLETADOS — ENTRY CONTEXT

FIX-01A      | Entry Context Layer                                      | COMPLETE  | 76/76     | window.CZ_ENTRY_CONTEXT implementado
FIX-01B-1    | Rejection Copy Gating                                   | COMPLETE  | PASS      | Referencias a rechazo solo cuando hasRejectionContext===true
FIX-01B-2    | Plan Title Alignment                                    | COMPLETE  | PASS      | Plan 1 → Claridad Financiera; Plan 5 → Reconstrucción Crediticia (solo visual, motor intacto)

# COMPLETADOS — UX SERIES

UX-1b        | UX improvement 1b                                       | COMPLETE  | PASS      |
UX-1c        | UX improvement 1c                                       | COMPLETE  | PASS      |
UX-1d-1      | DUP-01 Hero wins next-step; DUP-08 header Acciones; DUP-09 disclaimer horizontes | COMPLETE | PASS |
UX-1d-2      | B7 vs Acciones overlap filter                           | PENDING   |           | Decisión: Opción B (mantener ambas capas, filtrar redundancias); requiere audit técnico previo de renderAccionesRecomendadasHtml() + seleccionarAccionesRecomendadas() + resolveContextualActionSegment()

# COMPLETADOS — OTROS

RETRY-IMPL   | Retry CTA implementation                                | COMPLETE  | 17/17     | Estado locked/unlocked; CTA dentro de bloque horizonte; eventos retry_cta_shown/clicked
FRESH-URL    | Fresh URL diagnosis                                     | COMPLETE  | PASS      | URL con p1-p10 completos ignora localStorage y recalcula
CONFIDENCE   | Confidence layer                                        | COMPLETE  | PASS      | confidence_level=low cuando deuda>=ingreso*3 + pagos activos=0
REALITY-WARN | Financial Reality Warning                               | COMPLETE  | PASS      | financial_reality_warning con tipos high_payment_pressure | payments_exceed_income
HORIZON-FIX  | Horizon fix para confidence=low                        | COMPLETE  | PASS      | No mostrar "Ya hay condiciones..." cuando confidence=low; mostrar "Necesitamos completar tu diagnóstico"
DASHBOARD-CLEANUP | Eliminados semáforo, tracker constancia, tracker hábitos, progreso 90d | COMPLETE | PASS |
PLUS-V2      | Plus Report V2 schema + prompt v2.2                    | COMPLETE  | PASS      |
SEO-IA-FLOW  | P1-P10 survey + legal consent reuse + source=seo_ia routing | COMPLETE | PASS   |
SEO-PAGES    | 50+ landing pages long-tail Uruguay                    | COMPLETE  | —         |

# PENDIENTES

B6g          | Status label coherence review                           | PENDING   |           | Blocker: ninguno
UX-2A        | Primary Action Card "Tu prioridad hoy"                  | PENDING   |           | Aprobado, no implementado; ubicación: entre Qué está pasando y resto; solo perfiles completos; consumer puro de coherence.nextStepText; sin CTA, sin botón, sin lógica nueva
COPY-2C      | Final copy cleanup                                      | PENDING   |           | Eliminar "para que el banco te apruebe en la próxima solicitud" en Plan 3; revisar "Con algunos ajustes podés mejorar tu situación declarada"
COPY-2D      | Accent marks + technical wording                       | PENDING   |           | COMPOSICION → COMPOSICIÓN; Situacion → Situación; analisis → análisis; Revision → Revisión; "puede incluir alivio por pagos suspendidos" → simplificar
FIX-02       | Downstream coherence                                    | PENDING   |           |
AUD-03       | Plan 1 standard audit ("En buen camino")               | PENDING   |           |
UX-1d-2      | B7 vs Acciones overlap                                  | PENDING   |           | Requires audit first

# PLUS PENDIENTES

P2c          | Native V2 rendering                                     | PENDING   |           |
P3           | Reconciliation engine                                   | PENDING   |           |
P4           | Editable sheet                                          | PENDING   |           |
P5           | Equifax consent flow                                    | PENDING   |           |
P6           | Handy integration                                       | PENDING   |           |
P7           | Full integration                                        | PENDING   |           |

# DESCARTADOS / DIFERIDOS

B5c          | Variable income copy layer                              | DEFERRED  |           | Sin datos suficientes
B3d          | Retry fallback Plus deduplication                       | DEFERRED  |           | Sin datos suficientes
PLUS-REPOSITIONING | Plus card placement change                       | DEFERRED  |           | Requiere usuarios reales + scroll depth + conversión + interacción
DASHBOARD-REORG | Major dashboard reorganization                      | DEFERRED  |           | Requiere evidencia conductual real
INSIGHTS-01  | Educational insights layer (learning_mode)             | DEFERRED  |           | Depende de datos reales; futura capa contextual explicativa
SPRINT-15-CELEBRATION | Confetti celebrations                         | DEFERRED  |           | Solo 3 casos aprobados (deuda cancelada, diagnóstico completo, primer flujo libre positivo); esperar feedback beta
SPRINT-15    | Income update (editar ingreso principal + adicionales)  | DEFERRED  |           | Post-beta; incluye frecuencia de ingresos y recálculo de motor
