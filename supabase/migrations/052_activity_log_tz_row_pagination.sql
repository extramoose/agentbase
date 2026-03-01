-- 052_activity_log_tz_row_pagination.sql
-- 1. Accept p_tz text for timezone-aware date boundaries (falls back to UTC).
-- 2. Switch back to simple row-based LIMIT/OFFSET (remove entity grouping).

CREATE OR REPLACE FUNCTION get_activity_log(
  p_limit       integer DEFAULT 50,
  p_offset      integer DEFAULT 0,
  p_entity_type text    DEFAULT NULL,
  p_entity_id   uuid    DEFAULT NULL,
  p_actor_id    uuid    DEFAULT NULL,
  p_date_from   date    DEFAULT NULL,
  p_search      text    DEFAULT NULL,
  p_date_to     date    DEFAULT NULL,
  p_tz          text    DEFAULT NULL
)
RETURNS SETOF activity_log LANGUAGE sql
SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT al.*
  FROM activity_log al
  WHERE is_tenant_member(al.tenant_id)
    AND (p_entity_type IS NULL OR al.entity_type = p_entity_type)
    AND (p_entity_id   IS NULL OR al.entity_id   = p_entity_id)
    AND (p_actor_id    IS NULL OR al.actor_id     = p_actor_id)
    AND (p_date_from   IS NULL OR al.created_at  >= (p_date_from::timestamp AT TIME ZONE COALESCE(p_tz, 'UTC')))
    AND (p_date_to     IS NULL OR al.created_at   < ((p_date_to + interval '1 day')::timestamp AT TIME ZONE COALESCE(p_tz, 'UTC')))
    AND (p_search      IS NULL OR al.entity_label ILIKE '%' || p_search || '%'
                                OR al.body         ILIKE '%' || p_search || '%')
  ORDER BY al.created_at DESC
  LIMIT p_limit OFFSET p_offset
$$;
