-- V2-USER-CHOICE-01 — explicit user choices on a V2 strategy evaluation, plus a separate
-- debt management opt-in (interest in receiving help; NOT consent to share data with third parties).
-- WRITTEN, NOT APPLIED. Requires 20260930120000_v2_strategy_evaluation_dedup.sql. Apply only by
-- explicit decision, before deploying the server that calls these RPCs.
--
-- Append-only: event rows are never updated or deleted (enforced by triggers). Each slot keeps a
-- linear supersession chain seq = 1..n: one root, at most one successor per event, the successor in
-- the same slot with seq + 1 (UNIQUE + composite FK). The current choice of a slot is its max(seq).
-- Writers serialize per evaluation (row lock) or per journey (advisory lock); the constraints are the
-- backstop, so two concurrent writers can never leave two current choices in one slot.
--
-- Vigency authority = evaluation_id (journey + financial_input_identity + classifier_version):
-- a new evaluation starts with no choices (no carry-forward). diagnosis_id is provenance only.

-- ---------------------------------------------------------------------------
-- Choice authority: the subset of action_context that authorizes choices, re-derived in SQL from
-- the stored evaluation result. Must equal server/modules/diagnosis/actionContext.js for
-- monthly_surplus and active_debts, and lowerPaymentEligible in server/modules/userChoice/service.js
-- for lower_payment_debts (JS ↔ SQL parity test in server/bin/v2-user-choice-db-test.js).
-- lower_payment_debts: only CONTENCION and REDUCCION_CARGA; active debts with a known payment > 0.
-- Fail closed: not classified, unknown strategy or malformed debts -> NULL.
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
          END;
  END IF;

  RETURN jsonb_build_object(
    'strategy', v_strategy,
    'monthly_surplus', CASE WHEN v_surplus IS NULL THEN NULL ELSE jsonb_build_object('amount', v_surplus) END,
    'active_debts', v_active,
    'lower_payment_debts', v_lower
  );
END;
$function$;

