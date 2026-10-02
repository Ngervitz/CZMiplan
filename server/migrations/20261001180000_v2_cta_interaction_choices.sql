-- V2-CTA-INTERACTION-01 — two more user_choice_v1 types on V2 evaluations:
--   expense_reduction_intent  the user declares how much they think they could cut from one expense
--                             (marked + amount / unmarked). Not a reduction achieved.
--   creditor_contact_step     the user declares a step with the creditor of a debt in mora
--                             (planned / contacted / none). Not an agreement, refinancing or solution.
-- WRITTEN, NOT APPLIED. Requires 20261001120000_v2_user_choices.sql. Apply only by explicit decision
-- (never through `supabase db push`), before deploying the server that sends these choice types.
--
-- Delta on financial_strategy_user_choice_events (no new table): 2 nullable columns, widened CHECKs.
-- Append-only triggers, slots (current = max(seq)), vigency per evaluation_id, RLS and revokes are
-- unchanged. miplan_record_user_choice gains 2 trailing DEFAULT NULL parameters: the original
-- nine-argument named call keeps resolving to it. miplan_get_user_choice_state keeps its signature.
--
-- Authority: the stored evaluation result plus the input_snapshot of its origin diagnosis
-- (financial_strategy_evaluations.origin_diagnosis_id: NOT NULL, UNIQUE, diagnoses is append-only).
-- Every diagnosis linked to an evaluation has the same financial_input_identity_v1, hence the same
-- canonical expenses, so the origin snapshot projects the same categories for all of them.
--
-- ROLLBACK (only while no row of the two new types exists; the ADD CONSTRAINTs fail otherwise):
--   DROP FUNCTION public.miplan_record_user_choice(text, text, uuid, uuid, text, integer, numeric, text, text, text, text);
--   ALTER TABLE public.financial_strategy_user_choice_events
--     DROP CONSTRAINT fs_user_choice_events_type_check,
--     DROP CONSTRAINT fs_user_choice_events_payload_check,
--     DROP CONSTRAINT fs_user_choice_events_slot_check,
--     DROP COLUMN expense_ref,
--     DROP COLUMN choice_state,
--     ADD CONSTRAINT fs_user_choice_events_type_check
--       CHECK (choice_type IN ('lower_payment_intent', 'surplus_to_debt', 'surplus_reserve')),
--     ADD CONSTRAINT fs_user_choice_events_payload_check CHECK (
--       (choice_type = 'lower_payment_intent'
--         AND lower_payment_state IS NOT NULL AND lower_payment_state IN ('marked', 'unmarked')
--         AND debt_index IS NOT NULL AND debt_index >= 0
--         AND amount IS NULL AND reserve_destination IS NULL)
--       OR (choice_type = 'surplus_to_debt'
--         AND debt_index IS NOT NULL AND debt_index >= 0
--         AND amount IS NOT NULL AND amount > 0 AND amount = round(amount, 2)
--         AND lower_payment_state IS NULL AND reserve_destination IS NULL)
--       OR (choice_type = 'surplus_reserve'
--         AND reserve_destination IS NOT NULL AND reserve_destination IN ('emergency_fund', 'planned_goal')
--         AND amount IS NOT NULL AND amount > 0 AND amount = round(amount, 2)
--         AND debt_index IS NULL AND lower_payment_state IS NULL)
--     ),
--     ADD CONSTRAINT fs_user_choice_events_slot_check CHECK (
--       slot_key = CASE
--         WHEN choice_type = 'lower_payment_intent' THEN 'lower_payment_intent:' || debt_index::text
--         ELSE 'surplus_allocation'
--       END
--     );
--   DROP FUNCTION miplan_private.v2_interaction_authority(jsonb, jsonb);
--   DROP FUNCTION miplan_private.v2_expense_categories(jsonb);
--   DROP FUNCTION miplan_private.v2_expense_value(jsonb);
--   then re-run, verbatim from 20261001120000_v2_user_choices.sql: the COMMENT ON TABLE
--   public.financial_strategy_user_choice_events, the miplan_record_user_choice block (CREATE OR REPLACE
--   + REVOKE + GRANT) and the miplan_get_user_choice_state block (CREATE OR REPLACE + REVOKE + GRANT).

