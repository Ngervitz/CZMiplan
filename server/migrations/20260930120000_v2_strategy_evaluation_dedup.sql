-- V2-HARNESS-SAFETY-AND-STRATEGY-DEDUP-01 — one semantic V2 strategy result per
-- (owner scope = journey, financial_input_identity, classifier_version); every legacy diagnosis
-- links to the result it used.
-- WRITTEN, NOT APPLIED. Apply only by explicit decision, before deploying the server that calls
-- miplan_record_financial_strategy_evaluation.
-- Additive only: diagnoses stays append-only (no UNIQUE, no ALTER, no UPDATE); journeys and
-- financial_strategy_results are untouched (the latter receives no new writes from that server).

-- ---------------------------------------------------------------------------
-- financial_strategy_evaluations: the deduplicated V2 result.
-- journey_id is the owner scope: a journey belongs to exactly one anonymous_id and neither its
-- owner nor its survey ever changes. anonymous_id is stored for traceability and verified.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.financial_strategy_evaluations (
  evaluation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES public.journeys (journey_id),
  anonymous_id text NOT NULL REFERENCES public.identities_anonymous (anonymous_id),
  financial_input_identity_version text NOT NULL,
  financial_input_identity text NOT NULL,
  classifier_version text NOT NULL,
  contract text NOT NULL,
  threshold_version text NOT NULL,
  survey_version smallint NOT NULL,
  classification_status text NOT NULL,
  strategy text NULL,
  result jsonb NOT NULL,
  origin_diagnosis_id uuid NOT NULL REFERENCES public.diagnoses (diagnosis_id),
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_strategy_evaluations_scope_key
    UNIQUE (journey_id, financial_input_identity_version, financial_input_identity, classifier_version),
  CONSTRAINT financial_strategy_evaluations_origin_unique UNIQUE (origin_diagnosis_id),
  CONSTRAINT financial_strategy_evaluations_identity_version_check
    CHECK (financial_input_identity_version ~ '^financial_input_identity_v[1-9][0-9]*$'),
  CONSTRAINT financial_strategy_evaluations_identity_check
    CHECK (financial_input_identity ~ '^[0-9a-f]{64}$'),
  CONSTRAINT financial_strategy_evaluations_classifier_version_check
    CHECK (btrim(classifier_version) <> ''),
  CONSTRAINT financial_strategy_evaluations_survey_version_check
    CHECK (survey_version = 2),
  CONSTRAINT financial_strategy_evaluations_status_check
    CHECK (classification_status IN ('classified', 'incomplete')),
  CONSTRAINT financial_strategy_evaluations_strategy_check
    CHECK (strategy IS NULL OR strategy IN (
      'CONTENCION',
      'REGULARIZACION',
      'REDUCCION_CARGA',
      'CONSOLIDACION',
      'MANTENIMIENTO_OPTIMIZACION'
    )),
  CONSTRAINT financial_strategy_evaluations_status_strategy_check
    CHECK ((classification_status = 'classified') = (strategy IS NOT NULL)),
  CONSTRAINT financial_strategy_evaluations_result_is_object
    CHECK (jsonb_typeof(result) = 'object')
);

ALTER TABLE public.financial_strategy_evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.financial_strategy_evaluations FROM PUBLIC;
REVOKE ALL ON TABLE public.financial_strategy_evaluations FROM anon, authenticated;

COMMENT ON TABLE public.financial_strategy_evaluations IS
  'V2-HARNESS-SAFETY-AND-STRATEGY-DEDUP-01: one V2 classification per (journey, financial input '
  'identity, classifier_version). origin_diagnosis_id = the diagnosis that computed it. Backend only.';

-- ---------------------------------------------------------------------------
-- diagnosis_strategy_evaluations: which evaluation each diagnosis used (origin or reuse).
-- income_provenance keeps this diagnosis' own result.provenance.income echo (source/detail/
-- user_modified/nature), the only part of the classifier output identity v1 does not determine;
-- evaluation.result with it swapped in is exactly this diagnosis' classifier output.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.diagnosis_strategy_evaluations (
  diagnosis_id uuid PRIMARY KEY REFERENCES public.diagnoses (diagnosis_id),
  evaluation_id uuid NOT NULL REFERENCES public.financial_strategy_evaluations (evaluation_id),
  income_provenance jsonb NULL,
  linked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diagnosis_strategy_evaluations_evaluation_idx
  ON public.diagnosis_strategy_evaluations (evaluation_id, linked_at);

