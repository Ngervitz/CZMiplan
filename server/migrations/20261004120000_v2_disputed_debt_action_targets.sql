-- V2-DISPUTED-DEBT-TARGETS-01 — a disputed debt is never the target of a debt-targeted choice.
-- WRITTEN, NOT APPLIED. Requires 20261001180000_v2_cta_interaction_choices.sql. Apply only by explicit
-- decision (never through `supabase db push`), before deploying the server that expects it.
--
-- Under debt contract v2 a debt declared situacion_ui = reclamo_disputa gets one DEBT_IN_DISPUTE
-- verification reason (subject 'debt', its debt_index) in the stored shadow-03 result. Such a debt stays
-- in the canonical facts and in active_debts, but lower_payment_intent, surplus_to_debt and
-- creditor_contact_step (any state) are rejected on it. Shadow-02 results never carry that reason, so V1
-- evaluations are unaffected.
--
-- No schema change. Functions only (same signatures, CREATE OR REPLACE):
--   miplan_private.v2_disputed_debts         new; must equal disputedDebtIndices (actionContext.js)
--   miplan_private.v2_choice_authority       lower_payment_debts without disputed debts; adds surplus_debts
--   miplan_private.v2_interaction_authority  adds contact_debts (mora_debts unchanged)
--   public.miplan_record_user_choice         surplus_to_debt checks surplus_debts, creditor_contact_step
--                                            checks contact_debts; everything else verbatim from 20261001180000
-- JS ↔ SQL parity: server/bin/disputed-debt-targets-db-test.js.
--
-- ROLLBACK: DROP FUNCTION miplan_private.v2_disputed_debts(jsonb); then re-run, verbatim, the
-- v2_choice_authority block of 20261001120000_v2_user_choices.sql and the v2_interaction_authority and
-- miplan_record_user_choice blocks (CREATE OR REPLACE + REVOKE + GRANT) of 20261001180000_v2_cta_interaction_choices.sql.

-- ---------------------------------------------------------------------------
-- debt_index of every DEBT_IN_DISPUTE debt reason of a stored result, ascending, no duplicates.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION miplan_private.v2_disputed_debts(p_result jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF p_result IS NULL OR jsonb_typeof(p_result) <> 'object'
     OR jsonb_typeof(p_result -> 'verification_reasons') IS DISTINCT FROM 'array' THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i), '[]'::jsonb)
    FROM (
      SELECT DISTINCT (r -> 'debt_index')::numeric AS i
      FROM jsonb_array_elements(p_result -> 'verification_reasons') r
      WHERE CASE
        WHEN jsonb_typeof(r) = 'object'
             AND (r -> 'code') = '"DEBT_IN_DISPUTE"'::jsonb
             AND (r -> 'subject') = '"debt"'::jsonb
             AND jsonb_typeof(r -> 'debt_index') = 'number'
          THEN (r -> 'debt_index')::numeric >= 0
            AND (r -> 'debt_index')::numeric = trunc((r -> 'debt_index')::numeric)
        ELSE false
      END
    ) t
  );
END;
$function$;

