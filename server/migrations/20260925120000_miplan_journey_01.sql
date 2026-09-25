-- MIPLAN-JOURNEY-01 — journeys + nullable diagnosis.journey_id
-- Apply manually in Supabase CZMiplan. Idempotent. Do NOT apply from this task.
-- Historical diagnoses remain valid with journey_id NULL.

BEGIN;

-- ---------------------------------------------------------------------------
-- journeys: one concrete flow instance per anonymous_id (1:N)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.journeys (
  journey_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id text NOT NULL REFERENCES public.identities_anonymous (anonymous_id),
  tenant_id text NOT NULL,
  entry_type text NOT NULL,
  funnel text NULL,
  commercial_originator text NULL,
  source_system text NULL,
  external_ref_type text NULL,
  external_ref text NULL,
  -- Idempotency for A3 handoff bootstrap. Hash only — never raw handoff_code.
  -- Prefix 'handoff:' so this is never usable as a bearer capability.
  bootstrap_key text NULL,
  bootstrap_context jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journeys_entry_type_check
    CHECK (entry_type IN ('janus_handoff', 'virgin_miplan', 'provider_referral')),
  CONSTRAINT journeys_bootstrap_key_unique UNIQUE (bootstrap_key)
);

CREATE INDEX IF NOT EXISTS journeys_anonymous_id_created_at_idx
  ON public.journeys (anonymous_id, created_at DESC);

CREATE INDEX IF NOT EXISTS journeys_external_ref_idx
  ON public.journeys (external_ref_type, external_ref)
  WHERE external_ref IS NOT NULL;

COMMENT ON TABLE public.journeys IS
  'MIPLAN-JOURNEY-01: concrete Mi Plan flow instance. anonymous_id 1:N journeys.';

COMMENT ON COLUMN public.journeys.bootstrap_key IS
  'handoff:<sha256(raw_code)>. Idempotency only — not a bearer credential.';

COMMENT ON COLUMN public.journeys.external_ref IS
  'Episode reference (e.g. LRW). Provenance only — never authorization.';

COMMENT ON COLUMN public.journeys.bootstrap_context IS
  'Allowlisted JANUS context for durable retry after one-time redeem. No raw handoff_code.';

ALTER TABLE public.journeys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journeys FROM PUBLIC;
REVOKE ALL ON TABLE public.journeys FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- diagnoses.journey_id nullable (historical rows stay NULL)
-- ---------------------------------------------------------------------------

ALTER TABLE public.diagnoses
  ADD COLUMN IF NOT EXISTS journey_id uuid NULL
    REFERENCES public.journeys (journey_id);

CREATE INDEX IF NOT EXISTS diagnoses_journey_id_created_at_idx
  ON public.diagnoses (journey_id, created_at DESC)
  WHERE journey_id IS NOT NULL;

COMMENT ON COLUMN public.diagnoses.journey_id IS
  'Optional FK to journeys. NULL for pre-JOURNEY-01 historical diagnoses.';

