-- AgentBase Initial Schema
-- Migration: 001_initial_schema.sql

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CORE IDENTITY TABLES
-- ============================================================

CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  full_name   text,
  avatar_url  text,
  role        text NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin', 'admin', 'user')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_members (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('superadmin', 'admin', 'member', 'agent')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE agent_owners (
  agent_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id)
);

CREATE TABLE tags (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- ============================================================
-- CRM TABLES (before meetings/tasks join tables need them)
-- ============================================================

CREATE TABLE companies (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  domain      text,
  industry    text,
  notes       text,
  tags        text[] DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE people (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  email       text,
  phone       text,
  title       text,
  notes       text,
  tags        text[] DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE people_companies (
  person_id   uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (person_id, company_id)
);

CREATE TABLE deals (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title       text NOT NULL,
  status      text NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect', 'active', 'won', 'lost')),
  value       numeric,
  notes       text,
  tags        text[] DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE deals_companies (
  deal_id     uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, company_id)
);

CREATE TABLE deals_people (
  deal_id     uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  person_id   uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, person_id)
);

-- ============================================================
-- MEETINGS
-- ============================================================

CREATE TABLE meetings (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title                 text NOT NULL,
  date                  date,
  meeting_time          time,
  status                text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_meeting', 'ended', 'closed')),
  tags                  text[] DEFAULT '{}',
  prep_notes            text,
  live_notes            text,
  meeting_summary       text,
  transcript            text,
  proposed_tasks        jsonb DEFAULT '[]',
  recording_started_at  timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meetings_people (
  meeting_id  uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  person_id   uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, person_id)
);

CREATE TABLE meetings_companies (
  meeting_id  uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, company_id)
);

-- ============================================================
-- TASKS (no source_meeting_id FK yet — added below)
-- ============================================================

CREATE TABLE tasks (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title            text NOT NULL,
  body             text,
  status           text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'blocked', 'done')),
  priority         text NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low', 'none')),
  assignee         text,
  due_date         date,
  tags             text[] DEFAULT '{}',
  sort_order       integer NOT NULL DEFAULT 0,
  ticket_id        integer GENERATED ALWAYS AS IDENTITY,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Add FK now that meetings exists
ALTER TABLE tasks ADD COLUMN source_meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL;

-- ============================================================
-- LIBRARY, DIARY, GROCERY
-- ============================================================

CREATE TABLE library_items (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('favorite', 'flag', 'restaurant', 'note', 'idea', 'article')),
  title       text NOT NULL,
  body        text,
  url         text,
  source      text,
  excerpt     text,
  location_name text,
  latitude    numeric,
  longitude   numeric,
  is_public   boolean NOT NULL DEFAULT false,
  tags        text[] DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE diary_entries (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date        date NOT NULL,
  summary     text,
  content     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, date)
);