REVOKE ALL ON FUNCTION miplan_private.v2_disputed_debts(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION miplan_private.v2_disputed_debts(jsonb) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Choice authority (20261001120000) plus the disputed-debt exclusion:
--   lower_payment_debts  CONTENCION / REDUCCION_CARGA; active, not disputed, known payment > 0
--   surplus_debts        when monthly_surplus exists: active debts that are not disputed; else []
-- monthly_surplus and active_debts are unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION miplan_private.v2_choice_authority(p_result jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_strategy text;
  v_cf jsonb;
  v_debts jsonb;
  v_flow jsonb;
  v_surplus numeric;
  v_active jsonb := '[]'::jsonb;
  v_lower jsonb := '[]'::jsonb;
  v_surplus_debts jsonb := '[]'::jsonb;
  v_disputed jsonb;
BEGIN
  IF p_result IS NULL OR jsonb_typeof(p_result) <> 'object'
     OR (p_result -> 'classification_status') IS DISTINCT FROM '"classified"'::jsonb
     OR jsonb_typeof(p_result -> 'strategy') IS DISTINCT FROM 'string' THEN
    RETURN NULL;
  END IF;

  v_strategy := p_result ->> 'strategy';
  IF v_strategy NOT IN ('CONTENCION', 'REGULARIZACION', 'REDUCCION_CARGA', 'CONSOLIDACION',
                        'MANTENIMIENTO_OPTIMIZACION') THEN
    RETURN NULL;
  END IF;

  v_cf := p_result -> 'canonical_facts';
  IF jsonb_typeof(v_cf) IS DISTINCT FROM 'object' OR jsonb_typeof(v_cf -> 'debts') IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;
  v_debts := v_cf -> 'debts';

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_debts) d
    WHERE CASE
      WHEN jsonb_typeof(d) = 'object' AND jsonb_typeof(d -> 'debt_index') = 'number'
        THEN (d -> 'debt_index')::numeric < 0
          OR (d -> 'debt_index')::numeric <> trunc((d -> 'debt_index')::numeric)
      ELSE true
    END
  ) THEN
    RETURN NULL;
  END IF;

  IF (SELECT count(*) <> count(DISTINCT (d -> 'debt_index')::numeric) FROM jsonb_array_elements(v_debts) d) THEN
    RETURN NULL;
  END IF;

  v_disputed := miplan_private.v2_disputed_debts(p_result);

  IF v_strategy IN ('CONSOLIDACION', 'MANTENIMIENTO_OPTIMIZACION') THEN
    v_flow := v_cf -> 'canonical_flow';
    IF jsonb_typeof(v_flow) = 'number' AND v_flow::numeric > 0 THEN
      v_surplus := round(v_flow::numeric, 2);
      IF v_surplus <= 0 THEN
        v_surplus := NULL;
      END IF;
    END IF;
  END IF;

  IF v_strategy IN ('CONTENCION', 'REDUCCION_CARGA', 'CONSOLIDACION') THEN
    SELECT coalesce(jsonb_agg(
             jsonb_build_object(
               'debt_index', d -> 'debt_index',
               'monthly_debt_payment',
               CASE
                 WHEN jsonb_typeof(d -> 'monthly_debt_payment') = 'object'
                      AND (d -> 'monthly_debt_payment' ->> 'status') IN ('KNOWN_POSITIVE', 'KNOWN_ZERO')
                      AND jsonb_typeof(d -> 'monthly_debt_payment' -> 'value') = 'number'
                   THEN CASE
                     WHEN (d -> 'monthly_debt_payment' -> 'value')::numeric >= 0
                       THEN to_jsonb(round((d -> 'monthly_debt_payment' -> 'value')::numeric, 2))
                     ELSE 'null'::jsonb
                   END
                 ELSE 'null'::jsonb
               END
             )
             ORDER BY (d -> 'debt_index')::numeric
           ), '[]'::jsonb)
      INTO v_active
    FROM jsonb_array_elements(v_debts) d
    WHERE (d -> 'active_debt') = 'true'::jsonb;
  END IF;

  IF v_strategy IN ('CONTENCION', 'REDUCCION_CARGA') THEN
    SELECT coalesce(jsonb_agg(a -> 'debt_index' ORDER BY (a -> 'debt_index')::numeric), '[]'::jsonb)
      INTO v_lower
    FROM jsonb_array_elements(v_active) a
    WHERE CASE WHEN jsonb_typeof(a -> 'monthly_debt_payment') = 'number'
            THEN (a -> 'monthly_debt_payment')::numeric > 0
            ELSE false
          END
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_disputed) x WHERE x::numeric = (a -> 'debt_index')::numeric
      );
  END IF;

  IF v_surplus IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(a -> 'debt_index' ORDER BY (a -> 'debt_index')::numeric), '[]'::jsonb)
      INTO v_surplus_debts
    FROM jsonb_array_elements(v_active) a
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_disputed) x WHERE x::numeric = (a -> 'debt_index')::numeric
    );
  END IF;

  RETURN jsonb_build_object(
    'strategy', v_strategy,
    'monthly_surplus', CASE WHEN v_surplus IS NULL THEN NULL ELSE jsonb_build_object('amount', v_surplus) END,
    'active_debts', v_active,
    'lower_payment_debts', v_lower,
    'surplus_debts', v_surplus_debts
  );
END;
$function$;