REVOKE ALL ON FUNCTION miplan_private.v2_choice_authority(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION miplan_private.v2_choice_authority(jsonb) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION miplan_private.forbid_user_choice_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  RAISE EXCEPTION 'USER_CHOICE_APPEND_ONLY' USING ERRCODE = '55000';
END;
$function$;

REVOKE ALL ON FUNCTION miplan_private.forbid_user_choice_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION miplan_private.forbid_user_choice_mutation() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- financial_strategy_user_choice_events: user_choice_v1.
-- Slots: 'lower_payment_intent:<debt_index>' (one per debt; marked / unmarked) and
-- 'surplus_allocation' (one per evaluation, shared by surplus_to_debt and surplus_reserve: choosing
-- either supersedes the current allocation). amount is a monthly UYU amount, 0 < amount <= the
-- evaluation's monthly_surplus (checked by the RPC); the rest of the surplus stays unassigned.
-- journey_id / anonymous_id are the evaluation's (copied by the RPC for traceability).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.financial_strategy_user_choice_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.financial_strategy_evaluations (evaluation_id),
  journey_id uuid NOT NULL REFERENCES public.journeys (journey_id),
  anonymous_id text NOT NULL REFERENCES public.identities_anonymous (anonymous_id),
  origin_diagnosis_id uuid NULL REFERENCES public.diagnoses (diagnosis_id),
  contract_version text NOT NULL,
  slot_key text NOT NULL,
  choice_type text NOT NULL,
  lower_payment_state text NULL,
  debt_index integer NULL,
  amount numeric NULL,
  reserve_destination text NULL,
  seq integer NOT NULL,
  supersedes_event_id uuid NULL,
  supersedes_seq integer NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fs_user_choice_events_contract_check CHECK (contract_version = 'user_choice_v1'),
  CONSTRAINT fs_user_choice_events_type_check
    CHECK (choice_type IN ('lower_payment_intent', 'surplus_to_debt', 'surplus_reserve')),
  CONSTRAINT fs_user_choice_events_payload_check CHECK (
    (choice_type = 'lower_payment_intent'
      AND lower_payment_state IS NOT NULL AND lower_payment_state IN ('marked', 'unmarked')
      AND debt_index IS NOT NULL AND debt_index >= 0
      AND amount IS NULL AND reserve_destination IS NULL)
    OR (choice_type = 'surplus_to_debt'
      AND debt_index IS NOT NULL AND debt_index >= 0
      AND amount IS NOT NULL AND amount > 0 AND amount = round(amount, 2)
      AND lower_payment_state IS NULL AND reserve_destination IS NULL)
    OR (choice_type = 'surplus_reserve'
      AND reserve_destination IS NOT NULL AND reserve_destination IN ('emergency_fund', 'planned_goal')
      AND amount IS NOT NULL AND amount > 0 AND amount = round(amount, 2)
      AND debt_index IS NULL AND lower_payment_state IS NULL)
  ),
  CONSTRAINT fs_user_choice_events_slot_check CHECK (
    slot_key = CASE
      WHEN choice_type = 'lower_payment_intent' THEN 'lower_payment_intent:' || debt_index::text
      ELSE 'surplus_allocation'
    END
  ),
  CONSTRAINT fs_user_choice_events_chain_check CHECK (
    (seq = 1 AND supersedes_event_id IS NULL AND supersedes_seq IS NULL)
    OR (seq > 1 AND supersedes_event_id IS NOT NULL AND supersedes_seq IS NOT NULL AND supersedes_seq = seq - 1)
  ),
  CONSTRAINT fs_user_choice_events_slot_seq_key UNIQUE (evaluation_id, slot_key, seq),
  CONSTRAINT fs_user_choice_events_chain_target UNIQUE (evaluation_id, slot_key, event_id, seq),
  CONSTRAINT fs_user_choice_events_chain_fk
    FOREIGN KEY (evaluation_id, slot_key, supersedes_event_id, supersedes_seq)
    REFERENCES public.financial_strategy_user_choice_events (evaluation_id, slot_key, event_id, seq)
);

CREATE INDEX IF NOT EXISTS fs_user_choice_events_created_idx
  ON public.financial_strategy_user_choice_events (created_at, event_id);

ALTER TABLE public.financial_strategy_user_choice_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.financial_strategy_user_choice_events FROM PUBLIC;
REVOKE ALL ON TABLE public.financial_strategy_user_choice_events FROM anon, authenticated;

CREATE OR REPLACE TRIGGER fs_user_choice_events_append_only
  BEFORE UPDATE OR DELETE ON public.financial_strategy_user_choice_events
  FOR EACH ROW EXECUTE FUNCTION miplan_private.forbid_user_choice_mutation();
CREATE OR REPLACE TRIGGER fs_user_choice_events_no_truncate
  BEFORE TRUNCATE ON public.financial_strategy_user_choice_events
  FOR EACH STATEMENT EXECUTE FUNCTION miplan_private.forbid_user_choice_mutation();

COMMENT ON TABLE public.financial_strategy_user_choice_events IS
  'V2-USER-CHOICE-01 user_choice_v1: append-only user choices per V2 evaluation. Current per slot = '
  'max(seq). Financial decisions only: not commercial consent, not authorization to share data. Backend only.';

