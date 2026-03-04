-- Migration 078: rpc_history_day_stats
-- Returns activity counts for a given local calendar day (user timezone)

CREATE OR REPLACE FUNCTION rpc_history_day_stats(p_date text, p_tz text DEFAULT 'UTC')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id uuid;
  v_day_start timestamptz;
  v_day_end   timestamptz;
  v_created   int;
  v_completed int;
  v_comments  int;
  v_updates   int;
  v_total     int;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RETURN '{"created":0,"completed":0,"comments":0,"updates":0,"total":0}'::json;
  END IF;

  v_day_start := (p_date || ' 00:00:00')::timestamp AT TIME ZONE p_tz;
  v_day_end   := (p_date || ' 23:59:59.999')::timestamp AT TIME ZONE p_tz;

  SELECT
    COUNT(*) FILTER (WHERE event_type = 'created'),
    COUNT(*) FILTER (WHERE event_type = 'field_updated' AND new_value = 'done'),
    COUNT(*) FILTER (WHERE event_type = 'commented'),
    COUNT(*) FILTER (WHERE event_type = 'field_updated'),
    COUNT(*)
  INTO v_created, v_completed, v_comments, v_updates, v_total
  FROM activity_log
  WHERE tenant_id = v_tenant_id
    AND created_at >= v_day_start
    AND created_at <= v_day_end;

  RETURN json_build_object(
    'created',   COALESCE(v_created, 0),
    'completed', COALESCE(v_completed, 0),
    'comments',  COALESCE(v_comments, 0),
    'updates',   COALESCE(v_updates, 0),
    'total',     COALESCE(v_total, 0)
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
