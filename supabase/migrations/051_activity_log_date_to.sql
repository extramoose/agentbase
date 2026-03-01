-- 051_activity_log_date_to.sql
-- Add p_date_to parameter to get_activity_log so the server can filter to a
-- single day without the client fetching thousands of rows.

CREATE OR REPLACE FUNCTION get_activity_log(
  p_limit       integer DEFAULT 50,
  p_offset      integer DEFAULT 0,
  p_entity_type text    DEFAULT NULL,
  p_entity_id   uuid    DEFAULT NULL,
  p_actor_id    uuid    DEFAULT NULL,
  p_date_from   date    DEFAULT NULL,
  p_search      text    DEFAULT NULL,
  p_date_to     date    DEFAULT NULL
)
RETURNS SETOF activity_log LANGUAGE sql
SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH filtered AS (
    SELECT al.*
    FROM activity_log al
    WHERE is_tenant_member(al.tenant_id)
      AND (p_entity_type IS NULL OR al.entity_type = p_entity_type)
      AND (p_entity_id   IS NULL OR al.entity_id   = p_entity_id)
      AND (p_actor_id    IS NULL OR al.actor_id     = p_actor_id)
      AND (p_date_from   IS NULL OR al.created_at  >= p_date_from::timestamptz)
      AND (p_date_to     IS NULL OR al.created_at   < (p_date_to + interval '1 day')::timestamptz)
      AND (p_search      IS NULL OR al.entity_label ILIKE '%' || p_search || '%'
                                 OR al.body         ILIKE '%' || p_search || '%')
  ),
  top_entities AS (
    SELECT entity_id
    FROM filtered
    GROUP BY entity_id
    ORDER BY max(created_at) DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT f.*
  FROM filtered f
  JOIN top_entities te ON te.entity_id = f.entity_id
  ORDER BY f.created_at DESC
$$;