-- ---------------------------------------------------------------------------
-- Expense amount of one gastos value / custom expense, with the financial_input_identity_v1 rules
-- (js/financialInputIdentity.js canonicalExpense): NULL = blank or zero (not an entry), -1 = declared
-- but invalid or negative (an entry, never projected), otherwise the exact amount.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION miplan_private.v2_expense_value(p_raw jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_text text;
  v_num numeric;
BEGIN
  IF p_raw IS NULL OR jsonb_typeof(p_raw) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_raw) = 'number' THEN
    v_num := p_raw::text::numeric;
  ELSIF jsonb_typeof(p_raw) = 'string' THEN
    -- String.prototype.trim: ASCII whitespace plus the Unicode space separators, LS, PS and BOM.
    v_text := regexp_replace(p_raw #>> '{}',
      '^[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$',
      '', 'g');
    IF v_text = '' THEN
      RETURN NULL;
    END IF;
    IF v_text !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      RETURN -1;
    END IF;
    v_num := v_text::numeric;
  ELSE
    RETURN -1;
  END IF;
  IF v_num = 0 THEN
    RETURN NULL;
  END IF;
  IF v_num < 0 THEN
    RETURN -1;
  END IF;
  RETURN v_num;
END;
$function$;

REVOKE ALL ON FUNCTION miplan_private.v2_expense_value(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION miplan_private.v2_expense_value(jsonb) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- expense_categories of an input_snapshot. Must equal projectExpenseCategories in
-- server/modules/diagnosis/actionContext.js (JS ↔ SQL parity test in server/bin/v2-interaction-db-test.js):
-- catalog keys in fixed order, then custom expenses as 'custom:<n>' (n = 1-based position among the
-- included non-blank non-zero entries, invalid ones counted). Amount = round(value, 2), kept only when
-- 0 < amount < 1e12. Unknown gastos keys are ignored.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION miplan_private.v2_expense_categories(p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog', 'miplan_private'
AS $function$
DECLARE
  v_gastos jsonb;
  v_custom jsonb;
  v_out jsonb := '[]'::jsonb;
  v_key text;
  v_value numeric;
  v_amount numeric;
  v_item jsonb;
  v_raw jsonb;
  v_pos integer := 0;
BEGIN
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' THEN
    RETURN v_out;
  END IF;

  v_gastos := p_snapshot -> 'gastos';
  IF jsonb_typeof(v_gastos) = 'object' THEN
    FOREACH v_key IN ARRAY ARRAY['vivienda', 'alimentacion', 'servicios', 'transporte', 'salud', 'educacion',
                                 'hijos_familia', 'ocio'] LOOP
      v_value := v2_expense_value(v_gastos -> v_key);
      IF v_value IS NOT NULL AND v_value > 0 THEN
        v_amount := round(v_value, 2);
        IF v_amount > 0 AND v_amount < 1000000000000 THEN
          v_out := v_out || jsonb_build_array(jsonb_build_object('expense_ref', v_key, 'amount', v_amount));
        END IF;
      END IF;
    END LOOP;
  END IF;

  v_custom := p_snapshot -> 'custom_expenses';
  IF jsonb_typeof(v_custom) = 'array' THEN
    FOR v_item IN SELECT e FROM jsonb_array_elements(v_custom) WITH ORDINALITY AS t(e, o) ORDER BY o LOOP
      CONTINUE WHEN jsonb_typeof(v_item) <> 'object';
      CONTINUE WHEN (v_item -> 'included') = 'false'::jsonb OR (v_item -> '_included') = 'false'::jsonb;
      v_raw := CASE WHEN v_item -> 'amount' IS NULL OR jsonb_typeof(v_item -> 'amount') = 'null'
                    THEN v_item -> 'monto' ELSE v_item -> 'amount' END;
      v_value := v2_expense_value(v_raw);
      CONTINUE WHEN v_value IS NULL;
      v_pos := v_pos + 1;
      IF v_value > 0 AND v_pos <= 9999 THEN
        v_amount := round(v_value, 2);
        IF v_amount > 0 AND v_amount < 1000000000000 THEN
          v_out := v_out || jsonb_build_array(jsonb_build_object('expense_ref', 'custom:' || v_pos::text, 'amount', v_amount));
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION miplan_private.v2_expense_categories(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION miplan_private.v2_expense_categories(jsonb) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Interaction authority of an evaluation (result + origin snapshot). NULL when v2_choice_authority is
-- NULL (not classified, unknown strategy, malformed debts).
--   expense_categories  CONTENCION, or MANTENIMIENTO_OPTIMIZACION without monthly_surplus; else []
--   mora_debts          REGULARIZACION: debts whose own active_mora is true; else []
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
  END IF;

  RETURN jsonb_build_object('strategy', v_strategy, 'expense_categories', v_expenses, 'mora_debts', v_mora);
END;
$function$;

REVOKE ALL ON FUNCTION miplan_private.v2_interaction_authority(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION miplan_private.v2_interaction_authority(jsonb, jsonb) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- financial_strategy_user_choice_events: 2 columns + widened CHECKs.
-- Slots: 'expense_reduction:<expense_ref>' (one per expense; marked / unmarked) and
-- 'creditor_contact:<debt_index>' (one per debt in mora; planned / contacted / none).
-- expense_ref: catalog key or 'custom:<n>' (positional V1 reference, never remapped across
-- evaluations). amount on a marked expense: monthly UYU, 0 < amount <= that expense (checked by the RPC).
-- ---------------------------------------------------------------------------

ALTER TABLE public.financial_strategy_user_choice_events
  ADD COLUMN IF NOT EXISTS expense_ref text NULL,
  ADD COLUMN IF NOT EXISTS choice_state text NULL;

ALTER TABLE public.financial_strategy_user_choice_events
  DROP CONSTRAINT IF EXISTS fs_user_choice_events_type_check,
  ADD CONSTRAINT fs_user_choice_events_type_check
    CHECK (choice_type IN ('lower_payment_intent', 'surplus_to_debt', 'surplus_reserve',
                           'expense_reduction_intent', 'creditor_contact_step')),
  DROP CONSTRAINT IF EXISTS fs_user_choice_events_payload_check,
  ADD CONSTRAINT fs_user_choice_events_payload_check CHECK (
    (choice_type = 'lower_payment_intent'
      AND lower_payment_state IS NOT NULL AND lower_payment_state IN ('marked', 'unmarked')
      AND debt_index IS NOT NULL AND debt_index >= 0
      AND amount IS NULL AND reserve_destination IS NULL AND expense_ref IS NULL AND choice_state IS NULL)
    OR (choice_type = 'surplus_to_debt'
      AND debt_index IS NOT NULL AND debt_index >= 0
      AND amount IS NOT NULL AND amount > 0 AND amount = round(amount, 2)
      AND lower_payment_state IS NULL AND reserve_destination IS NULL AND expense_ref IS NULL AND choice_state IS NULL)
    OR (choice_type = 'surplus_reserve'
      AND reserve_destination IS NOT NULL AND reserve_destination IN ('emergency_fund', 'planned_goal')
      AND amount IS NOT NULL AND amount > 0 AND amount = round(amount, 2)
      AND debt_index IS NULL AND lower_payment_state IS NULL AND expense_ref IS NULL AND choice_state IS NULL)
    OR (choice_type = 'expense_reduction_intent'
      AND expense_ref IS NOT NULL
      AND expense_ref ~ '^(vivienda|alimentacion|servicios|transporte|salud|educacion|hijos_familia|ocio|custom:[1-9][0-9]{0,3})$'
      AND choice_state IS NOT NULL AND choice_state IN ('marked', 'unmarked')
      AND ((choice_state = 'marked' AND amount IS NOT NULL AND amount > 0 AND amount = round(amount, 2))
        OR (choice_state = 'unmarked' AND amount IS NULL))
      AND debt_index IS NULL AND lower_payment_state IS NULL AND reserve_destination IS NULL)
    OR (choice_type = 'creditor_contact_step'
      AND debt_index IS NOT NULL AND debt_index >= 0
      AND choice_state IS NOT NULL AND choice_state IN ('planned', 'contacted', 'none')
      AND amount IS NULL AND expense_ref IS NULL AND lower_payment_state IS NULL AND reserve_destination IS NULL)
  ),
  DROP CONSTRAINT IF EXISTS fs_user_choice_events_slot_check,
  ADD CONSTRAINT fs_user_choice_events_slot_check CHECK (
    slot_key = CASE
      WHEN choice_type = 'lower_payment_intent' THEN 'lower_payment_intent:' || debt_index::text
      WHEN choice_type = 'expense_reduction_intent' THEN 'expense_reduction:' || expense_ref
      WHEN choice_type = 'creditor_contact_step' THEN 'creditor_contact:' || debt_index::text
      ELSE 'surplus_allocation'
    END
  );

COMMENT ON TABLE public.financial_strategy_user_choice_events IS
  'V2-USER-CHOICE-01 user_choice_v1: append-only user choices per V2 evaluation. Current per slot = '
  'max(seq). Financial decisions and declared steps only (V2-CTA-INTERACTION-01: expense reduction '
  'intents, creditor contact steps): not reductions achieved, not agreements, not commercial consent, '
  'not authorization to share data. Backend only.';

-- ---------------------------------------------------------------------------
-- Record a user choice (replaces the nine-argument version; same contract for the original types).
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.miplan_record_user_choice(text, text, uuid, uuid, text, integer, numeric, text, text);

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
      SELECT 1 FROM jsonb_array_elements(coalesce(authority -> 'active_debts', '[]'::jsonb)) a
      WHERE (a ->> 'debt_index')::numeric = p_debt_index
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
      SELECT 1 FROM jsonb_array_elements(coalesce(interaction -> 'mora_debts', '[]'::jsonb)) i
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

-- ---------------------------------------------------------------------------
-- Read the current state of an owned evaluation. Adds, for the backend only: the evaluation's
-- financial_input_identity, the expense part of its origin diagnosis snapshot (to derive
-- expense_categories), and the current expense_reduction_intent / creditor_contact_step heads.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miplan_get_user_choice_state(
  p_secret text,
  p_anonymous_id text,
  p_evaluation_id uuid DEFAULT NULL,
  p_diagnosis_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
DECLARE
  expected text;
  v_evaluation uuid;
  ev public.financial_strategy_evaluations%ROWTYPE;
  journey_owner text;
  origin_snapshot jsonb;
  v_lower jsonb;
  v_surplus jsonb;
  v_expense jsonb;
  v_contact jsonb;
  v_opt_in jsonb;
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

  IF (p_evaluation_id IS NULL) = (p_diagnosis_id IS NULL) THEN
    RAISE EXCEPTION 'INVALID_LOOKUP' USING ERRCODE = '22023';
  END IF;

  IF p_diagnosis_id IS NOT NULL THEN
    SELECT l.evaluation_id INTO v_evaluation
    FROM public.diagnosis_strategy_evaluations l
    JOIN public.diagnoses d ON d.diagnosis_id = l.diagnosis_id
    WHERE l.diagnosis_id = p_diagnosis_id AND d.anonymous_id = p_anonymous_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EVALUATION_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_evaluation := p_evaluation_id;
  END IF;

  SELECT * INTO ev
  FROM public.financial_strategy_evaluations e
  WHERE e.evaluation_id = v_evaluation AND e.anonymous_id = p_anonymous_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVALUATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT j.anonymous_id INTO journey_owner FROM public.journeys j WHERE j.journey_id = ev.journey_id;
  IF journey_owner IS DISTINCT FROM p_anonymous_id THEN
    RAISE EXCEPTION 'EVALUATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT d.input_snapshot INTO origin_snapshot FROM public.diagnoses d WHERE d.diagnosis_id = ev.origin_diagnosis_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'event_id', h.event_id, 'debt_index', h.debt_index, 'seq', h.seq, 'created_at', h.created_at
         ) ORDER BY h.debt_index), '[]'::jsonb)
    INTO v_lower
  FROM (
    SELECT DISTINCT ON (c.slot_key) c.*
    FROM public.financial_strategy_user_choice_events c
    WHERE c.evaluation_id = ev.evaluation_id AND c.choice_type = 'lower_payment_intent'
    ORDER BY c.slot_key, c.seq DESC
  ) h
  WHERE h.lower_payment_state = 'marked';

  SELECT jsonb_build_object(
           'event_id', c.event_id, 'choice_type', c.choice_type, 'debt_index', c.debt_index, 'amount', c.amount,
           'reserve_destination', c.reserve_destination, 'seq', c.seq, 'created_at', c.created_at)
    INTO v_surplus
  FROM public.financial_strategy_user_choice_events c
  WHERE c.evaluation_id = ev.evaluation_id AND c.slot_key = 'surplus_allocation'
  ORDER BY c.seq DESC
  LIMIT 1;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'event_id', h.event_id, 'expense_ref', h.expense_ref, 'amount', h.amount, 'seq', h.seq, 'created_at', h.created_at
         ) ORDER BY h.expense_ref), '[]'::jsonb)
    INTO v_expense
  FROM (
    SELECT DISTINCT ON (c.slot_key) c.*
    FROM public.financial_strategy_user_choice_events c
    WHERE c.evaluation_id = ev.evaluation_id AND c.choice_type = 'expense_reduction_intent'
    ORDER BY c.slot_key, c.seq DESC
  ) h
  WHERE h.choice_state = 'marked';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'event_id', h.event_id, 'debt_index', h.debt_index, 'state', h.choice_state, 'seq', h.seq, 'created_at', h.created_at
         ) ORDER BY h.debt_index), '[]'::jsonb)
    INTO v_contact
  FROM (
    SELECT DISTINCT ON (c.slot_key) c.*
    FROM public.financial_strategy_user_choice_events c
    WHERE c.evaluation_id = ev.evaluation_id AND c.choice_type = 'creditor_contact_step'
    ORDER BY c.slot_key, c.seq DESC
  ) h
  WHERE h.choice_state <> 'none';

  SELECT jsonb_build_object(
           'event_id', o.event_id, 'scope', o.scope, 'state', o.state, 'seq', o.seq, 'created_at', o.created_at)
    INTO v_opt_in
  FROM public.debt_management_opt_in_events o
  WHERE o.journey_id = ev.journey_id AND o.scope = 'debt_management_interest'
  ORDER BY o.seq DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'evaluation_id', ev.evaluation_id,
    'classification_status', ev.classification_status,
    'strategy', ev.strategy,
    'classifier_version', ev.classifier_version,
    'financial_input_identity_version', ev.financial_input_identity_version,
    'financial_input_identity', ev.financial_input_identity,
    'result', ev.result,
    'origin_expense_input', jsonb_build_object(
      'gastos', origin_snapshot -> 'gastos',
      'custom_expenses', origin_snapshot -> 'custom_expenses'),
    'lower_payment_intent', v_lower,
    'surplus_allocation', v_surplus,
    'expense_reduction_intent', v_expense,
    'creditor_contact_step', v_contact,
    'debt_management_opt_in', v_opt_in
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_get_user_choice_state(text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_get_user_choice_state(text, text, uuid, uuid)
  TO anon, authenticated, service_role;
