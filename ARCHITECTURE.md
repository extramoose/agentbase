# Architecture

For engineers who want to understand how AgentBase works under the hood.

## Command bus

All mutations go through HTTP API routes. There are no server actions. This is intentional — agents and browsers use the exact same endpoints.

**Three command routes:**

- `PATCH /api/commands/update` — update any field on any entity. Takes `{ table, id, fields }`. Calls `rpc_update_entity`, which validates the table against an allowlist, rejects protected fields (`id`, `tenant_id`, `created_at`, `ticket_id`), performs the update, and writes per-field activity log entries with semantic event types (`status_changed`, `priority_changed`, `tags_changed`, etc.).
- `POST /api/commands/add-comment` — add a comment to any entity. Takes `{ entity_type, entity_id, body }`. Calls `rpc_add_comment`, which inserts a `'commented'` event into `activity_log`.
- `POST /api/commands/batch-update` — update the same fields on multiple entities at once. Takes `{ table, ids, fields }`. Used for Linear-style batch editing (e.g., select 5 tasks, set all to "done").

**Entity-specific routes** handle creates and deletes:

- `POST /api/tasks` — create a task (calls `rpc_create_task`)
- `DELETE /api/tasks/[id]` — delete a task (calls `rpc_delete_entity`)
- Same pattern for meetings, library, diary, grocery, CRM entities

The split is practical: creates need entity-specific validation (different required fields per type), while updates are generic enough to share a single endpoint.

## resolveActorUnified

Every API route starts with `const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)`. This function handles both auth paths:

### Bearer token path (agents)

1. Extract token from `Authorization: Bearer <key>` header
2. SHA-256 hash it: `createHash('sha256').update(token).digest('hex')`
3. Call `resolve_agent_by_key` RPC (SECURITY DEFINER, granted to anon role) which looks up the hash in the `agents` table, filtering out revoked agents
4. If found, return a Supabase client (anon, no session) + agent metadata
5. Rate limit check: 60 requests per 60-second window per actor

### No Bearer path (humans)

1. Create a server-side Supabase client with cookie-based session
2. Call `supabase.auth.getUser()` to validate the session
3. Look up `tenantId` via `get_my_tenant_id` RPC
4. Rate limit check (same limits as agents)

Both paths return the same `ResolvedActor` type:

```typescript
type ResolvedActor = {
  supabase: SupabaseClient  // Supabase client (authed for humans, anon for agents)
  actorId: string            // User UUID or agent UUID
  actorType: 'human' | 'agent'
  tenantId: string           // Workspace UUID
  ownerId: string            // For agents: the human who created them
}
```

**Why agents can't use cookies:** Agents aren't Supabase Auth users. They don't have JWTs or sessions. They have API keys that live in a custom `agents` table. The agent's Supabase client is created with `autoRefreshToken: false, persistSession: false` — it's stateless.

**Why agents need SECURITY DEFINER RPCs for reads:** The agent's Supabase client uses the anon key with no JWT, so `auth.uid()` returns null. RLS policies that check `is_tenant_member(tenant_id)` (which calls `auth.uid()`) will deny access. SECURITY DEFINER RPCs like `rpc_list_tasks(p_tenant_id)` bypass RLS and filter by `tenant_id` directly. The route handler has already validated the agent's API key and confirmed their `tenantId` before calling the RPC.

## RPC atomicity

Every mutation calls a SECURITY DEFINER Postgres function. These functions do two things in one transaction:

1. The entity mutation (INSERT, UPDATE, or DELETE)
2. An activity_log INSERT recording what happened

If either fails, both roll back. This guarantees:

- No entity change without an activity log entry
- No orphaned activity log entries for failed mutations
- Consistent `entity_label` capture (the RPC reads the label before deletion)

Example from `rpc_create_task`:

```sql
INSERT INTO tasks (...) VALUES (...) RETURNING id INTO v_id;
INSERT INTO activity_log (...) VALUES (..., 'created', ...);
SELECT to_jsonb(t.*) INTO v_result FROM tasks t WHERE t.id = v_id;
RETURN v_result;
```

The update RPC (`rpc_update_entity`) is more sophisticated — it fetches the old row first, computes per-field diffs, and emits semantic event types:

- `status_changed` with `{ old: 'todo', new: 'done' }`
- `tags_changed` with `{ added: ['urgent'], removed: ['backlog'] }`
- `priority_changed`, `title_changed`, `due_date_set`, `due_date_cleared`
- `field_updated` for everything else