REVOKE ALL ON FUNCTION miplan_private.v2_choice_authority(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION miplan_private.v2_choice_authority(jsonb) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Interaction authority (20261001180000) plus contact_debts: REGULARIZACION mora debts that are not
-- disputed (the creditor_contact_step targets); else []. expense_categories and mora_debts unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION miplan_private.v2_interaction_authority(p_result jsonb, p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog', 'miplan_private'
AS $function$
DECLARE
  v_base jsonb;
  v_strategy text;
  v_expenses jsonb := '[]'::jsonb;
  v_mora jsonb := '[]'::jsonb;
  v_contact jsonb := '[]'::jsonb;
  v_disputed jsonb;
BEGIN
  v_base := v2_choice_authority(p_result);
  IF v_base IS NULL THEN
    RETURN NULL;
  END IF;
  v_strategy := v_base ->> 'strategy';

  IF v_strategy = 'CONTENCION'
     OR (v_strategy = 'MANTENIMIENTO_OPTIMIZACION' AND jsonb_typeof(v_base -> 'monthly_surplus') = 'null') THEN
    v_expenses := v2_expense_categories(p_snapshot);
  END IF;

  IF v_strategy = 'REGULARIZACION' THEN
    SELECT coalesce(jsonb_agg(d -> 'debt_index' ORDER BY (d -> 'debt_index')::numeric), '[]'::jsonb)
      INTO v_mora
    FROM jsonb_array_elements(p_result -> 'canonical_facts' -> 'debts') d
    WHERE (d -> 'active_mora') = 'true'::jsonb;
    v_disputed := v2_disputed_debts(p_result);
    SELECT coalesce(jsonb_agg(m ORDER BY m::numeric), '[]'::jsonb)
      INTO v_contact
    FROM jsonb_array_elements(v_mora) m
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_disputed) x WHERE x::numeric = m::numeric);
  END IF;

  RETURN jsonb_build_object('strategy', v_strategy, 'expense_categories', v_expenses, 'mora_debts', v_mora,
    'contact_debts', v_contact);
END;
$function$;

