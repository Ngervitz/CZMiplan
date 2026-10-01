-- DATA-01 — Structured financial captures (append-only per diagnosis)
-- Applied via MCP as data_01_structured_financial_captures
-- Extends miplan_persist_diagnosis atomically (same transaction).
-- Does NOT store CI/email as identity. Ownership = anonymous_id.
-- input_snapshot on diagnoses remains the immutable engine evidence.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.financial_captures (
  diagnosis_id uuid PRIMARY KEY REFERENCES public.diagnoses(diagnosis_id),
  anonymous_id text NOT NULL REFERENCES public.identities_anonymous(anonymous_id),
  tenant_id text NOT NULL,
  ingreso numeric,
  declared_ingreso numeric,
  laboral text,
  declared_laboral text,
  declared_nombre text,
  declared_email text,
  no_debts_declared boolean NOT NULL DEFAULT false,
  tiene_encuesta boolean NOT NULL DEFAULT false,
  user_intent text,
  respuestas jsonb NOT NULL DEFAULT '{}'::jsonb,
  entry_context jsonb,
  snap_fecha_inicio timestamptz,
  source text NOT NULL DEFAULT 'engine_input',
  source_reference text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_captures_source_check
    CHECK (source IN ('engine_input', 'user_declared', 'url_prefill', 'seo_survey', 'imported'))
);

CREATE INDEX IF NOT EXISTS financial_captures_anonymous_idx
  ON public.financial_captures (anonymous_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS public.expense_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id uuid NOT NULL REFERENCES public.diagnoses(diagnosis_id),
  anonymous_id text NOT NULL REFERENCES public.identities_anonymous(anonymous_id),
  kind text NOT NULL,
  category_key text NOT NULL,
  label text,
  amount numeric NOT NULL DEFAULT 0,
  included boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'engine_input',
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_captures_kind_check
    CHECK (kind IN ('category', 'custom')),
  CONSTRAINT expense_captures_source_check
    CHECK (source IN ('engine_input', 'user_declared', 'url_prefill', 'seo_survey', 'imported'))
);

CREATE INDEX IF NOT EXISTS expense_captures_diagnosis_idx
  ON public.expense_captures (diagnosis_id);

CREATE INDEX IF NOT EXISTS expense_captures_anonymous_idx
  ON public.expense_captures (anonymous_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS public.debt_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id uuid NOT NULL REFERENCES public.diagnoses(diagnosis_id),
  anonymous_id text NOT NULL REFERENCES public.identities_anonymous(anonymous_id),
  client_debt_id text,
  tipo text,
  acreedor_raw text,
  acreedor_key text,
  acreedor_normalizado text,
  acreedor_display text,
  monto numeric,
  pago numeric,
  situacion_ui text,
  estado text,
  pago_fuente text,
  cancelada boolean NOT NULL DEFAULT false,
  debt_confidence text,
  atraso_tiempo text,
  atraso_tiempo_aprox text,
  ultimo_pago_declarado numeric,
  interes_mensual_estimado numeric,
  capital_estimado numeric,
  source text NOT NULL DEFAULT 'engine_input',
  source_reference text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debt_captures_source_check
    CHECK (source IN ('engine_input', 'user_declared', 'url_prefill', 'seo_survey', 'imported'))
);

CREATE INDEX IF NOT EXISTS debt_captures_diagnosis_idx
  ON public.debt_captures (diagnosis_id);

CREATE INDEX IF NOT EXISTS debt_captures_anonymous_client_idx
  ON public.debt_captures (anonymous_id, client_debt_id, captured_at DESC);

