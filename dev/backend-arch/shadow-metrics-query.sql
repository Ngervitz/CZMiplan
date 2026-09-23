-- B3-SHADOW-METRICS-01 — central shadow parity metrics (operator / MCP)
-- Excludes technical smoke rows and known QA markers on diagnoses.input_snapshot.
-- Does not expose PII columns.

WITH real_rows AS (
  SELECT
    sr.diagnosis_id,
    sr.shadow_status,
    sr.diff_fields,
    sr.compared_at,
    sr.is_technical
  FROM public.shadow_results sr
  JOIN public.diagnoses d ON d.diagnosis_id = sr.diagnosis_id
  WHERE sr.is_technical = false
    AND NOT (
      coalesce(d.input_snapshot->>'declared_nombre', '') ~* '^QA\b'
      OR coalesce(d.input_snapshot->>'declared_email', '') ~* '@example\.(test|com)$'
      OR coalesce(d.input_snapshot->>'declared_nombre', '') ~* 'shadow.?prod|shadow.?metrics|Railway Deploy'
    )
)
SELECT
  count(*)::int AS total_compared,
  count(*) FILTER (WHERE shadow_status = 'MATCH')::int AS match_count,
  count(*) FILTER (WHERE shadow_status = 'MISMATCH')::int AS mismatch_count,
  count(*) FILTER (WHERE shadow_status = 'SHADOW_ERROR')::int AS shadow_error_count,
  CASE
    WHEN count(*) = 0 THEN NULL
    ELSE round(
      100.0 * count(*) FILTER (WHERE shadow_status = 'MATCH') / count(*),
      2
    )
  END AS match_rate_pct,
  min(compared_at) AS first_compared_at,
  max(compared_at) AS last_compared_at
FROM real_rows;

-- Mismatch detail (paths only)
-- SELECT diagnosis_id, compared_at, diff_fields
-- FROM real_rows
-- WHERE shadow_status = 'MISMATCH'
-- ORDER BY compared_at DESC;
