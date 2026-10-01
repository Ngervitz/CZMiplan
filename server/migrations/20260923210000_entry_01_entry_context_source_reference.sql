-- ENTRY-01 — persist entry_source into financial_captures.source_reference
-- Project: CZMiplan (hvrrywlddxpywuvqclyq)
-- Non-destructive: replaces helper body only; no DROP tables.

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

  IF jsonb_typeof(snap->'entry_context') = 'object' THEN
    entry_ctx := snap->'entry_context';
  ELSIF snap ? 'entry_context' THEN
    entry_ctx := jsonb_build_object('raw', snap->'entry_context');
  ELSE
    entry_ctx := NULL;
  END IF;

  INSERT INTO public.financial_captures (
    diagnosis_id, anonymous_id, tenant_id,
    ingreso, declared_ingreso, laboral, declared_laboral,
    declared_nombre, declared_email,
    no_debts_declared, tiene_encuesta, user_intent, respuestas,
    entry_context, snap_fecha_inicio, source, source_reference, captured_at
  ) VALUES (
    p_diagnosis_id, p_anonymous_id, p_tenant_id,
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

  gastos := COALESCE(snap->'gastos', '{}'::jsonb);
  IF jsonb_typeof(gastos) = 'object' THEN
    FOR g_rec IN SELECT key, value FROM jsonb_each(gastos)
    LOOP
      g_key := g_rec.key;
      IF g_key IS NULL OR g_key = '' THEN CONTINUE; END IF;
      BEGIN
        g_val := CASE jsonb_typeof(g_rec.value)
          WHEN 'number' THEN (g_rec.value #>> '{}')::numeric
          WHEN 'string' THEN NULLIF(g_rec.value #>> '{}', '')::numeric
          ELSE NULL
        END;
      EXCEPTION WHEN others THEN g_val := 0;
      END;
      INSERT INTO public.expense_captures (
        diagnosis_id, anonymous_id, kind, category_key, label, amount, included, source, captured_at
      ) VALUES (
        p_diagnosis_id, p_anonymous_id, 'category', left(g_key, 64), left(g_key, 128),
        COALESCE(g_val, 0), true, 'engine_input', now()
      );
    END LOOP;
  END IF;

  custom := COALESCE(snap->'custom_expenses', '[]'::jsonb);
  IF jsonb_typeof(custom) = 'array' THEN
    FOR elem IN SELECT value FROM jsonb_array_elements(custom) AS t(value)
    LOOP
      INSERT INTO public.expense_captures (
        diagnosis_id, anonymous_id, kind, category_key, label, amount, included, source, captured_at
      ) VALUES (
        p_diagnosis_id, p_anonymous_id, 'custom',
        left(COALESCE(elem->>'id', elem->>'label', 'custom'), 64),
        left(COALESCE(elem->>'label', elem->>'id', 'custom'), 128),
        COALESCE(NULLIF(elem->>'amount', '')::numeric, NULLIF(elem->>'monto', '')::numeric, 0),
        COALESCE((elem->>'included')::boolean, true), 'engine_input', now()
      );
    END LOOP;
  END IF;

  deudas := COALESCE(snap->'deudas', '[]'::jsonb);
  IF jsonb_typeof(deudas) = 'array' THEN
    FOR elem IN SELECT value FROM jsonb_array_elements(deudas) AS t(value)
    LOOP
      INSERT INTO public.debt_captures (
        diagnosis_id, anonymous_id, client_debt_id, tipo,
        acreedor_raw, acreedor_key, acreedor_normalizado, acreedor_display,
        monto, pago, situacion_ui, estado, pago_fuente, cancelada, debt_confidence,
        atraso_tiempo, atraso_tiempo_aprox, ultimo_pago_declarado,
        interes_mensual_estimado, capital_estimado, source, source_reference, captured_at
      ) VALUES (
        p_diagnosis_id, p_anonymous_id,
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
        'engine_input', NULL, now()
      );
    END LOOP;
  END IF;
END;
$function$;
