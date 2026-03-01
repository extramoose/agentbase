-- Migration 043: RLS audit fixes (#129)
-- SECURITY CRITICAL — fixes cross-workspace agent leak + missing entity_links UPDATE policy
--
-- Audit summary (tables still in use):
--   profiles           ✓  SELECT own + admin, UPDATE own
--   tenants            ✓  SELECT members only
--   tenant_members     ✓  SELECT members, ALL superadmin (scoped to tenant)
--   agents             ✗  "Superadmins manage agents" has NO tenant check → FIXED below
--   tags               ✓  ALL tenant members
--   tasks              ✓  ALL tenant members
--   companies          ✓  ALL tenant members
--   people             ✓  ALL tenant members
--   deals              ✓  ALL tenant members
--   library_items      ✓  ALL tenant members + public read
--   activity_log       ✓  SELECT + INSERT only (append-only by design)
--   idempotency_keys   ✓  No client policies (SECURITY DEFINER RPCs only)
--   entity_links       ✗  Missing UPDATE policy → FIXED below
--   workspace_invites  ✓  ALL for admins (scoped to tenant)

-- ═══════════════════════════════════════════════════════════════════
-- FIX 1: agents — scope superadmin policy to tenant
-- The old policy allowed ANY superadmin to read/write ALL agents
-- across ALL workspaces. Add is_tenant_member(tenant_id) check.
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Superadmins manage agents" ON agents;
CREATE POLICY "Superadmins manage agents" ON agents
  FOR ALL
  USING  (is_tenant_member(tenant_id) AND is_superadmin())
  WITH CHECK (is_tenant_member(tenant_id) AND is_superadmin());

-- ═══════════════════════════════════════════════════════════════════
-- FIX 2: entity_links — add missing UPDATE policy
-- SELECT, INSERT, DELETE existed; UPDATE was missing.
-- ═══════════════════════════════════════════════════════════════════

CREATE POLICY "tenant members can update links"
  ON entity_links FOR UPDATE
  USING  (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id));

-- ═══════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
