-- B2 persist RPCs (applied via MCP as b2_diagnosis_persist_rpc)
-- SECURITY DEFINER functions gated by miplan_private.backend_secrets.
-- Secret value is NOT stored in this file — set via ENV MIPLAN_BACKEND_SECRET
-- and inserted into miplan_private.backend_secrets by operators / setup.

CREATE SCHEMA IF NOT EXISTS miplan_private;
REVOKE ALL ON SCHEMA miplan_private FROM PUBLIC;
REVOKE ALL ON SCHEMA miplan_private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS miplan_private.backend_secrets (
  name text PRIMARY KEY,
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE miplan_private.backend_secrets FROM PUBLIC;
REVOKE ALL ON TABLE miplan_private.backend_secrets FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.miplan_persist_diagnosis(
  p_secret text,
  p_anonymous_id text,
  p_tenant_id text,
  p_now_ms bigint,
  p_engine_version text,
  p_input_snapshot jsonb,
  p_engine_result jsonb,
  p_completeness jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, miplan_private
AS $$
DECLARE
  expected text;
  new_id uuid;
BEGIN
  SELECT s.secret INTO expected
  FROM miplan_private.backend_secrets s
  WHERE s.name = 'b2_persist';

  IF expected IS NULL OR p_secret IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'MIPLAN_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_anonymous_id IS NULL OR length(p_anonymous_id) < 8 OR length(p_anonymous_id) > 128 THEN
    RAISE EXCEPTION 'INVALID_ANONYMOUS_ID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.identities_anonymous (anonymous_id, tenant_id, created_at, last_seen_at)
  VALUES (p_anonymous_id, p_tenant_id, now(), now())
  ON CONFLICT (anonymous_id) DO UPDATE
    SET last_seen_at = now(),
        tenant_id = EXCLUDED.tenant_id;

  INSERT INTO public.diagnoses (
    anonymous_id,
    tenant_id,
    now_ms,
    engine_version,
    input_snapshot,
    engine_result,
    completeness
  ) VALUES (
    p_anonymous_id,
    p_tenant_id,
    p_now_ms,
    p_engine_version,
    p_input_snapshot,
    p_engine_result,
    p_completeness
  )
  RETURNING diagnosis_id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.miplan_persist_diagnosis(text, text, text, bigint, text, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_persist_diagnosis(text, text, text, bigint, text, jsonb, jsonb, jsonb) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.miplan_get_diagnosis(
  p_secret text,
  p_diagnosis_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, miplan_private
AS $$
DECLARE
  expected text;
  row_data jsonb;
BEGIN
  SELECT s.secret INTO expected
  FROM miplan_private.backend_secrets s
  WHERE s.name = 'b2_persist';

  IF expected IS NULL OR p_secret IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'MIPLAN_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(d) INTO row_data
  FROM public.diagnoses d
  WHERE d.diagnosis_id = p_diagnosis_id;

  RETURN row_data;
END;
$$;

REVOKE ALL ON FUNCTION public.miplan_get_diagnosis(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_get_diagnosis(text, uuid) TO anon, authenticated, service_role;
