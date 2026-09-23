-- B2 diagnosis persistence (applied via Supabase MCP on project hvrrywlddxpywuvqclyq)
-- Migration name: b2_diagnosis_persistence
-- Version: 20260923190151
-- APPEND-ONLY diagnoses. No Auth. No destructive ops.

CREATE TABLE public.identities_anonymous (
  anonymous_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  linked_user_id uuid NULL
);

CREATE TABLE public.diagnoses (
  diagnosis_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id text NOT NULL REFERENCES public.identities_anonymous (anonymous_id),
  tenant_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  now_ms bigint NOT NULL,
  engine_version text NOT NULL,
  input_snapshot jsonb NOT NULL,
  engine_result jsonb NOT NULL,
  completeness jsonb NOT NULL
);

CREATE INDEX diagnoses_anonymous_id_created_at_idx
  ON public.diagnoses (anonymous_id, created_at DESC);

CREATE INDEX diagnoses_tenant_id_created_at_idx
  ON public.diagnoses (tenant_id, created_at DESC);

ALTER TABLE public.identities_anonymous ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: Data API blocked for public roles.
-- Backend connects with a privileged server credential (ENV), never exposed to the browser.
