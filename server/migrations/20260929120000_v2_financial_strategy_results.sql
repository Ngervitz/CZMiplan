-- V2-NEW-STRATEGY-INTEGRATION-01 — journey survey version lookup + V2 strategy results.
-- WRITTEN, NOT APPLIED. Apply only by explicit decision.
-- Additive only: no change to diagnoses, journeys or existing RPCs. No backfill;
-- historical diagnoses are never reclassified.

-- ---------------------------------------------------------------------------
-- Survey version of an owned journey (returns only 1, 2 or NULL; no context)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miplan_get_journey_survey_version(
  p_secret text,
  p_journey_id uuid,
  p_anonymous_id text
)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
DECLARE
  expected text;
  owner text;
  ctx jsonb;
  v jsonb;
BEGIN
  SELECT s.secret INTO expected
  FROM miplan_private.backend_secrets s
  WHERE s.name = 'b2_persist';

  IF expected IS NULL OR p_secret IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'MIPLAN_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_journey_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_JOURNEY_ID' USING ERRCODE = '22023';
  END IF;

  SELECT j.anonymous_id, j.bootstrap_context INTO owner, ctx
  FROM public.journeys j
  WHERE j.journey_id = p_journey_id;

  IF owner IS NULL THEN
    RAISE EXCEPTION 'JOURNEY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF owner IS DISTINCT FROM p_anonymous_id THEN
    RAISE EXCEPTION 'JOURNEY_OWNERSHIP_MISMATCH' USING ERRCODE = '42501';
  END IF;

  -- Strict: only an integer JSON number 1 or 2 counts. Withheld/rejected/absent
  -- surveys have no bootstrap_context.survey and return NULL.
  v := ctx -> 'survey' -> 'source_survey_version';
  IF v IS NOT NULL AND jsonb_typeof(v) = 'number' AND v::text IN ('1', '2') THEN
    RETURN v::text::smallint;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_get_journey_survey_version(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_get_journey_survey_version(text, uuid, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- financial_strategy_results: new classifier output for V2 journeys only.
-- Not business authority for the legacy plan; one row per diagnosis.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.financial_strategy_results (
  diagnosis_id uuid PRIMARY KEY REFERENCES public.diagnoses (diagnosis_id),
  journey_id uuid NOT NULL REFERENCES public.journeys (journey_id),
  survey_version smallint NOT NULL,
  classifier_version text NOT NULL,
  contract text NOT NULL,
  threshold_version text NOT NULL,
  classification_status text NOT NULL,
  strategy text NULL,
  result jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_strategy_results_survey_version_check
    CHECK (survey_version = 2),
  CONSTRAINT financial_strategy_results_status_check
    CHECK (classification_status IN ('classified', 'incomplete')),
  CONSTRAINT financial_strategy_results_strategy_check
    CHECK (strategy IS NULL OR strategy IN (
      'CONTENCION',
      'REGULARIZACION',
      'REDUCCION_CARGA',
      'CONSOLIDACION',
      'MANTENIMIENTO_OPTIMIZACION'
    )),
  CONSTRAINT financial_strategy_results_status_strategy_check
    CHECK ((classification_status = 'classified') = (strategy IS NOT NULL)),
  CONSTRAINT financial_strategy_results_result_is_object
    CHECK (jsonb_typeof(result) = 'object')
);

CREATE INDEX IF NOT EXISTS financial_strategy_results_journey_id_computed_at_idx
  ON public.financial_strategy_results (journey_id, computed_at DESC);

ALTER TABLE public.financial_strategy_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.financial_strategy_results FROM PUBLIC;
REVOKE ALL ON TABLE public.financial_strategy_results FROM anon, authenticated;

COMMENT ON TABLE public.financial_strategy_results IS
  'V2-NEW-STRATEGY-INTEGRATION-01: classifyFinancialShadow output for survey V2 journeys. '
  'Compute-only (not shown in UI). Not mapped to any legacy plan.';

CREATE OR REPLACE FUNCTION public.miplan_insert_financial_strategy_result(
  p_secret text,
  p_diagnosis_id uuid,
  p_journey_id uuid,
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
  diag_journey uuid;
  diag_found boolean;
  journey_found boolean;
  raw_version jsonb;
  journey_version smallint;
  was_inserted boolean := false;
  row_out public.financial_strategy_results%ROWTYPE;
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

  IF p_result IS NULL OR jsonb_typeof(p_result) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_STRATEGY_RESULT' USING ERRCODE = '22023';
  END IF;

  SELECT true, d.journey_id INTO diag_found, diag_journey
  FROM public.diagnoses d
  WHERE d.diagnosis_id = p_diagnosis_id;

  IF diag_found IS NULL THEN
    RAISE EXCEPTION 'DIAGNOSIS_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF diag_journey IS DISTINCT FROM p_journey_id THEN
    RAISE EXCEPTION 'JOURNEY_DIAGNOSIS_MISMATCH' USING ERRCODE = '22023';
  END IF;

  -- Authoritative survey version = the diagnosis' own journey bootstrap; p_survey_version
  -- is only checked against it. Same strict rule as miplan_get_journey_survey_version,
  -- inlined because that RPC re-validates the secret and requires an owner anonymous_id,
  -- which this RPC deliberately does not take.
  SELECT true, j.bootstrap_context -> 'survey' -> 'source_survey_version'
    INTO journey_found, raw_version
  FROM public.journeys j
  WHERE j.journey_id = diag_journey;

  IF journey_found IS NULL THEN
    RAISE EXCEPTION 'JOURNEY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF raw_version IS NOT NULL AND jsonb_typeof(raw_version) = 'number' AND raw_version::text IN ('1', '2') THEN
    journey_version := raw_version::text::smallint;
  END IF;

  IF journey_version IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'SURVEY_VERSION_NOT_V2' USING ERRCODE = '55000';
  END IF;

  IF p_survey_version IS DISTINCT FROM journey_version THEN
    RAISE EXCEPTION 'SURVEY_VERSION_MISMATCH' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.financial_strategy_results (
    diagnosis_id,
    journey_id,
    survey_version,
    classifier_version,
    contract,
    threshold_version,
    classification_status,
    strategy,
    result,
    computed_at
  ) VALUES (
    p_diagnosis_id,
    diag_journey,
    journey_version,
    p_classifier_version,
    p_contract,
    p_threshold_version,
    p_classification_status,
    p_strategy,
    p_result,
    now()
  )
  ON CONFLICT (diagnosis_id) DO NOTHING
  RETURNING * INTO row_out;

  IF FOUND THEN
    was_inserted := true;
  ELSE
    SELECT * INTO row_out
    FROM public.financial_strategy_results
    WHERE diagnosis_id = p_diagnosis_id;
  END IF;

  RETURN jsonb_build_object(
    'diagnosis_id', row_out.diagnosis_id,
    'classification_status', row_out.classification_status,
    'strategy', row_out.strategy,
    'computed_at', row_out.computed_at,
    'inserted', was_inserted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_insert_financial_strategy_result(
  text, uuid, uuid, smallint, text, text, text, text, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_insert_financial_strategy_result(
  text, uuid, uuid, smallint, text, text, text, text, text, jsonb
) TO anon, authenticated, service_role;