CREATE TABLE grocery_items (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  quantity    text,
  unit        text,
  category    text,
  checked     boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ACTIVITY LOG, NOTIFICATIONS, IDEMPOTENCY
-- ============================================================

CREATE TABLE activity_log (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  entity_label text,
  event_type   text NOT NULL,
  actor_id     uuid NOT NULL REFERENCES auth.users(id),
  actor_type   text NOT NULL CHECK (actor_type IN ('human', 'agent')),
  old_value    text,
  new_value    text,
  body         text,
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  body        text,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
  key           text PRIMARY KEY,
  response_body jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX ON tasks (tenant_id);
CREATE INDEX ON tasks (status);
CREATE INDEX ON tasks (assignee);
CREATE INDEX ON tasks (ticket_id);
CREATE INDEX ON meetings (tenant_id);
CREATE INDEX ON meetings (status);
CREATE INDEX ON library_items (tenant_id);
CREATE INDEX ON library_items (type);
CREATE INDEX ON diary_entries (tenant_id);
CREATE INDEX ON diary_entries (date);
CREATE INDEX ON grocery_items (tenant_id);
CREATE INDEX ON companies (tenant_id);
CREATE INDEX ON people (tenant_id);
CREATE INDEX ON deals (tenant_id);
CREATE INDEX ON activity_log (tenant_id);
CREATE INDEX ON activity_log (entity_type, entity_id);
CREATE INDEX ON activity_log (actor_id);
CREATE INDEX ON activity_log (created_at DESC);
CREATE INDEX ON idempotency_keys (created_at);
CREATE INDEX ON tenant_members (user_id);
CREATE INDEX ON tags (tenant_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION is_tenant_member(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql
SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION get_activity_log(
  p_limit       integer DEFAULT 50,
  p_offset      integer DEFAULT 0,
  p_entity_type text    DEFAULT NULL,
  p_entity_id   uuid    DEFAULT NULL,
  p_actor_id    uuid    DEFAULT NULL,
  p_date_from   date    DEFAULT NULL,
  p_search      text    DEFAULT NULL
)
RETURNS SETOF activity_log LANGUAGE sql
SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT al.*
  FROM activity_log al
  WHERE is_tenant_member(al.tenant_id)
    AND (p_entity_type IS NULL OR al.entity_type = p_entity_type)
    AND (p_entity_id   IS NULL OR al.entity_id   = p_entity_id)
    AND (p_actor_id    IS NULL OR al.actor_id     = p_actor_id)
    AND (p_date_from   IS NULL OR al.created_at  >= p_date_from::timestamptz)
    AND (p_search      IS NULL OR al.entity_label ILIKE '%' || p_search || '%'
                               OR al.body         ILIKE '%' || p_search || '%')
  ORDER BY al.created_at DESC
  LIMIT p_limit OFFSET p_offset
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tasks           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON meetings        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON library_items   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON diary_entries   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON grocery_items   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON companies       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON people          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON deals           FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- RLS: ENABLE
-- ============================================================

ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_owners     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings_people   ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE people            ENABLE ROW LEVEL SECURITY;
ALTER TABLE people_companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals_companies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals_people      ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS: POLICIES
-- ============================================================

-- profiles
CREATE POLICY "Users read own profile"   ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins read all profiles" ON profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin')));

-- tenants
CREATE POLICY "Members read own tenant" ON tenants FOR SELECT
  USING (id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- tenant_members
CREATE POLICY "Members read workspace" ON tenant_members FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));
CREATE POLICY "Superadmin manages members" ON tenant_members FOR ALL
  USING (EXISTS (
    SELECT 1 FROM tenant_members tm
    WHERE tm.tenant_id = tenant_members.tenant_id AND tm.user_id = auth.uid() AND tm.role = 'superadmin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM tenant_members tm
    WHERE tm.tenant_id = tenant_members.tenant_id AND tm.user_id = auth.uid() AND tm.role = 'superadmin'
  ));

-- agent_owners
CREATE POLICY "Agents read own row"         ON agent_owners FOR SELECT USING (agent_id = auth.uid());
CREATE POLICY "Superadmins manage agents"   ON agent_owners FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

-- tags
CREATE POLICY "Workspace members CRUD tags" ON tags FOR ALL
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));

-- tasks
CREATE POLICY "Workspace members CRUD tasks" ON tasks FOR ALL
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));

-- meetings
CREATE POLICY "Workspace members CRUD meetings" ON meetings FOR ALL
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));

-- meetings_people
CREATE POLICY "Via meeting tenant" ON meetings_people FOR ALL
  USING (EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND is_tenant_member(m.tenant_id)));

-- meetings_companies
CREATE POLICY "Via meeting tenant" ON meetings_companies FOR ALL
  USING (EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND is_tenant_member(m.tenant_id)));

-- library_items
CREATE POLICY "Workspace members CRUD library" ON library_items FOR ALL
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Public read library items" ON library_items FOR SELECT
  USING (is_public = true);

-- diary_entries
CREATE POLICY "Workspace members CRUD diary" ON diary_entries FOR ALL
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));

-- grocery_items
CREATE POLICY "Workspace members CRUD grocery" ON grocery_items FOR ALL
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));

-- companies
CREATE POLICY "Workspace members CRUD companies" ON companies FOR ALL
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));

-- people
CREATE POLICY "Workspace members CRUD people" ON people FOR ALL
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));

-- people_companies
CREATE POLICY "Via person tenant" ON people_companies FOR ALL
  USING (EXISTS (SELECT 1 FROM people p WHERE p.id = person_id AND is_tenant_member(p.tenant_id)));

-- deals
CREATE POLICY "Workspace members CRUD deals" ON deals FOR ALL
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));

-- deals_companies
CREATE POLICY "Via deal tenant" ON deals_companies FOR ALL
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_id AND is_tenant_member(d.tenant_id)));

-- deals_people
CREATE POLICY "Via deal tenant" ON deals_people FOR ALL
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_id AND is_tenant_member(d.tenant_id)));

-- activity_log (append-only — no UPDATE/DELETE policies)
CREATE POLICY "Workspace members read activity" ON activity_log FOR SELECT
  USING (is_tenant_member(tenant_id));
CREATE POLICY "Authenticated insert activity" ON activity_log FOR INSERT
  WITH CHECK (is_tenant_member(tenant_id));

-- notifications
CREATE POLICY "Users read own notifications"   ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());

-- idempotency_keys: no client access — SECURITY DEFINER RPCs only
