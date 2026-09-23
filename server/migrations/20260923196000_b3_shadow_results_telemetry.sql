-- B3-SHADOW-METRICS-01 — shadow comparison telemetry (mirror of MCP migration)
-- Telemetry only; does not alter diagnoses append-only rows.

CREATE TABLE IF NOT EXISTS public.shadow_results (
  diagnosis_id uuid PRIMARY KEY REFERENCES public.diagnoses(diagnosis_id),
  shadow_status text NOT NULL,
  diff_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_technical boolean NOT NULL DEFAULT false,
  compared_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shadow_results_status_check
    CHECK (shadow_status IN ('MATCH', 'MISMATCH', 'SHADOW_ERROR')),
  CONSTRAINT shadow_results_diff_fields_is_array
    CHECK (jsonb_typeof(diff_fields) = 'array')
);

ALTER TABLE public.shadow_results ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.miplan_upsert_shadow_result(
  p_secret text,
  p_diagnosis_id uuid,
  p_shadow_status text,
  p_diff_fields jsonb DEFAULT '[]'::jsonb,
  p_is_technical boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
DECLARE
  expected text;
  exists_diag boolean;
  was_inserted boolean := false;
  row_out public.shadow_results%ROWTYPE;
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

  IF p_shadow_status IS NULL OR p_shadow_status NOT IN ('MATCH', 'MISMATCH', 'SHADOW_ERROR') THEN
    RAISE EXCEPTION 'INVALID_SHADOW_STATUS' USING ERRCODE = '22023';
  END IF;

  IF p_diff_fields IS NULL OR jsonb_typeof(p_diff_fields) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_DIFF_FIELDS' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_diff_fields) > 40 THEN
    RAISE EXCEPTION 'DIFF_FIELDS_TOO_LARGE' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.diagnoses d WHERE d.diagnosis_id = p_diagnosis_id
  ) INTO exists_diag;

  IF NOT exists_diag THEN
    RAISE EXCEPTION 'DIAGNOSIS_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.shadow_results (
    diagnosis_id,
    shadow_status,
    diff_fields,
    is_technical,
    compared_at,
    updated_at
  ) VALUES (
    p_diagnosis_id,
    p_shadow_status,
    COALESCE(p_diff_fields, '[]'::jsonb),
    COALESCE(p_is_technical, false),
    now(),
    now()
  )
  ON CONFLICT (diagnosis_id) DO NOTHING
  RETURNING * INTO row_out;

  IF FOUND THEN
    was_inserted := true;
  ELSE
    SELECT * INTO row_out
    FROM public.shadow_results
    WHERE diagnosis_id = p_diagnosis_id;
  END IF;

  RETURN jsonb_build_object(
    'diagnosis_id', row_out.diagnosis_id,
    'shadow_status', row_out.shadow_status,
    'diff_fields', row_out.diff_fields,
    'is_technical', row_out.is_technical,
    'compared_at', row_out.compared_at,
    'inserted', was_inserted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_upsert_shadow_result(text, uuid, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_upsert_shadow_result(text, uuid, text, jsonb, boolean) TO anon, authenticated, service_role;