ALTER TABLE public.financial_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_captures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.financial_captures FROM PUBLIC;
REVOKE ALL ON TABLE public.expense_captures FROM PUBLIC;
REVOKE ALL ON TABLE public.debt_captures FROM PUBLIC;
REVOKE ALL ON TABLE public.financial_captures FROM anon, authenticated;
REVOKE ALL ON TABLE public.expense_captures FROM anon, authenticated;
REVOKE ALL ON TABLE public.debt_captures FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helper: extract structured rows from input_snapshot (server authority)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miplan_insert_financial_captures_from_snapshot(
  p_diagnosis_id uuid,
  p_anonymous_id text,
  p_tenant_id text,
  p_input_snapshot jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
DECLARE
  snap jsonb := COALESCE(p_input_snapshot, '{}'::jsonb);
  gastos jsonb;
  custom jsonb;
  deudas jsonb;
  g_rec record;
  g_key text;
  g_val numeric;
  elem jsonb;
  entry_ctx jsonb;
BEGIN
  IF p_diagnosis_id IS NULL OR p_anonymous_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_CAPTURE_ARGS' USING ERRCODE = '22023';
  END IF;

  -- entry_context may be object or legacy string
  IF jsonb_typeof(snap->'entry_context') = 'object' THEN
    entry_ctx := snap->'entry_context';
  ELSIF snap ? 'entry_context' THEN
    entry_ctx := jsonb_build_object('raw', snap->'entry_context');
  ELSE
    entry_ctx := NULL;
  END IF;

  INSERT INTO public.financial_captures (
    diagnosis_id,
    anonymous_id,
    tenant_id,
    ingreso,
    declared_ingreso,
    laboral,
    declared_laboral,
    declared_nombre,
    declared_email,
    no_debts_declared,
    tiene_encuesta,
    user_intent,
    respuestas,
    entry_context,
    snap_fecha_inicio,
    source,
    source_reference,
    captured_at
  ) VALUES (
    p_diagnosis_id,
    p_anonymous_id,
    p_tenant_id,
    NULLIF(snap->>'ingreso', '')::numeric,
    NULLIF(snap->>'declared_ingreso', '')::numeric,
    NULLIF(snap->>'laboral', ''),
    NULLIF(snap->>'declared_laboral', ''),
    NULLIF(snap->>'declared_nombre', ''),
    NULLIF(snap->>'declared_email', ''),
    COALESCE((snap->>'no_debts_declared')::boolean, false),
    COALESCE((snap->>'tiene_encuesta')::boolean, false),
    NULLIF(snap->>'user_intent', ''),
    COALESCE(snap->'respuestas', '{}'::jsonb),
    entry_ctx,
    CASE
      WHEN snap ? 'snap' AND NULLIF(snap->'snap'->>'fecha_inicio', '') IS NOT NULL
        THEN (snap->'snap'->>'fecha_inicio')::timestamptz
      ELSE NULL
    END,
    'engine_input',
    CASE
      WHEN entry_ctx IS NOT NULL THEN left(COALESCE(entry_ctx->>'entry_source', entry_ctx->>'entryContext', ''), 64)
      ELSE NULL
    END,
    now()
  )
  ON CONFLICT (diagnosis_id) DO NOTHING;

  -- Category expenses (gastos map)
  gastos := COALESCE(snap->'gastos', '{}'::jsonb);
  IF jsonb_typeof(gastos) = 'object' THEN
    FOR g_rec IN SELECT key, value FROM jsonb_each(gastos)
    LOOP
      g_key := g_rec.key;
      IF g_key IS NULL OR g_key = '' THEN
        CONTINUE;
      END IF;
      BEGIN
        g_val := CASE jsonb_typeof(g_rec.value)
          WHEN 'number' THEN (g_rec.value #>> '{}')::numeric
          WHEN 'string' THEN NULLIF(g_rec.value #>> '{}', '')::numeric
          ELSE NULL
        END;
      EXCEPTION WHEN others THEN
        g_val := 0;
      END;
      INSERT INTO public.expense_captures (
        diagnosis_id, anonymous_id, kind, category_key, label, amount, included, source, captured_at
      ) VALUES (
        p_diagnosis_id,
        p_anonymous_id,
        'category',
        left(g_key, 64),
        left(g_key, 128),
        COALESCE(g_val, 0),
        true,
        'engine_input',
        now()
      );
    END LOOP;
  END IF;

  -- Custom expenses
  custom := COALESCE(snap->'custom_expenses', '[]'::jsonb);
  IF jsonb_typeof(custom) = 'array' THEN
    FOR elem IN SELECT value FROM jsonb_array_elements(custom) AS t(value)
    LOOP
      INSERT INTO public.expense_captures (
        diagnosis_id, anonymous_id, kind, category_key, label, amount, included, source, captured_at
      ) VALUES (
        p_diagnosis_id,
        p_anonymous_id,
        'custom',
        left(COALESCE(elem->>'id', elem->>'label', 'custom'), 64),
        left(COALESCE(elem->>'label', elem->>'id', 'custom'), 128),
        COALESCE(NULLIF(elem->>'amount', '')::numeric, NULLIF(elem->>'monto', '')::numeric, 0),
        COALESCE((elem->>'included')::boolean, true),
        'engine_input',
        now()
      );
    END LOOP;
  END IF;

  -- Debts (creditor fields denormalized; client_debt_id = deudas[].id)
  deudas := COALESCE(snap->'deudas', '[]'::jsonb);
  IF jsonb_typeof(deudas) = 'array' THEN
    FOR elem IN SELECT value FROM jsonb_array_elements(deudas) AS t(value)
    LOOP
      INSERT INTO public.debt_captures (
        diagnosis_id,
        anonymous_id,
        client_debt_id,
        tipo,
        acreedor_raw,
        acreedor_key,
        acreedor_normalizado,
        acreedor_display,
        monto,
        pago,
        situacion_ui,
        estado,
        pago_fuente,
        cancelada,
        debt_confidence,
        atraso_tiempo,
        atraso_tiempo_aprox,
        ultimo_pago_declarado,
        interes_mensual_estimado,
        capital_estimado,
        source,
        source_reference,
        captured_at
      ) VALUES (
        p_diagnosis_id,
        p_anonymous_id,
        NULLIF(left(COALESCE(elem->>'id', ''), 128), ''),
        NULLIF(left(COALESCE(elem->>'tipo', ''), 64), ''),
        NULLIF(left(COALESCE(elem->>'acreedor_raw', elem->>'acreedor', ''), 256), ''),
        NULLIF(left(COALESCE(elem->>'acreedor_key', ''), 128), ''),
        NULLIF(left(COALESCE(elem->>'acreedor_normalizado', ''), 128), ''),
        NULLIF(left(COALESCE(elem->>'acreedor_display', elem->>'acreedor', ''), 256), ''),
        NULLIF(elem->>'monto', '')::numeric,
        NULLIF(elem->>'pago', '')::numeric,
        NULLIF(left(COALESCE(elem->>'situacion_ui', ''), 64), ''),
        NULLIF(left(COALESCE(elem->>'estado', ''), 64), ''),
        NULLIF(left(COALESCE(elem->>'pago_fuente', ''), 64), ''),
        COALESCE((elem->>'cancelada')::boolean, false),
        NULLIF(left(COALESCE(elem->>'debt_confidence', ''), 32), ''),
        NULLIF(left(COALESCE(elem->>'atraso_tiempo', ''), 64), ''),
        NULLIF(left(COALESCE(elem->>'atraso_tiempo_aprox', ''), 64), ''),
        NULLIF(elem->>'ultimo_pago_declarado', '')::numeric,
        NULLIF(elem->>'interes_mensual_estimado', '')::numeric,
        NULLIF(elem->>'capital_estimado', '')::numeric,
        'engine_input',
        NULL,
        now()
      );
    END LOOP;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_insert_financial_captures_from_snapshot(uuid, text, text, jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Replace persist RPC: diagnosis + structured captures in ONE transaction
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miplan_persist_diagnosis(
  p_secret text,
  p_anonymous_id text,
  p_tenant_id text,
  p_now_ms bigint,
  p_engine_version text,
  p_input_snapshot jsonb,
  p_engine_result jsonb,
  p_completeness jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
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

  -- Structured financial capture (same transaction; rolls back with diagnosis on error)
  PERFORM public.miplan_insert_financial_captures_from_snapshot(
    new_id,
    p_anonymous_id,
    p_tenant_id,
    p_input_snapshot
  );

  RETURN new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_persist_diagnosis(text, text, text, bigint, text, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_persist_diagnosis(text, text, text, bigint, text, jsonb, jsonb, jsonb) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Secret-gated read for tests / ops (not public client API)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miplan_get_financial_capture(
  p_secret text,
  p_diagnosis_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
DECLARE
  expected text;
  out jsonb;
BEGIN
  SELECT s.secret INTO expected FROM miplan_private.backend_secrets s WHERE s.name = 'b2_persist';
  IF expected IS NULL OR p_secret IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'MIPLAN_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'financial', to_jsonb(fc),
    'expenses', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.kind, e.category_key) FROM public.expense_captures e WHERE e.diagnosis_id = p_diagnosis_id), '[]'::jsonb),
    'debts', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.client_debt_id) FROM public.debt_captures d WHERE d.diagnosis_id = p_diagnosis_id), '[]'::jsonb)
  ) INTO out
  FROM public.financial_captures fc
  WHERE fc.diagnosis_id = p_diagnosis_id;

  RETURN out;
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_get_financial_capture(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miplan_get_financial_capture(text, uuid) TO anon, authenticated, service_role;
