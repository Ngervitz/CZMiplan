PROJECT: Mi Plan (Credizona)
COMPANY: Copanel S.A., Montevideo, Uruguay
REPO: Ngervitz/CZMiplan
DEPLOY: cz-miplan2.vercel.app
PHASE: Beta avanzada / UX consolidation

STACK:
  frontend: Vanilla JS
  architecture: SPA
  frameworks: none
  npm: not used
  build_system: none
  hosting: Vercel
  backend: Vercel Serverless Functions
  version_control: GitHub → Vercel (auto-deploy)

ANALYTICS:
  GA4: G-64F9T67RK9
  GTM: GTM-MK9GJ68R
  meta_pixel: 1966482200899899
  meta_capi: active (Birchub Signals Gateway)
  crm: custom MySQL (czuid persistent identifier)

MOTOR:
  entry_point: calcularMotor()
  flow: calcularMotor() → financial_stage → resolveDashboardCoherence() → UI
  outputs:
    - scoreReset
    - scoreFinanciero
    - scoreConductual
    - planId
    - horizonte
    - narrative_decision
    - focus_target
    - next_step
    - acciones_recomendadas
    - financial_reality_warning
    - confidence_level
    - missing_payment_information

PLANS:
  Plan 1: mejor situación / Claridad Financiera
  Plan 2: [UNCERTAIN exact label]
  Plan 3: [UNCERTAIN exact label]
  Plan 4: [UNCERTAIN exact label]
  Plan 5: peor situación / Reconstrucción Crediticia / Reperfilamiento

DASHBOARD_UI_ORDER:
  1. Hero
  2. Primary Action Card (Tu prioridad hoy)
  3. Qué está pasando
  4. Resto de secciones

NEXT_STEP_OWNER: Primary Action Card (único owner)
HERO_NEXT_STEP: suppressed cuando Primary Action Card renderiza

ENTRY_CONTEXTS:
  RECHAZO_CDV: usuario rechazado por Crédito de Valor
  RECHAZO_GENERAL: usuario rechazado por otro canal
  SEO_IA: tráfico orgánico SEO
  ORGANICO: tráfico directo sin contexto de rechazo
  object: window.CZ_ENTRY_CONTEXT
  contract: { entryContext, trafficSource, hasRejectionContext, evidenceStrength, reasons }

FINANCIAL_STAGES: CLARIDAD | RECUPERACIÓN | ESTABILIZACIÓN | OPTIMIZACIÓN
USER_INTENTS: RECUPERAR | CREDITO | OPTIMIZAR
LEARNING_MODE_FLAG: ORDENAR (no es un intent, activa learning_mode)
NARRATIVE_MODES: RECOVERY | STABILIZATION | OPTIMIZATION | CLARITY

CDV_INTEGRATION:
  partner: Crédito de Valor (CDV)
  webhook_statuses: VALIDATED | OFFERED | GRANTED
  bypass: CDV users skip P11 (intent question)
  reason: intent implícito = CREDITO

SEO_IA:
  url_param: source=seo_ia
  acquisition_param: acquisition=seo_ia
  landing_pages: 50+ targeting Uruguayan long-tail financial queries
  topics: Clearing de Informes, BCU, score crediticio, deudas, loan rejection
  url_pattern: /miplan?source=seo_ia&intent=INTENT&question=SLUG
  survey: P1-P10
  outputs: baseline_nivel, score_v2, nivel_final
  legal_consent: reused from main flow

ACTION_BANK:
  count: 29
  taxonomy: RECOVERY | STABILIZATION | OPTIMIZATION | LEARNING | UNIVERSAL

PLUS:
  model: claude-sonnet-4-5
  max_tokens: 4000
  api_proxy: Vercel serverless → /api/plus/generate
  backend_abstraction: _fetchPlusReportProvider()
  report_schema_version: V2 (5 sections)
  prompt_version: v2.2
  alignment_label: Alta | Parcial | Baja coincidencia
  alignment_owner: reconciliation engine (NOT LLM)
  feature_flags:
    CZ_PLUS_PAYMENT_LIVE: false
    CZ_PLUS_BCU_CLEARING_LIVE: false
    CZ_CLAUDE_ALLOW_BROWSER_KEY: conditional
  integrations_ready_not_live:
    - Equifax
    - Handy (payment gateway)
  degraded_mode: active when external data unavailable

PLUS_PENDING_SPRINTS:
  P2c: native V2 rendering
  P3: reconciliation engine
  P4: editable sheet
  P5: Equifax consent flow
  P6: Handy integration
  P7: full integration

RETRY_ELIGIBILITY:
  function: isRetryEligible()
  unlocked_when:
    - planId <= 2
    - flujoLibre > 0
    - confidence != low
    - financial_reality_warning != true
    - missing_payment_information != true
    - ratio <= 0.35
    - horizonte positivo
  locked: all other cases
  cta_location: dentro del bloque horizonte (no tarjeta independiente)
  events: retry_cta_shown | retry_cta_clicked

SANITY_DEBT_GUARD:
  function: evaluarDebtSanityGuard()
  trigger: totalDeuda > ingreso * 3 AND totalPago > 0 AND totalPago <= ingreso * 0.01
  result:
    - missing_payment_information = true
    - confidence_level = low
    - horizonte = No estimable
    - retry bloqueado
  flag: flag_deuda_sanity_extreme

FRESH_URL_DIAGNOSIS:
  trigger: URL contains p1...p10 complete
  behavior: ignores localStorage, ignores snap, calculates fresh diagnosis
  fallback: restores from localStorage

FINANCIAL_REALITY_WARNING:
  fields: financial_reality_warning | financial_reality_warning_type
  types: high_payment_pressure | payments_exceed_income
  note: does NOT modify score, plan, or horizonte

QA_BASELINE:
  SyntheticMotorQA: 31/31 PASS
  dashboard-e2e-qa: 562/562 PASS (historical) / 395/395 PASS (recent)
  dashboard-coherence-b6b: 24/24 PASS
  narrative-alignment-b6f: 36/36 PASS
  zero-active-debt-b2e: 28/28 PASS
  contextual-action-b7b: 86/86 PASS
  entry-context-qa: 76/76 PASS
  ux-consolidation-01-qa: 52/52 PASS
  ux-fix-01-qa: 14/14 PASS
  retry-qa: 17/17 PASS
  narrative-05-qa: 74/77 (3 stale comment markers, non-behavioral, accepted)

PENDING_IT:
  1. Email post-rechazo con czuid
  2. Endpoint CRM: /api/miplan/usuario
  3. Mover LLM backend: /api/plus/generate
  4. Integración Handy
  5. Retry URL y retry_token
  6. Mover calcularMotor() al backend
  7. Consentimientos server-side
  8. Sistema identidad única (1 persona = 1 ficha maestra)
  9. Persistencia backend completa
  10. Retención/borrado Equifax-Clearing
  11. retry_invitation_available
  12. Taxonomía unificada de eventos CRM
  13. Seguridad API

LEGAL:
  regulator: BCU (Banco Central del Uruguay)
  data_protection: Ley 18.331
  consumer_protection: Ley 17.250
  data_registry: URCDP (completed)
  hosting_compliance: NETUY/Antel infrastructure (Uruguay)
  score_type: orientativo (NOT crediticio)
  narrative_constraint: diagnóstico informativo, no promesa de aprobación

SAAS_PATH:
  status: not in active sprint, architecture must preserve this path
  model: white-label B2B para financieras/fintechs LATAM
  planned_tenants: financial | insurance | ecommerce | hr_benefits
  multi_tenant: planned