-- ---------------------------------------------------------------------------
-- Atomic resolve/create handoff journey by bootstrap_key
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miplan_resolve_handoff_journey(
  p_secret text,
  p_anonymous_id text,
  p_tenant_id text,
  p_bootstrap_key text,
  p_entry_type text,
  p_funnel text,
  p_commercial_originator text,
  p_source_system text,
  p_external_ref_type text,
  p_external_ref text,
  p_bootstrap_context jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
DECLARE
  expected text;
  existing public.journeys%ROWTYPE;
  new_id uuid;
  created boolean := false;
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

  IF p_bootstrap_key IS NULL OR length(p_bootstrap_key) < 16 OR length(p_bootstrap_key) > 200 THEN
    RAISE EXCEPTION 'INVALID_BOOTSTRAP_KEY' USING ERRCODE = '22023';
  END IF;

  IF p_bootstrap_key NOT LIKE 'handoff:%' THEN
    RAISE EXCEPTION 'INVALID_BOOTSTRAP_KEY' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.identities_anonymous (anonymous_id, tenant_id, created_at, last_seen_at)
  VALUES (p_anonymous_id, p_tenant_id, now(), now())
  ON CONFLICT (anonymous_id) DO UPDATE
    SET last_seen_at = now(),
        tenant_id = EXCLUDED.tenant_id;

  SELECT * INTO existing
  FROM public.journeys j
  WHERE j.bootstrap_key = p_bootstrap_key;

  IF FOUND THEN
    IF existing.anonymous_id IS DISTINCT FROM p_anonymous_id THEN
      RAISE EXCEPTION 'JOURNEY_OWNERSHIP_MISMATCH' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
      'journey_id', existing.journey_id,
      'created', false,
      'anonymous_id', existing.anonymous_id,
      'entry_type', existing.entry_type,
      'funnel', existing.funnel,
      'commercial_originator', existing.commercial_originator,
      'source_system', existing.source_system,
      'external_ref_type', existing.external_ref_type,
      'external_ref', existing.external_ref,
      'bootstrap_context', existing.bootstrap_context,
      'created_at', existing.created_at
    );
  END IF;

  -- Create path requires context (JANUS already validated).
  IF p_bootstrap_context IS NULL OR jsonb_typeof(p_bootstrap_context) <> 'object' THEN
    RETURN NULL;
  END IF;

  IF p_entry_type IS NULL OR p_entry_type <> 'janus_handoff' THEN
    RAISE EXCEPTION 'INVALID_ENTRY_TYPE' USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.journeys (
      anonymous_id,
      tenant_id,
      entry_type,
      funnel,
      commercial_originator,
      source_system,
      external_ref_type,
      external_ref,
      bootstrap_key,
      bootstrap_context
    ) VALUES (
      p_anonymous_id,
      p_tenant_id,
      p_entry_type,
      NULLIF(p_funnel, ''),
      NULLIF(p_commercial_originator, ''),
      NULLIF(p_source_system, ''),
      NULLIF(p_external_ref_type, ''),
      NULLIF(p_external_ref, ''),
      p_bootstrap_key,
      p_bootstrap_context
    )
    RETURNING journey_id INTO new_id;
    created := true;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT * INTO existing
      FROM public.journeys j
      WHERE j.bootstrap_key = p_bootstrap_key;
      IF NOT FOUND THEN
        RAISE;
      END IF;
      IF existing.anonymous_id IS DISTINCT FROM p_anonymous_id THEN
        RAISE EXCEPTION 'JOURNEY_OWNERSHIP_MISMATCH' USING ERRCODE = '42501';
      END IF;
      RETURN jsonb_build_object(
        'journey_id', existing.journey_id,
        'created', false,
        'anonymous_id', existing.anonymous_id,
        'entry_type', existing.entry_type,
        'funnel', existing.funnel,
        'commercial_originator', existing.commercial_originator,
        'source_system', existing.source_system,
        'external_ref_type', existing.external_ref_type,
        'external_ref', existing.external_ref,
        'bootstrap_context', existing.bootstrap_context,
        'created_at', existing.created_at
      );
  END;

  SELECT * INTO existing FROM public.journeys WHERE journey_id = new_id;

  RETURN jsonb_build_object(
    'journey_id', existing.journey_id,
    'created', created,
    'anonymous_id', existing.anonymous_id,
    'entry_type', existing.entry_type,
    'funnel', existing.funnel,
    'commercial_originator', existing.commercial_originator,
    'source_system', existing.source_system,
    'external_ref_type', existing.external_ref_type,
    'external_ref', existing.external_ref,
    'bootstrap_context', existing.bootstrap_context,
    'created_at', existing.created_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_resolve_handoff_journey(
  text, text, text, text, text, text, text, text, text, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_resolve_handoff_journey(
  text, text, text, text, text, text, text, text, text, text, jsonb
) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Ownership check (no PII returned)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miplan_assert_journey_owned(
  p_secret text,
  p_journey_id uuid,
  p_anonymous_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
DECLARE
  expected text;
  owner text;
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

  SELECT j.anonymous_id INTO owner
  FROM public.journeys j
  WHERE j.journey_id = p_journey_id;

  IF owner IS NULL THEN
    RAISE EXCEPTION 'JOURNEY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF owner IS DISTINCT FROM p_anonymous_id THEN
    RAISE EXCEPTION 'JOURNEY_OWNERSHIP_MISMATCH' USING ERRCODE = '42501';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_assert_journey_owned(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_assert_journey_owned(text, uuid, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Extend persist RPC with optional p_journey_id.
-- Drop 8-arg form first to avoid overload ambiguity with DEFAULT.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.miplan_persist_diagnosis(
  text, text, text, bigint, text, jsonb, jsonb, jsonb
);

CREATE OR REPLACE FUNCTION public.miplan_persist_diagnosis(
  p_secret text,
  p_anonymous_id text,
  p_tenant_id text,
  p_now_ms bigint,
  p_engine_version text,
  p_input_snapshot jsonb,
  p_engine_result jsonb,
  p_completeness jsonb,
  p_journey_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
DECLARE
  expected text;
  new_id uuid;
  journey_owner text;
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

  IF p_journey_id IS NOT NULL THEN
    SELECT j.anonymous_id INTO journey_owner
    FROM public.journeys j
    WHERE j.journey_id = p_journey_id;
    IF journey_owner IS NULL THEN
      RAISE EXCEPTION 'JOURNEY_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF journey_owner IS DISTINCT FROM p_anonymous_id THEN
      RAISE EXCEPTION 'JOURNEY_OWNERSHIP_MISMATCH' USING ERRCODE = '42501';
    END IF;
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
    completeness,
    journey_id
  ) VALUES (
    p_anonymous_id,
    p_tenant_id,
    p_now_ms,
    p_engine_version,
    p_input_snapshot,
    p_engine_result,
    p_completeness,
    p_journey_id
  )
  RETURNING diagnosis_id INTO new_id;

  PERFORM public.miplan_insert_financial_captures_from_snapshot(
    new_id,
    p_anonymous_id,
    p_tenant_id,
    p_input_snapshot
  );

  RETURN new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_persist_diagnosis(
  text, text, text, bigint, text, jsonb, jsonb, jsonb, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_persist_diagnosis(
  text, text, text, bigint, text, jsonb, jsonb, jsonb, uuid
) TO anon, authenticated, service_role;

COMMIT;
