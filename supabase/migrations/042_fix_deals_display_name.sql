-- Fix: deals uses 'title' not 'name'
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
    WHEN 'people'        THEN SELECT name  INTO v_name FROM people        WHERE id = p_id;
    WHEN 'companies'     THEN SELECT name  INTO v_name FROM companies     WHERE id = p_id;
    WHEN 'deals'         THEN SELECT title INTO v_name FROM deals         WHERE id = p_id;
    WHEN 'library_items' THEN SELECT title INTO v_name FROM library_items WHERE id = p_id;
    ELSE v_name := NULL;
  END CASE;
  RETURN v_name;
END;
$$;
