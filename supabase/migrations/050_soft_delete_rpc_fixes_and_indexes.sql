-- Migration 050: Fix RPCs leaking soft-deleted records + add partial indexes
-- #171: rpc_get_all_tags, _entity_display_name, rpc_list_* all need deleted_at IS NULL
-- #172: Partial indexes on deleted_at for active record queries

-- ============================================================================
-- #171 Fix 1: rpc_get_all_tags — filter soft-deleted records from each sub-select
-- ============================================================================
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
      AND deleted_at IS NULL
    UNION ALL
    SELECT unnest(tags), 'companies'
    FROM companies WHERE tenant_id = p_tenant_id AND tags IS NOT NULL AND array_length(tags, 1) > 0
      AND deleted_at IS NULL
    UNION ALL
    SELECT unnest(tags), 'people'
    FROM people WHERE tenant_id = p_tenant_id AND tags IS NOT NULL AND array_length(tags, 1) > 0
      AND deleted_at IS NULL
    UNION ALL
    SELECT unnest(tags), 'deals'
    FROM deals WHERE tenant_id = p_tenant_id AND tags IS NOT NULL AND array_length(tags, 1) > 0
      AND deleted_at IS NULL
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

-- ============================================================================
-- #171 Fix 2: _entity_display_name — filter soft-deleted records
--             (tasks do not have deleted_at)
-- ============================================================================
CREATE OR REPLACE FUNCTION _entity_display_name(p_type text, p_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  CASE p_type
    WHEN 'tasks'         THEN SELECT title INTO v_name FROM tasks         WHERE id = p_id;
    WHEN 'people'        THEN SELECT name  INTO v_name FROM people        WHERE id = p_id AND deleted_at IS NULL;
    WHEN 'companies'     THEN SELECT name  INTO v_name FROM companies     WHERE id = p_id AND deleted_at IS NULL;
    WHEN 'deals'         THEN SELECT title INTO v_name FROM deals         WHERE id = p_id AND deleted_at IS NULL;
    WHEN 'library_items' THEN SELECT title INTO v_name FROM library_items WHERE id = p_id AND deleted_at IS NULL;
    ELSE v_name := NULL;
  END CASE;
  RETURN v_name;
END;
$$;

-- ============================================================================
-- #171 Fix 3: rpc_list_* — filter soft-deleted records
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_list_companies(p_tenant_id uuid)
RETURNS SETOF companies LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT * FROM companies WHERE tenant_id = p_tenant_id AND deleted_at IS NULL ORDER BY name;
$$;

CREATE OR REPLACE FUNCTION rpc_list_people(p_tenant_id uuid)
RETURNS SETOF people LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT * FROM people WHERE tenant_id = p_tenant_id AND deleted_at IS NULL ORDER BY name;
$$;

CREATE OR REPLACE FUNCTION rpc_list_deals(p_tenant_id uuid)
RETURNS SETOF deals LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT * FROM deals WHERE tenant_id = p_tenant_id AND deleted_at IS NULL ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION rpc_list_library_items(p_tenant_id uuid)
RETURNS SETOF library_items LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT * FROM library_items WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
  ORDER BY created_at DESC;
$$;

-- ============================================================================
-- #172: Partial indexes on deleted_at for active record queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_companies_active      ON companies     (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_people_active          ON people        (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deals_active           ON deals         (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_library_items_active   ON library_items (deleted_at) WHERE deleted_at IS NULL;
