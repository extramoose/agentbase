-- Migration 036: Tags system — rpc_get_all_tags
-- Aggregates all tags across tasks, library_items, companies, people, deals

CREATE OR REPLACE FUNCTION rpc_get_all_tags(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH all_tags AS (
    SELECT unnest(tags) AS tag, 'tasks' AS entity_type
    FROM tasks WHERE tenant_id = p_tenant_id AND tags IS NOT NULL AND array_length(tags, 1) > 0
    UNION ALL
    SELECT unnest(tags), 'library_items'
    FROM library_items WHERE tenant_id = p_tenant_id AND tags IS NOT NULL AND array_length(tags, 1) > 0
    UNION ALL
    SELECT unnest(tags), 'companies'
    FROM companies WHERE tenant_id = p_tenant_id AND tags IS NOT NULL AND array_length(tags, 1) > 0
    UNION ALL
    SELECT unnest(tags), 'people'
    FROM people WHERE tenant_id = p_tenant_id AND tags IS NOT NULL AND array_length(tags, 1) > 0
    UNION ALL
    SELECT unnest(tags), 'deals'
    FROM deals WHERE tenant_id = p_tenant_id AND tags IS NOT NULL AND array_length(tags, 1) > 0
  ),
  counted AS (
    SELECT
      lower(tag) AS tag,
      count(*)::int AS count,
      jsonb_object_agg(
        entity_type,
        entity_count
      ) AS entities
    FROM (
      SELECT tag, entity_type, count(*)::int AS entity_count
      FROM all_tags
      GROUP BY tag, entity_type
    ) sub
    GROUP BY lower(tag)
    ORDER BY count(*) DESC, lower(tag)
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('tag', tag, 'count', count, 'entities', entities)
  ), '[]'::jsonb) INTO v_result
  FROM counted;

  RETURN v_result;
END;
$$;
