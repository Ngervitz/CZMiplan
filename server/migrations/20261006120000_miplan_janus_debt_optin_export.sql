-- MIPLAN-JANUS-EXPORT-01 — S2S export of debt-management opt-in events for the JANUS pull.
-- WRITTEN, NOT APPLIED. Apply manually in Supabase after 20261001120000_v2_user_choices.sql.
--
-- Delivery guarantee: at-least-once with explicit ACK (no time window, no cursor).
--   * Consent state (debt_management_opt_in_events) is untouched. Delivery state lives in a
--     separate append-only table: janus_debt_optin_delivery_acks (one row per acknowledged event).
--   * Export = handoff events WITHOUT an ack row, ordered (created_at, event_id). A late-committed
--     event simply appears as pending on a later pull: correctness never depends on clocks.
--   * JANUS acks only after durable ingest. Same ack again → no-op ('already_acked'), the first
--     ack row is never rewritten. Unknown / non-exportable event_id → whole batch rejected.
--   * Ack rows are never deleted: the ack log is the delivery audit trail.
--
-- Export contract (consumed by server/modules/janusExport):
--   * Only handoff journeys (bootstrap_key 'handoff:<sha256hex>'); handoff_token_hash is that hash.
--   * Authorized snapshot D = origin_diagnosis_id, else the origin evaluation's diagnosis.
--     opted_in → debts of D.input_snapshot.deudas WITH ORDINALITY (position = ordinality - 1),
--     excluding non-objects, cancelada = true, situacion_ui = 'pagada', _is_draft_add = true;
--     excluded_count counts them. withdrawn → no debts.
--   * Never exported: anonymous_id, CI, person, income, survey, strategy, choices, estimates.

BEGIN;

-- ---------------------------------------------------------------------------
-- Delivery state (separate from consent state).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.janus_debt_optin_delivery_acks (
  event_id uuid PRIMARY KEY REFERENCES public.debt_management_opt_in_events (event_id),
  acked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  janus_ingest_status text NOT NULL,
  ack_contract_version text NOT NULL,
  CONSTRAINT janus_optin_acks_status_check CHECK (janus_ingest_status IN ('inserted', 'already_ingested')),
  CONSTRAINT janus_optin_acks_contract_check CHECK (ack_contract_version = 'miplan_debt_optin_export_v1')
);

COMMENT ON TABLE public.janus_debt_optin_delivery_acks IS
  'MIPLAN-JANUS-EXPORT-01 delivery state: JANUS acknowledged durable ingest of the opt-in event. '
  'Append-only audit log (first ack wins, never deleted). Not consent state. Backend only.';

ALTER TABLE public.janus_debt_optin_delivery_acks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.janus_debt_optin_delivery_acks FROM PUBLIC;
REVOKE ALL ON TABLE public.janus_debt_optin_delivery_acks FROM anon, authenticated;

CREATE OR REPLACE FUNCTION miplan_private.forbid_janus_delivery_ack_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  RAISE EXCEPTION 'JANUS_DELIVERY_ACK_APPEND_ONLY' USING ERRCODE = '55000';
END;
$function$;

REVOKE ALL ON FUNCTION miplan_private.forbid_janus_delivery_ack_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION miplan_private.forbid_janus_delivery_ack_mutation() FROM anon, authenticated;

CREATE OR REPLACE TRIGGER janus_optin_acks_append_only
  BEFORE UPDATE OR DELETE ON public.janus_debt_optin_delivery_acks
  FOR EACH ROW EXECUTE FUNCTION miplan_private.forbid_janus_delivery_ack_mutation();
CREATE OR REPLACE TRIGGER janus_optin_acks_no_truncate
  BEFORE TRUNCATE ON public.janus_debt_optin_delivery_acks
  FOR EACH STATEMENT EXECUTE FUNCTION miplan_private.forbid_janus_delivery_ack_mutation();