REVOKE ALL ON FUNCTION miplan_private.v2_interaction_authority(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION miplan_private.v2_interaction_authority(jsonb, jsonb) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Record a user choice (same signature and contract as 20261001180000; only the surplus_to_debt and
-- creditor_contact_step target checks read the disputed-free lists).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miplan_record_user_choice(
  p_secret text,
  p_anonymous_id text,
  p_evaluation_id uuid,
  p_diagnosis_id uuid,
  p_choice_type text,
  p_debt_index integer,
  p_amount numeric,
  p_reserve_destination text,
  p_lower_payment_state text,
  p_expense_ref text DEFAULT NULL,
  p_choice_state text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
DECLARE
  expected text;
  ev public.financial_strategy_evaluations%ROWTYPE;
  journey_owner text;
  authority jsonb;
  interaction jsonb;
  origin_snapshot jsonb;
  surplus numeric;
  current_expense numeric;
  eligible boolean;
  v_slot text;
  head public.financial_strategy_user_choice_events%ROWTYPE;
  inserted public.financial_strategy_user_choice_events%ROWTYPE;
  current_row public.financial_strategy_user_choice_events%ROWTYPE;
  has_head boolean := false;
  was_appended boolean := false;
BEGIN
  SELECT s.secret INTO expected
  FROM miplan_private.backend_secrets s
  WHERE s.name = 'b2_persist';

  IF expected IS NULL OR p_secret IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'MIPLAN_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN
    RAISE EXCEPTION 'INVALID_ANONYMOUS_ID' USING ERRCODE = '22023';
  END IF;

  IF p_evaluation_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_EVALUATION_ID' USING ERRCODE = '22023';
  END IF;

  -- Ownership first; the row lock serializes every choice write of this evaluation.
  SELECT * INTO ev
  FROM public.financial_strategy_evaluations e
  WHERE e.evaluation_id = p_evaluation_id AND e.anonymous_id = p_anonymous_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVALUATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT j.anonymous_id INTO journey_owner FROM public.journeys j WHERE j.journey_id = ev.journey_id;
  IF journey_owner IS DISTINCT FROM p_anonymous_id THEN
    RAISE EXCEPTION 'EVALUATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF p_diagnosis_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.diagnosis_strategy_evaluations l
    JOIN public.diagnoses d ON d.diagnosis_id = l.diagnosis_id
    WHERE l.diagnosis_id = p_diagnosis_id AND l.evaluation_id = ev.evaluation_id AND d.anonymous_id = p_anonymous_id
  ) THEN
    RAISE EXCEPTION 'DIAGNOSIS_NOT_LINKED' USING ERRCODE = '22023';
  END IF;

  authority := miplan_private.v2_choice_authority(ev.result);
  surplus := (authority -> 'monthly_surplus' ->> 'amount')::numeric;

  IF p_choice_type IN ('lower_payment_intent', 'surplus_to_debt', 'surplus_reserve')
     AND (p_expense_ref IS NOT NULL OR p_choice_state IS NOT NULL) THEN
    RAISE EXCEPTION 'INVALID_CHOICE_PAYLOAD' USING ERRCODE = '22023';
  END IF;

  IF p_choice_type = 'lower_payment_intent' THEN
    IF p_lower_payment_state IS NULL OR p_lower_payment_state NOT IN ('marked', 'unmarked')
       OR p_debt_index IS NULL OR p_debt_index < 0 OR p_amount IS NOT NULL OR p_reserve_destination IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_CHOICE_PAYLOAD' USING ERRCODE = '22023';
    END IF;
    -- Only strategies that authorize it, on an active debt with a known payment > 0 (see v2_choice_authority).
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(authority -> 'lower_payment_debts', '[]'::jsonb)) i
      WHERE i::numeric = p_debt_index
    ) INTO eligible;
    IF NOT eligible THEN
      RAISE EXCEPTION 'DEBT_NOT_ELIGIBLE' USING ERRCODE = '22023';
    END IF;
    v_slot := 'lower_payment_intent:' || p_debt_index::text;

  ELSIF p_choice_type IN ('surplus_to_debt', 'surplus_reserve') THEN
    IF p_amount IS NULL OR p_lower_payment_state IS NOT NULL
       OR (p_choice_type = 'surplus_to_debt' AND (p_debt_index IS NULL OR p_debt_index < 0 OR p_reserve_destination IS NOT NULL))
       OR (p_choice_type = 'surplus_reserve' AND (p_reserve_destination IS NULL OR p_debt_index IS NOT NULL)) THEN
      RAISE EXCEPTION 'INVALID_CHOICE_PAYLOAD' USING ERRCODE = '22023';
    END IF;
    IF p_choice_type = 'surplus_reserve' AND p_reserve_destination NOT IN ('emergency_fund', 'planned_goal') THEN
      RAISE EXCEPTION 'INVALID_RESERVE_DESTINATION' USING ERRCODE = '22023';
    END IF;
    IF surplus IS NULL THEN
      RAISE EXCEPTION 'SURPLUS_NOT_AVAILABLE' USING ERRCODE = '22023';
    END IF;
    IF p_choice_type = 'surplus_to_debt' AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(authority -> 'surplus_debts', '[]'::jsonb)) i
      WHERE i::numeric = p_debt_index
    ) THEN
      RAISE EXCEPTION 'DEBT_NOT_ELIGIBLE' USING ERRCODE = '22023';
    END IF;
    IF p_amount <> round(p_amount, 2) THEN
      RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
    END IF;
    IF p_amount <= 0 OR p_amount > surplus THEN
      RAISE EXCEPTION 'AMOUNT_OUT_OF_RANGE' USING ERRCODE = '22023';
    END IF;
    v_slot := 'surplus_allocation';

  ELSIF p_choice_type = 'expense_reduction_intent' THEN
    IF p_choice_state IS NULL OR p_choice_state NOT IN ('marked', 'unmarked') OR p_expense_ref IS NULL
       OR p_debt_index IS NOT NULL OR p_reserve_destination IS NOT NULL OR p_lower_payment_state IS NOT NULL
       OR (p_choice_state = 'marked' AND p_amount IS NULL) OR (p_choice_state = 'unmarked' AND p_amount IS NOT NULL) THEN
      RAISE EXCEPTION 'INVALID_CHOICE_PAYLOAD' USING ERRCODE = '22023';
    END IF;
    IF p_expense_ref !~ '^(vivienda|alimentacion|servicios|transporte|salud|educacion|hijos_familia|ocio|custom:[1-9][0-9]{0,3})$' THEN
      RAISE EXCEPTION 'INVALID_EXPENSE_REF' USING ERRCODE = '22023';
    END IF;
    SELECT d.input_snapshot INTO origin_snapshot FROM public.diagnoses d WHERE d.diagnosis_id = ev.origin_diagnosis_id;
    interaction := miplan_private.v2_interaction_authority(ev.result, origin_snapshot);
    SELECT (c ->> 'amount')::numeric INTO current_expense
    FROM jsonb_array_elements(coalesce(interaction -> 'expense_categories', '[]'::jsonb)) c
    WHERE c ->> 'expense_ref' = p_expense_ref;
    IF current_expense IS NULL THEN
      RAISE EXCEPTION 'EXPENSE_NOT_ELIGIBLE' USING ERRCODE = '22023';
    END IF;
    IF p_choice_state = 'marked' THEN
      IF p_amount <> round(p_amount, 2) THEN
        RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
      END IF;
      IF p_amount <= 0 OR p_amount > current_expense THEN
        RAISE EXCEPTION 'AMOUNT_OUT_OF_RANGE' USING ERRCODE = '22023';
      END IF;
    END IF;
    v_slot := 'expense_reduction:' || p_expense_ref;

  ELSIF p_choice_type = 'creditor_contact_step' THEN
    IF p_choice_state IS NULL OR p_choice_state NOT IN ('planned', 'contacted', 'none')
       OR p_debt_index IS NULL OR p_debt_index < 0 OR p_amount IS NOT NULL OR p_expense_ref IS NOT NULL
       OR p_reserve_destination IS NOT NULL OR p_lower_payment_state IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_CHOICE_PAYLOAD' USING ERRCODE = '22023';
    END IF;
    interaction := miplan_private.v2_interaction_authority(ev.result, NULL);
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(interaction -> 'contact_debts', '[]'::jsonb)) i
      WHERE i::numeric = p_debt_index
    ) INTO eligible;
    IF NOT eligible THEN
      RAISE EXCEPTION 'DEBT_NOT_ELIGIBLE' USING ERRCODE = '22023';
    END IF;
    v_slot := 'creditor_contact:' || p_debt_index::text;

  ELSE
    RAISE EXCEPTION 'INVALID_CHOICE_TYPE' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO head
  FROM public.financial_strategy_user_choice_events c
  WHERE c.evaluation_id = ev.evaluation_id AND c.slot_key = v_slot
  ORDER BY c.seq DESC
  LIMIT 1;
  has_head := FOUND;

  IF has_head
     AND head.choice_type = p_choice_type
     AND head.lower_payment_state IS NOT DISTINCT FROM p_lower_payment_state
     AND head.debt_index IS NOT DISTINCT FROM p_debt_index
     AND head.amount IS NOT DISTINCT FROM p_amount
     AND head.reserve_destination IS NOT DISTINCT FROM p_reserve_destination
     AND head.expense_ref IS NOT DISTINCT FROM p_expense_ref
     AND head.choice_state IS NOT DISTINCT FROM p_choice_state THEN
    current_row := head;
  ELSIF NOT has_head AND (
       (p_choice_type = 'lower_payment_intent' AND p_lower_payment_state = 'unmarked')
    OR (p_choice_type = 'expense_reduction_intent' AND p_choice_state = 'unmarked')
    OR (p_choice_type = 'creditor_contact_step' AND p_choice_state = 'none')) THEN
    current_row := NULL;
  ELSE
    INSERT INTO public.financial_strategy_user_choice_events (
      evaluation_id, journey_id, anonymous_id, origin_diagnosis_id, contract_version, slot_key, choice_type,
      lower_payment_state, debt_index, amount, reserve_destination, expense_ref, choice_state,
      seq, supersedes_event_id, supersedes_seq, created_at
    ) VALUES (
      ev.evaluation_id, ev.journey_id, ev.anonymous_id, p_diagnosis_id, 'user_choice_v1', v_slot, p_choice_type,
      p_lower_payment_state, p_debt_index, p_amount, p_reserve_destination, p_expense_ref, p_choice_state,
      CASE WHEN has_head THEN head.seq + 1 ELSE 1 END,
      CASE WHEN has_head THEN head.event_id ELSE NULL END,
      CASE WHEN has_head THEN head.seq ELSE NULL END,
      clock_timestamp()
    )
    RETURNING * INTO inserted;
    current_row := inserted;
    was_appended := true;
  END IF;

  RETURN jsonb_build_object(
    'evaluation_id', ev.evaluation_id,
    'slot_key', v_slot,
    'appended', was_appended,
    'current', CASE WHEN current_row.event_id IS NULL THEN NULL ELSE jsonb_build_object(
      'event_id', current_row.event_id,
      'choice_type', current_row.choice_type,
      'lower_payment_state', current_row.lower_payment_state,
      'debt_index', current_row.debt_index,
      'amount', current_row.amount,
      'reserve_destination', current_row.reserve_destination,
      'expense_ref', current_row.expense_ref,
      'choice_state', current_row.choice_state,
      'seq', current_row.seq,
      'origin_diagnosis_id', current_row.origin_diagnosis_id,
      'created_at', current_row.created_at
    ) END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_record_user_choice(
  text, text, uuid, uuid, text, integer, numeric, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_record_user_choice(
  text, text, uuid, uuid, text, integer, numeric, text, text, text, text
) TO anon, authenticated, service_role;