## RLS and multi-tenancy

Every data table has a `tenant_id` column referencing the `tenants` table. RLS policies use the `is_tenant_member()` helper:

```sql
CREATE FUNCTION is_tenant_member(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql
SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
  )
$$;
```

This is SECURITY DEFINER to avoid recursive RLS issues — `tenant_members` itself has RLS, and checking membership from within another table's policy would cause infinite recursion.

Similarly, `is_admin()` and `is_superadmin()` are SECURITY DEFINER wrappers around profile role checks, replacing direct policy subqueries on the `profiles` table (which caused the same recursion problem).

**Why not just use RLS everywhere?** For human users with valid JWTs, RLS works fine. But agent clients have no JWT (their `auth.uid()` is null), so RLS denies everything. The solution: SECURITY DEFINER RPCs that accept `p_tenant_id` as a parameter. The API route handler validates the agent's identity and tenant before calling the RPC. The RPC trusts the input because it's only callable from server-side code that's already done auth.

## Activity log

The `activity_log` table is the system's audit trail:

```sql
CREATE TABLE activity_log (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  entity_type  text NOT NULL,       -- 'tasks', 'meetings', 'companies', etc.
  entity_id    uuid NOT NULL,
  entity_label text,                -- human-readable: task title, person name, etc.
  event_type   text NOT NULL,       -- 'created', 'updated', 'status_changed', 'commented', etc.
  actor_id     uuid NOT NULL,       -- user UUID or agent UUID
  actor_type   text NOT NULL,       -- 'human' | 'agent'
  old_value    text,
  new_value    text,
  body         text,                -- comment text for 'commented' events
  payload      jsonb,               -- structured diff data for rich events
  created_at   timestamptz NOT NULL
);
```

**No FK on `actor_id`.** Originally this referenced `auth.users(id)`, but agents live in the `agents` table, not `auth.users`. Migration `008_activity_log_actor_fk.sql` dropped the constraint. The `actor_type` column tells you which table to look up.

**Append-only.** RLS policies allow SELECT and INSERT only — no UPDATE or DELETE. Once logged, activity is permanent.

**Two consumers:**

1. **History page** (`/history`) — global activity feed with entity type filters, search, and infinite scroll. Uses `get_activity_log` RPC with pagination.
2. **Per-entity activity feed** — the `ActivityAndComments` component shown in edit shelves. Subscribes to Supabase Realtime for live updates.

## Agent lifecycle

1. **Create:** Admin navigates to `/admin/agents`, clicks "Create Agent". Server generates `randomBytes(32).toString('hex')`, stores `createHash('sha256').update(key).digest('hex')` in `agents.api_key_hash`. The plaintext key is returned in the response and shown to the admin exactly once.

2. **Authenticate:** Agent sends `Authorization: Bearer <plaintext-key>` on API calls. `resolveActor()` hashes the token, calls `resolve_agent_by_key` RPC. The RPC also updates `last_seen_at` on each successful lookup.

3. **Revoke:** Admin sets `revoked_at` on the agent. The `resolve_agent_by_key` RPC filters `WHERE revoked_at IS NULL`, so the agent immediately loses access. No key rotation or session invalidation needed.

4. **Delete:** Superadmin only, and only after revocation. Permanently removes the agent row.

## Realtime

Supabase Realtime powers live updates in two patterns:

### Per-entity activity feed

`ActivityAndComments` subscribes to `postgres_changes` INSERT events on `activity_log`, filtered by `entity_type` and `entity_id`. New comments and field changes appear instantly without polling.

```typescript
supabase
  .channel(`activity:${entityType}:${entityId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'activity_log',
    filter: `entity_type=eq.${entityType},entity_id=eq.${entityId}`,
  }, (payload) => {
    setEntries(prev => [payload.new, ...prev])
  })
  .subscribe()
```

### Entity list subscriptions

Each list view (`tasks-client.tsx`, `meetings-client.tsx`, etc.) subscribes to INSERT, UPDATE, and DELETE events on its entity table. When another user or agent creates/modifies/deletes an entity, the list updates in real time.

**Important pattern:** Realtime handlers update local React state directly — they never call `router.refresh()`. Calling `router.refresh()` in a Realtime callback would create a polling loop (refresh triggers re-render, re-render re-subscribes, subscription fires again).
