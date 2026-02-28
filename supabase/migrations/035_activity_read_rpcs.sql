-- Migration 035: Activity read RPCs for agents (ticket #70)
-- New SECURITY DEFINER RPCs that take p_tenant_id so agents (anon role) can
-- read activity without RLS.  Both join profiles + agents to resolve actor_name.

-- Return type for activity entries with resolved actor name
CREATE TYPE activity_entry AS (
  id           uuid,
  tenant_id    uuid,
  entity_type  text,
  entity_id    uuid,
  entity_label text,
  event_type   text,
  actor_id     uuid,
  actor_type   text,
  actor_name   text,
  old_value    text,
  new_value    text,
  body         text,
  payload      jsonb,
  created_at   timestamptz
);

-- Entity-scoped activity
CREATE OR REPLACE FUNCTION rpc_get_entity_activity(
  p_tenant_id    uuid,
  p_entity_type  text,
  p_entity_id    uuid,
  p_limit        integer DEFAULT 50,
  p_offset       integer DEFAULT 0,
  p_event_type   text    DEFAULT NULL
)
RETURNS SETOF activity_entry LANGUAGE sql
SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    al.id,
    al.tenant_id,
    al.entity_type,
    al.entity_id,
    al.entity_label,
    al.event_type,
    al.actor_id,
    al.actor_type,
    CASE al.actor_type
      WHEN 'human' THEN (SELECT p.full_name FROM profiles p WHERE p.id = al.actor_id)
      WHEN 'agent' THEN (SELECT a.name     FROM agents   a WHERE a.id = al.actor_id)
      ELSE NULL
    END AS actor_name,
    al.old_value,
    al.new_value,
    al.body,
    al.payload,
    al.created_at
  FROM activity_log al
  WHERE al.tenant_id   = p_tenant_id
    AND al.entity_type = p_entity_type
    AND al.entity_id   = p_entity_id
    AND (p_event_type IS NULL OR al.event_type = p_event_type)
  ORDER BY al.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- Global recent activity
CREATE OR REPLACE FUNCTION rpc_get_recent_activity(
  p_tenant_id  uuid,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0
)
RETURNS SETOF activity_entry LANGUAGE sql
SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    al.id,
    al.tenant_id,
    al.entity_type,
    al.entity_id,
    al.entity_label,
    al.event_type,
    al.actor_id,
    al.actor_type,
    CASE al.actor_type
      WHEN 'human' THEN (SELECT p.full_name FROM profiles p WHERE p.id = al.actor_id)
      WHEN 'agent' THEN (SELECT a.name     FROM agents   a WHERE a.id = al.actor_id)
      ELSE NULL
    END AS actor_name,
    al.old_value,
    al.new_value,
    al.body,
    al.payload,
    al.created_at
  FROM activity_log al
  WHERE al.tenant_id = p_tenant_id
  ORDER BY al.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_entity_activity(uuid, text, uuid, integer, integer, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_get_recent_activity(uuid, integer, integer) TO authenticated, anon;
