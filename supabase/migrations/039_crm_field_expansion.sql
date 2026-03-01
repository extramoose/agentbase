-- 039_crm_field_expansion.sql
-- Ticket #103: Round out CRM fields for people, companies, and deals.

-- ---------------------------------------------------------------------------
-- 1. People — new columns
-- ---------------------------------------------------------------------------
ALTER TABLE people ADD COLUMN IF NOT EXISTS emails  jsonb  DEFAULT '[]';
ALTER TABLE people ADD COLUMN IF NOT EXISTS phones  jsonb  DEFAULT '[]';
ALTER TABLE people ADD COLUMN IF NOT EXISTS linkedin  text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS twitter   text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS instagram text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS source    text;

-- ---------------------------------------------------------------------------
-- 2. Companies — new columns
-- ---------------------------------------------------------------------------
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website   text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS linkedin  text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS twitter   text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS instagram text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS location  text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS source    text;

-- ---------------------------------------------------------------------------
-- 3. Deals — new columns
-- ---------------------------------------------------------------------------
ALTER TABLE deals ADD COLUMN IF NOT EXISTS follow_up_date      date;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS source              text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS primary_contact_id  uuid REFERENCES people(id);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS expected_close_date date;

-- ---------------------------------------------------------------------------
-- 4. Rebuild rpc_create_person with new params
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS rpc_create_person;

CREATE FUNCTION rpc_create_person(
  p_tenant_id uuid, p_actor_id uuid, p_actor_type text,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_tags text[] DEFAULT '{}',
  p_idempotency_key text DEFAULT NULL,
  p_emails jsonb DEFAULT '[]',
  p_phones jsonb DEFAULT '[]',
  p_linkedin text DEFAULT NULL,
  p_twitter text DEFAULT NULL,
  p_instagram text DEFAULT NULL,
  p_source text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_id uuid; v_result jsonb; v_existing jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT response_body INTO v_existing FROM idempotency_keys WHERE key = p_idempotency_key;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;

  INSERT INTO people (tenant_id, name, email, phone, title, notes, tags,
                      emails, phones, linkedin, twitter, instagram, source)
  VALUES (p_tenant_id, p_name, p_email, p_phone, p_title, p_notes, p_tags,
          p_emails, p_phones, p_linkedin, p_twitter, p_instagram, p_source)
  RETURNING id INTO v_id;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, 'people', v_id, p_name, 'created', p_actor_id, p_actor_type);

  SELECT to_jsonb(p.*) INTO v_result FROM people p WHERE p.id = v_id;

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO idempotency_keys (key, response_body) VALUES (p_idempotency_key, v_result)
    ON CONFLICT (key) DO NOTHING;
  END IF;

  RETURN v_result;
END; $f$;

-- ---------------------------------------------------------------------------
-- 5. Rebuild rpc_create_company with new params
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS rpc_create_company;

CREATE FUNCTION rpc_create_company(
  p_tenant_id uuid, p_actor_id uuid, p_actor_type text,
  p_name text,
  p_domain text DEFAULT NULL,
  p_industry text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_tags text[] DEFAULT '{}',
  p_idempotency_key text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_linkedin text DEFAULT NULL,
  p_twitter text DEFAULT NULL,
  p_instagram text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_source text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_id uuid; v_result jsonb; v_existing jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT response_body INTO v_existing FROM idempotency_keys WHERE key = p_idempotency_key;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;

  INSERT INTO companies (tenant_id, name, domain, industry, notes, tags,
                         website, linkedin, twitter, instagram, location, source)
  VALUES (p_tenant_id, p_name, p_domain, p_industry, p_notes, p_tags,
          p_website, p_linkedin, p_twitter, p_instagram, p_location, p_source)
  RETURNING id INTO v_id;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, 'companies', v_id, p_name, 'created', p_actor_id, p_actor_type);

  SELECT to_jsonb(c.*) INTO v_result FROM companies c WHERE c.id = v_id;

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO idempotency_keys (key, response_body) VALUES (p_idempotency_key, v_result)
    ON CONFLICT (key) DO NOTHING;
  END IF;

  RETURN v_result;
END; $f$;

-- ---------------------------------------------------------------------------
-- 6. Rebuild rpc_create_deal with new params
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS rpc_create_deal;

CREATE FUNCTION rpc_create_deal(
  p_tenant_id uuid, p_actor_id uuid, p_actor_type text,
  p_title text,
  p_status text DEFAULT 'prospect',
  p_value numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_tags text[] DEFAULT '{}',
  p_idempotency_key text DEFAULT NULL,
  p_follow_up_date date DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_primary_contact_id uuid DEFAULT NULL,
  p_expected_close_date date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_id uuid; v_result jsonb; v_existing jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT response_body INTO v_existing FROM idempotency_keys WHERE key = p_idempotency_key;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;

  INSERT INTO deals (tenant_id, title, status, value, notes, tags,
                     follow_up_date, source, primary_contact_id, expected_close_date)
  VALUES (p_tenant_id, p_title, p_status, p_value, p_notes, p_tags,
          p_follow_up_date, p_source, p_primary_contact_id, p_expected_close_date)
  RETURNING id INTO v_id;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, 'deals', v_id, p_title, 'created', p_actor_id, p_actor_type);

  SELECT to_jsonb(d.*) INTO v_result FROM deals d WHERE d.id = v_id;

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO idempotency_keys (key, response_body) VALUES (p_idempotency_key, v_result)
    ON CONFLICT (key) DO NOTHING;
  END IF;

  RETURN v_result;
END; $f$;

-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