-- ---------------------------------------------------------------------------
-- Export: pending (unacked) handoff events.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miplan_export_debt_optin_events(
  p_secret text,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
DECLARE
  expected text;
  v_events jsonb;
  v_total integer;
BEGIN
  SELECT s.secret INTO expected
  FROM miplan_private.backend_secrets s
  WHERE s.name = 'b2_persist';

  IF expected IS NULL OR p_secret IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'MIPLAN_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'INVALID_EXPORT_LIMIT' USING ERRCODE = '22023';
  END IF;

  WITH page AS (
    SELECT
      o.event_id, o.journey_id, o.seq, o.state, o.scope, o.contract_version, o.source,
      o.consent_text_version, o.created_at, o.origin_evaluation_id, o.origin_diagnosis_id,
      coalesce(o.origin_diagnosis_id, ev.origin_diagnosis_id) AS snapshot_diagnosis_id,
      CASE WHEN j.bootstrap_key ~ '^handoff:[0-9a-f]{64}$' THEN substr(j.bootstrap_key, 9) END AS handoff_token_hash,
      row_number() OVER (ORDER BY o.created_at, o.event_id) AS rn
    FROM public.debt_management_opt_in_events o
    JOIN public.journeys j ON j.journey_id = o.journey_id
    JOIN public.financial_strategy_evaluations ev ON ev.evaluation_id = o.origin_evaluation_id
    WHERE j.bootstrap_key LIKE 'handoff:%'
      AND NOT EXISTS (
        SELECT 1 FROM public.janus_debt_optin_delivery_acks a WHERE a.event_id = o.event_id
      )
    ORDER BY o.created_at, o.event_id
    LIMIT p_limit + 1
  ),
  shaped AS (
    SELECT p.*, dd.debts, dd.excluded_count
    FROM page p
    LEFT JOIN public.diagnoses dg
      ON dg.diagnosis_id = p.snapshot_diagnosis_id AND p.state = 'opted_in'
    LEFT JOIN LATERAL (
      SELECT
        coalesce(jsonb_agg(jsonb_build_object(
          'position', t.ord - 1,
          'client_debt_id', t.d->'id',
          'tipo', t.d->'tipo',
          'acreedor_raw', t.d->'acreedor_raw',
          'acreedor', t.d->'acreedor',
          'acreedor_display', t.d->'acreedor_display',
          'acreedor_normalizado', t.d->'acreedor_normalizado',
          'monto', t.d->'monto',
          'pago', t.d->'pago',
          'pago_mensual_actual', t.d->'pago_mensual_actual',
          'situacion_ui', t.d->'situacion_ui',
          'estado', t.d->'estado',
          'atraso_tiempo', t.d->'atraso_tiempo',
          'atraso_tiempo_aprox', t.d->'atraso_tiempo_aprox',
          'ultimo_pago_declarado', t.d->'ultimo_pago_declarado',
          'debt_confidence', t.d->'debt_confidence'
        ) ORDER BY t.ord) FILTER (WHERE NOT t.excluded), '[]'::jsonb) AS debts,
        (count(*) FILTER (WHERE t.excluded))::integer AS excluded_count
      FROM (
        SELECT e.value AS d, e.ord,
          (jsonb_typeof(e.value) <> 'object'
            OR coalesce(e.value->'cancelada' = 'true'::jsonb, false)
            OR coalesce(e.value->>'situacion_ui' = 'pagada', false)
            OR coalesce(e.value->'_is_draft_add' = 'true'::jsonb, false)) AS excluded
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(dg.input_snapshot->'deudas') = 'array'
               THEN dg.input_snapshot->'deudas' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS e(value, ord)
      ) t
    ) dd ON p.state = 'opted_in'
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'event_id', s.event_id,
      'journey_id', s.journey_id,
      'seq', s.seq,
      'state', s.state,
      'scope', s.scope,
      'contract_version', s.contract_version,
      'source', s.source,
      'consent_text_version', s.consent_text_version,
      'created_at', s.created_at,
      'origin_evaluation_id', s.origin_evaluation_id,
      'origin_diagnosis_id', s.origin_diagnosis_id,
      'snapshot_diagnosis_id', s.snapshot_diagnosis_id,
      'handoff_token_hash', s.handoff_token_hash,
      'excluded_count', CASE WHEN s.state = 'opted_in' THEN coalesce(s.excluded_count, 0) END,
      'debts', CASE WHEN s.state = 'opted_in' THEN coalesce(s.debts, '[]'::jsonb) END
    ) ORDER BY s.created_at, s.event_id) FILTER (WHERE s.rn <= p_limit), '[]'::jsonb),
    count(*)::integer
  INTO v_events, v_total
  FROM shaped s;

  RETURN jsonb_build_object(
    'events', v_events,
    'has_more', v_total > p_limit
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_export_debt_optin_events(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.miplan_export_debt_optin_events(text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.miplan_export_debt_optin_events(text, integer)
  TO anon, service_role;

-- ---------------------------------------------------------------------------
-- ACK: JANUS confirms durable ingest. Atomic batch, fail closed, idempotent.
-- p_acks = [{ "event_id": uuid, "janus_status": "inserted" | "already_ingested" }, ...] (1..200).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miplan_ack_debt_optin_events(
  p_secret text,
  p_acks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'miplan_private'
AS $function$
DECLARE
  expected text;
  v_count integer;
  v_valid integer;
  v_distinct integer;
  v_exportable integer;
  v_inserted integer;
BEGIN
  SELECT s.secret INTO expected
  FROM miplan_private.backend_secrets s
  WHERE s.name = 'b2_persist';

  IF expected IS NULL OR p_secret IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'MIPLAN_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_acks IS NULL OR jsonb_typeof(p_acks) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_ACK_REQUEST' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_acks);
  IF v_count < 1 OR v_count > 200 THEN
    RAISE EXCEPTION 'INVALID_ACK_REQUEST' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_valid
  FROM jsonb_array_elements(p_acks) a
  WHERE jsonb_typeof(a) = 'object'
    AND coalesce(a->>'event_id', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND a->>'janus_status' IN ('inserted', 'already_ingested');
  IF v_valid <> v_count THEN
    RAISE EXCEPTION 'INVALID_ACK_REQUEST' USING ERRCODE = '22023';
  END IF;

  SELECT count(DISTINCT (a->>'event_id')::uuid) INTO v_distinct FROM jsonb_array_elements(p_acks) a;
  IF v_distinct <> v_count THEN
    RAISE EXCEPTION 'INVALID_ACK_REQUEST' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_exportable
  FROM jsonb_array_elements(p_acks) a
  JOIN public.debt_management_opt_in_events o ON o.event_id = (a->>'event_id')::uuid
  JOIN public.journeys j ON j.journey_id = o.journey_id
  JOIN public.financial_strategy_evaluations ev ON ev.evaluation_id = o.origin_evaluation_id
  WHERE j.bootstrap_key LIKE 'handoff:%';
  IF v_exportable <> v_count THEN
    RAISE EXCEPTION 'ACK_EVENT_NOT_EXPORTABLE' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.janus_debt_optin_delivery_acks (event_id, janus_ingest_status, ack_contract_version)
  SELECT (a->>'event_id')::uuid, a->>'janus_status', 'miplan_debt_optin_export_v1'
  FROM jsonb_array_elements(p_acks) a
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object('acked', v_inserted, 'already_acked', v_count - v_inserted);
END;
$function$;

REVOKE ALL ON FUNCTION public.miplan_ack_debt_optin_events(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.miplan_ack_debt_optin_events(text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.miplan_ack_debt_optin_events(text, jsonb)
  TO anon, service_role;

COMMIT;