-- ---------------------------------------------------------------------------
-- debt_management_opt_in_events: debt_management_opt_in_v1, journey level.
-- scope 'debt_management_interest' = the user asked to receive help managing their debts (input
-- for the future Mi Deuda vertical via JANUS). It is NOT lower_payment_intent, NOT consent to share
-- data with any third party (a third-party scope would be a different value with its own legal
-- text), triggers nothing and is never derived from the legacy frontend mideuda_optin.
-- consent_text_version: version of the copy shown, NULL until that copy exists.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.debt_management_opt_in_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES public.journeys (journey_id),
  anonymous_id text NOT NULL REFERENCES public.identities_anonymous (anonymous_id),
  scope text NOT NULL,
  state text NOT NULL,
  contract_version text NOT NULL,
  source text NOT NULL,
  consent_text_version text NULL,
  origin_evaluation_id uuid NOT NULL REFERENCES public.financial_strategy_evaluations (evaluation_id),
  origin_diagnosis_id uuid NULL REFERENCES public.diagnoses (diagnosis_id),
  seq integer NOT NULL,
  supersedes_event_id uuid NULL,
  supersedes_seq integer NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT dm_opt_in_events_scope_check CHECK (scope = 'debt_management_interest'),
  CONSTRAINT dm_opt_in_events_state_check CHECK (state IN ('opted_in', 'withdrawn')),
  CONSTRAINT dm_opt_in_events_contract_check CHECK (contract_version = 'debt_management_opt_in_v1'),
  CONSTRAINT dm_opt_in_events_source_check CHECK (source = 'miplan_v2'),
  CONSTRAINT dm_opt_in_events_text_version_check
    CHECK (consent_text_version IS NULL OR consent_text_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  CONSTRAINT dm_opt_in_events_chain_check CHECK (
    (seq = 1 AND supersedes_event_id IS NULL AND supersedes_seq IS NULL)
    OR (seq > 1 AND supersedes_event_id IS NOT NULL AND supersedes_seq IS NOT NULL AND supersedes_seq = seq - 1)
  ),
  CONSTRAINT dm_opt_in_events_slot_seq_key UNIQUE (journey_id, scope, seq),
  CONSTRAINT dm_opt_in_events_chain_target UNIQUE (journey_id, scope, event_id, seq),
  CONSTRAINT dm_opt_in_events_chain_fk
    FOREIGN KEY (journey_id, scope, supersedes_event_id, supersedes_seq)
    REFERENCES public.debt_management_opt_in_events (journey_id, scope, event_id, seq)
);

CREATE INDEX IF NOT EXISTS dm_opt_in_events_created_idx
  ON public.debt_management_opt_in_events (created_at, event_id);

ALTER TABLE public.debt_management_opt_in_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.debt_management_opt_in_events FROM PUBLIC;
REVOKE ALL ON TABLE public.debt_management_opt_in_events FROM anon, authenticated;

CREATE OR REPLACE TRIGGER dm_opt_in_events_append_only
  BEFORE UPDATE OR DELETE ON public.debt_management_opt_in_events
  FOR EACH ROW EXECUTE FUNCTION miplan_private.forbid_user_choice_mutation();
CREATE OR REPLACE TRIGGER dm_opt_in_events_no_truncate
  BEFORE TRUNCATE ON public.debt_management_opt_in_events
  FOR EACH STATEMENT EXECUTE FUNCTION miplan_private.forbid_user_choice_mutation();

COMMENT ON TABLE public.debt_management_opt_in_events IS
  'V2-USER-CHOICE-01 debt_management_opt_in_v1: append-only, journey level. Interest in receiving '
  'debt management help; not consent to share data with third parties. Current = max(seq). Backend only.';

