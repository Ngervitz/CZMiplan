-- MIPLAN-HANDOFF-CONSENT-01 — Mi Plan T&C / Privacy accepted on the Credizona thank-you page.
-- Apply manually in Supabase CZMiplan. Idempotent. Additive only. Do NOT apply from this task.
--
-- The Credizona CTA "Crear mi plan gratis" records a pending acceptance keyed by the same
-- bootstrap_key as journeys (handoff:<sha256(code)>; raw code never stored). The first successful
-- Mi Plan redeem of that code binds it to the journey it creates/returns. Versions are validated
-- by the Mi Plan backend (authority); accepted_at is always the database clock.

BEGIN;

CREATE TABLE IF NOT EXISTS public.handoff_consents (
  bootstrap_key text PRIMARY KEY,
  tc_version text NOT NULL,
  privacy_version text NOT NULL,
  consent_source text NOT NULL DEFAULT 'credizona_gracias',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  journey_id uuid NULL REFERENCES public.journeys (journey_id),
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT handoff_consents_bootstrap_key_check CHECK (bootstrap_key LIKE 'handoff:%'),
  CONSTRAINT handoff_consents_source_check CHECK (consent_source IN ('credizona_gracias')),
  CONSTRAINT handoff_consents_bound_check CHECK ((journey_id IS NULL) = (consumed_at IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS handoff_consents_journey_id_unique
  ON public.handoff_consents (journey_id)
  WHERE journey_id IS NOT NULL;

COMMENT ON TABLE public.handoff_consents IS
  'MIPLAN-HANDOFF-CONSENT-01: Mi Plan T&C/Privacy accepted by explicit click on the Credizona thank-you page.';

COMMENT ON COLUMN public.handoff_consents.bootstrap_key IS
  'handoff:<sha256(raw_code)> — same key as journeys.bootstrap_key. Never the raw handoff_code.';

ALTER TABLE public.handoff_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.handoff_consents FROM PUBLIC;
REVOKE ALL ON TABLE public.handoff_consents FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Record (Credizona click). Refused once a journey exists for the key: consent
-- must precede the redeem, so a consumed code can never gain a late acceptance.
-- A live pending row keeps its original accepted_at (double click / retry).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miplan_record_handoff_consent(
  p_secret text,
  p_bootstrap_key text,
  p_tc_version text,
  p_privacy_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
DECLARE
  expected text;
  row_out public.handoff_consents%ROWTYPE;
BEGIN
  SELECT s.secret INTO expected
  FROM miplan_private.backend_secrets s
  WHERE s.name = 'b2_persist';

  IF expected IS NULL OR p_secret IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'MIPLAN_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_bootstrap_key IS NULL OR length(p_bootstrap_key) < 16 OR length(p_bootstrap_key) > 200
     OR p_bootstrap_key NOT LIKE 'handoff:%' THEN
    RAISE EXCEPTION 'INVALID_BOOTSTRAP_KEY' USING ERRCODE = '22023';
  END IF;

  IF p_tc_version IS NULL OR length(p_tc_version) < 1 OR length(p_tc_version) > 64
     OR p_privacy_version IS NULL OR length(p_privacy_version) < 1 OR length(p_privacy_version) > 64 THEN
    RAISE EXCEPTION 'INVALID_CONSENT_VERSION' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.journeys j WHERE j.bootstrap_key = p_bootstrap_key) THEN
    RAISE EXCEPTION 'HANDOFF_ALREADY_REDEEMED' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.handoff_consents AS c (
    bootstrap_key, tc_version, privacy_version, accepted_at, expires_at
  ) VALUES (
    p_bootstrap_key, p_tc_version, p_privacy_version, now(), now() + interval '15 minutes'
  )
  ON CONFLICT (bootstrap_key) DO UPDATE
    SET tc_version = EXCLUDED.tc_version,
        privacy_version = EXCLUDED.privacy_version,
        accepted_at = now(),
        expires_at = now() + interval '15 minutes',
        updated_at = now()
    WHERE c.consumed_at IS NULL AND c.expires_at <= now();

  SELECT * INTO row_out FROM public.handoff_consents c WHERE c.bootstrap_key = p_bootstrap_key;

  IF row_out.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'HANDOFF_ALREADY_REDEEMED' USING ERRCODE = '55000';
  END IF;

  RETURN jsonb_build_object('recorded', true, 'accepted_at', row_out.accepted_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_record_handoff_consent(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_record_handoff_consent(text, text, text, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Bind + read. Called by the backend only after it resolved the journey for its
-- owner. Binds a live pending row to that journey (once); returns the consent
-- bound to that exact journey, or NULL.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miplan_attach_handoff_consent(
  p_secret text,
  p_bootstrap_key text,
  p_journey_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
DECLARE
  expected text;
  journey_key text;
  c public.handoff_consents%ROWTYPE;
BEGIN
  SELECT s.secret INTO expected
  FROM miplan_private.backend_secrets s
  WHERE s.name = 'b2_persist';

  IF expected IS NULL OR p_secret IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'MIPLAN_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_bootstrap_key IS NULL OR p_journey_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT j.bootstrap_key INTO journey_key
  FROM public.journeys j
  WHERE j.journey_id = p_journey_id;

  IF journey_key IS NULL OR journey_key IS DISTINCT FROM p_bootstrap_key THEN
    RETURN NULL;
  END IF;

  UPDATE public.handoff_consents h
  SET journey_id = p_journey_id,
      consumed_at = now(),
      updated_at = now()
  WHERE h.bootstrap_key = p_bootstrap_key
    AND h.consumed_at IS NULL
    AND h.expires_at > now();

  SELECT * INTO c
  FROM public.handoff_consents h
  WHERE h.bootstrap_key = p_bootstrap_key
    AND h.journey_id = p_journey_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'tc_version', c.tc_version,
    'privacy_version', c.privacy_version,
    'consent_source', c.consent_source,
    'accepted_at', c.accepted_at,
    'journey_id', c.journey_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_attach_handoff_consent(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_attach_handoff_consent(text, text, uuid)
  TO anon, authenticated, service_role;

COMMIT;