ALTER TABLE public.diagnosis_strategy_evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.diagnosis_strategy_evaluations FROM PUBLIC;
REVOKE ALL ON TABLE public.diagnosis_strategy_evaluations FROM anon, authenticated;

COMMENT ON TABLE public.diagnosis_strategy_evaluations IS
  'V2-HARNESS-SAFETY-AND-STRATEGY-DEDUP-01: diagnosis -> V2 evaluation it used. Reuse = '
  'diagnosis_id <> evaluation.origin_diagnosis_id. Backend only.';

-- ---------------------------------------------------------------------------
-- Record (or reuse) the evaluation for a diagnosis. Concurrency: the scope UNIQUE constraint +
-- INSERT .. ON CONFLICT DO NOTHING decides the single winner; never SELECT-then-INSERT.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miplan_record_financial_strategy_evaluation(
  p_secret text,
  p_diagnosis_id uuid,
  p_journey_id uuid,
  p_anonymous_id text,
  p_identity_version text,
  p_identity text,
  p_survey_version smallint,
  p_classifier_version text,
  p_contract text,
  p_threshold_version text,
  p_classification_status text,
  p_strategy text,
  p_result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
DECLARE
  expected text;
  diag_found boolean;
  diag_journey uuid;
  diag_owner text;
  journey_owner text;
  raw_version jsonb;
  journey_version smallint;
  was_created boolean := false;
  was_linked boolean := false;
  linked_to uuid;
  ev public.financial_strategy_evaluations%ROWTYPE;
BEGIN
  SELECT s.secret INTO expected
  FROM miplan_private.backend_secrets s
  WHERE s.name = 'b2_persist';

  IF expected IS NULL OR p_secret IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'MIPLAN_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_diagnosis_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_DIAGNOSIS_ID' USING ERRCODE = '22023';
  END IF;

  IF p_journey_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_JOURNEY_ID' USING ERRCODE = '22023';
  END IF;

  IF p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN
    RAISE EXCEPTION 'INVALID_ANONYMOUS_ID' USING ERRCODE = '22023';
  END IF;

  IF p_identity_version IS NULL OR p_identity_version !~ '^financial_input_identity_v[1-9][0-9]*$'
     OR p_identity IS NULL OR p_identity !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_FINANCIAL_INPUT_IDENTITY' USING ERRCODE = '22023';
  END IF;

  IF p_classifier_version IS NULL OR btrim(p_classifier_version) = '' THEN
    RAISE EXCEPTION 'INVALID_CLASSIFIER_VERSION' USING ERRCODE = '22023';
  END IF;

  IF p_result IS NULL OR jsonb_typeof(p_result) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_STRATEGY_RESULT' USING ERRCODE = '22023';
  END IF;

  SELECT true, d.journey_id, d.anonymous_id INTO diag_found, diag_journey, diag_owner
  FROM public.diagnoses d
  WHERE d.diagnosis_id = p_diagnosis_id;

  IF diag_found IS NULL THEN
    RAISE EXCEPTION 'DIAGNOSIS_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF diag_journey IS DISTINCT FROM p_journey_id THEN
    RAISE EXCEPTION 'JOURNEY_DIAGNOSIS_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF diag_owner IS DISTINCT FROM p_anonymous_id THEN
    RAISE EXCEPTION 'DIAGNOSIS_OWNERSHIP_MISMATCH' USING ERRCODE = '42501';
  END IF;

  SELECT j.anonymous_id, j.bootstrap_context -> 'survey' -> 'source_survey_version'
    INTO journey_owner, raw_version
  FROM public.journeys j
  WHERE j.journey_id = p_journey_id;

  IF journey_owner IS NULL THEN
    RAISE EXCEPTION 'JOURNEY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF journey_owner IS DISTINCT FROM p_anonymous_id THEN
    RAISE EXCEPTION 'JOURNEY_OWNERSHIP_MISMATCH' USING ERRCODE = '42501';
  END IF;

  -- Same strict rule as miplan_get_journey_survey_version.
  IF raw_version IS NOT NULL AND jsonb_typeof(raw_version) = 'number' AND raw_version::text IN ('1', '2') THEN
    journey_version := raw_version::text::smallint;
  END IF;

  IF journey_version IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'SURVEY_VERSION_NOT_V2' USING ERRCODE = '55000';
  END IF;

  IF p_survey_version IS DISTINCT FROM journey_version THEN
    RAISE EXCEPTION 'SURVEY_VERSION_MISMATCH' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.financial_strategy_evaluations (
    journey_id,
    anonymous_id,
    financial_input_identity_version,
    financial_input_identity,
    classifier_version,
    contract,
    threshold_version,
    survey_version,
    classification_status,
    strategy,
    result,
    origin_diagnosis_id,
    computed_at
  ) VALUES (
    p_journey_id,
    p_anonymous_id,
    p_identity_version,
    p_identity,
    p_classifier_version,
    p_contract,
    p_threshold_version,
    journey_version,
    p_classification_status,
    p_strategy,
    p_result,
    p_diagnosis_id,
    now()
  )
  ON CONFLICT ON CONSTRAINT financial_strategy_evaluations_scope_key DO NOTHING
  RETURNING * INTO ev;

  IF FOUND THEN
    was_created := true;
  ELSE
    SELECT * INTO ev
    FROM public.financial_strategy_evaluations e
    WHERE e.journey_id = p_journey_id
      AND e.financial_input_identity_version = p_identity_version
      AND e.financial_input_identity = p_identity
      AND e.classifier_version = p_classifier_version;

    IF NOT FOUND THEN
      -- Only reachable under an isolation level that hides the committed winner; retryable.
      RAISE EXCEPTION 'STRATEGY_EVALUATION_RACE' USING ERRCODE = '40001';
    END IF;

    -- Same scope key must mean the same deterministic classification; never hand out a stale one.
    -- Compared: everything except the provenance.income echo (kept per link), whose
    -- prefill_unconfirmed flag is part of the identity and is compared too.
    IF ev.contract IS DISTINCT FROM p_contract
       OR ev.threshold_version IS DISTINCT FROM p_threshold_version
       OR ev.classification_status IS DISTINCT FROM p_classification_status
       OR ev.strategy IS DISTINCT FROM p_strategy
       OR (ev.result #- '{provenance,income}') IS DISTINCT FROM (p_result #- '{provenance,income}')
       OR (ev.result #> '{provenance,income,prefill_unconfirmed}')
          IS DISTINCT FROM (p_result #> '{provenance,income,prefill_unconfirmed}') THEN
      RAISE EXCEPTION 'STRATEGY_EVALUATION_MISMATCH' USING ERRCODE = '22000';
    END IF;
  END IF;

  INSERT INTO public.diagnosis_strategy_evaluations (diagnosis_id, evaluation_id, income_provenance, linked_at)
  VALUES (p_diagnosis_id, ev.evaluation_id, p_result #> '{provenance,income}', now())
  ON CONFLICT (diagnosis_id) DO NOTHING;

  IF FOUND THEN
    was_linked := true;
  ELSE
    SELECT l.evaluation_id INTO linked_to
    FROM public.diagnosis_strategy_evaluations l
    WHERE l.diagnosis_id = p_diagnosis_id;

    IF linked_to IS DISTINCT FROM ev.evaluation_id THEN
      RAISE EXCEPTION 'DIAGNOSIS_ALREADY_LINKED' USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'evaluation_id', ev.evaluation_id,
    'diagnosis_id', p_diagnosis_id,
    'origin_diagnosis_id', ev.origin_diagnosis_id,
    'created', was_created,
    'linked', was_linked,
    'reused', ev.origin_diagnosis_id IS DISTINCT FROM p_diagnosis_id,
    'financial_input_identity_version', ev.financial_input_identity_version,
    'financial_input_identity', ev.financial_input_identity,
    'classifier_version', ev.classifier_version,
    'contract', ev.contract,
    'threshold_version', ev.threshold_version,
    'survey_version', ev.survey_version,
    'classification_status', ev.classification_status,
    'strategy', ev.strategy,
    'result', ev.result,
    'computed_at', ev.computed_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_record_financial_strategy_evaluation(
  text, uuid, uuid, text, text, text, smallint, text, text, text, text, text, jsonb
) FROM PUBLIC;
-- Same grant model as every miplan_* RPC: the backend calls with the anon key; the b2_persist
-- secret is the authorization. The tables above stay closed to anon/authenticated.
GRANT EXECUTE ON FUNCTION public.miplan_record_financial_strategy_evaluation(
  text, uuid, uuid, text, text, text, smallint, text, text, text, text, text, jsonb
) TO anon, authenticated, service_role;