-- ---------------------------------------------------------------------------
-- Record a user choice. Authority: the stored evaluation (owned by p_anonymous_id), never client
-- values. Unknown and foreign evaluations get the same EVALUATION_NOT_FOUND. A request equal to the
-- current choice of its slot (or unmarking a never-marked debt) appends nothing.
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
  p_lower_payment_state text
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
  surplus numeric;
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
     AND head.reserve_destination IS NOT DISTINCT FROM p_reserve_destination THEN
    current_row := head;
  ELSIF NOT has_head AND p_choice_type = 'lower_payment_intent' AND p_lower_payment_state = 'unmarked' THEN
    current_row := NULL;
  ELSE
    INSERT INTO public.financial_strategy_user_choice_events (
      evaluation_id, journey_id, anonymous_id, origin_diagnosis_id, contract_version, slot_key, choice_type,
      lower_payment_state, debt_index, amount, reserve_destination, seq, supersedes_event_id, supersedes_seq, created_at
    ) VALUES (
      ev.evaluation_id, ev.journey_id, ev.anonymous_id, p_diagnosis_id, 'user_choice_v1', v_slot, p_choice_type,
      p_lower_payment_state, p_debt_index, p_amount, p_reserve_destination,
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
      'seq', current_row.seq,
      'origin_diagnosis_id', current_row.origin_diagnosis_id,
      'created_at', current_row.created_at
    ) END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_record_user_choice(
  text, text, uuid, uuid, text, integer, numeric, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_record_user_choice(
  text, text, uuid, uuid, text, integer, numeric, text, text
) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Record the debt management opt-in (journey level). Ownership via the originating evaluation.
-- Serialized per journey with a transaction advisory lock. Same-state requests append nothing.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miplan_record_debt_management_opt_in(
  p_secret text,
  p_anonymous_id text,
  p_evaluation_id uuid,
  p_diagnosis_id uuid,
  p_state text,
  p_consent_text_version text
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
  head public.debt_management_opt_in_events%ROWTYPE;
  inserted public.debt_management_opt_in_events%ROWTYPE;
  current_row public.debt_management_opt_in_events%ROWTYPE;
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

  SELECT * INTO ev
  FROM public.financial_strategy_evaluations e
  WHERE e.evaluation_id = p_evaluation_id AND e.anonymous_id = p_anonymous_id;

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

  IF p_state IS NULL OR p_state NOT IN ('opted_in', 'withdrawn') THEN
    RAISE EXCEPTION 'INVALID_OPT_IN_STATE' USING ERRCODE = '22023';
  END IF;

  IF p_consent_text_version IS NOT NULL AND p_consent_text_version !~ '^[a-z0-9][a-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'INVALID_CONSENT_TEXT_VERSION' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('miplan:debt_management_opt_in:' || ev.journey_id::text, 0));

  SELECT * INTO head
  FROM public.debt_management_opt_in_events o
  WHERE o.journey_id = ev.journey_id AND o.scope = 'debt_management_interest'
  ORDER BY o.seq DESC
  LIMIT 1;
  has_head := FOUND;

  IF has_head AND head.state = p_state THEN
    current_row := head;
  ELSIF NOT has_head AND p_state = 'withdrawn' THEN
    current_row := NULL;
  ELSE
    INSERT INTO public.debt_management_opt_in_events (
      journey_id, anonymous_id, scope, state, contract_version, source, consent_text_version,
      origin_evaluation_id, origin_diagnosis_id, seq, supersedes_event_id, supersedes_seq, created_at
    ) VALUES (
      ev.journey_id, ev.anonymous_id, 'debt_management_interest', p_state, 'debt_management_opt_in_v1', 'miplan_v2',
      p_consent_text_version, ev.evaluation_id, p_diagnosis_id,
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
    'appended', was_appended,
    'current', CASE WHEN current_row.event_id IS NULL THEN NULL ELSE jsonb_build_object(
      'event_id', current_row.event_id,
      'scope', current_row.scope,
      'state', current_row.state,
      'seq', current_row.seq,
      'origin_evaluation_id', current_row.origin_evaluation_id,
      'origin_diagnosis_id', current_row.origin_diagnosis_id,
      'consent_text_version', current_row.consent_text_version,
      'created_at', current_row.created_at
    ) END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_record_debt_management_opt_in(
  text, text, uuid, uuid, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_record_debt_management_opt_in(
  text, text, uuid, uuid, text, text
) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Read the current state of an owned evaluation (by evaluation_id or by one of its diagnoses).
-- Returns the stored result for the backend to derive action_context; the backend never forwards it.
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
  v_lower jsonb;
  v_surplus jsonb;
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
    'result', ev.result,
    'lower_payment_intent', v_lower,
    'surplus_allocation', v_surplus,
    'debt_management_opt_in', v_opt_in
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_get_user_choice_state(text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_get_user_choice_state(text, text, uuid, uuid)
  TO anon, authenticated, service_role;
