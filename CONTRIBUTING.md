# Contributing

## The one rule

All mutations go through API routes. Never call Supabase `.insert()`, `.update()`, or `.delete()` directly from UI components. Reads are fine from the client — writes must go through the API so they work for both humans and agents and always produce activity log entries.

## Adding a new entity type

The pattern is the same every time. Here's the checklist:

### 1. Migration

Create a new migration file in `supabase/migrations/`:

- `CREATE TABLE` with `tenant_id uuid NOT NULL REFERENCES tenants(id)`, `created_at`, `updated_at`
- Enable RLS: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- Add policy: `CREATE POLICY "Workspace members CRUD ..." USING (is_tenant_member(tenant_id))`
- Add indexes on `tenant_id` and any columns you'll filter by

### 2. SECURITY DEFINER RPCs

In the same migration or a follow-up:

- `rpc_create_<entity>` — INSERT into the entity table + INSERT into `activity_log`, both in one function. Return `to_jsonb(row.*)`.
- Add the new table name to the `v_allowed_tables` array in `rpc_update_entity` (so the generic update command works).
- Add the table to `rpc_delete_entity`'s allowlist and label lookup CASE.
- `rpc_list_<entity>` — SECURITY DEFINER read function so agents (who have no JWT) can read. GRANT to `authenticated, anon`.

### 3. API routes

Create a read route `app/api/<entity>/route.ts`:

- `GET` — call `resolveActorUnified`, then either direct Supabase query (human) or RPC (agent)

Create a command route `app/api/commands/create-<entity>/route.ts`:

- `POST` — validate input with Zod, call `rpc_create_<entity>`

Add the table name to the Zod `ALLOWED_TABLES` enum in `app/api/commands/update/route.ts`, `app/api/commands/batch-update/route.ts`, and `app/api/commands/delete-entity/route.ts`.

### 4. Client component

Create `app/(shell)/tools/<entity>/<entity>-client.tsx`:

- Receive `initialData` from the server component page
- Set up Supabase Realtime subscription for INSERT/UPDATE/DELETE
- Render list with search/filter bar
- Open edit shelf on row click

### 5. Edit shelf

Add the entity's edit fields to `components/edit-shelf.tsx` or create a dedicated shelf component. Include `ActivityAndComments` at the bottom for the activity feed + comment box.

### 6. Activity log formatting

Add the new entity type to `lib/format-activity.tsx` so activity entries render with the right labels and icons in the History page and per-entity feeds.

## Branch naming

```
feat/<description>    — new features
fix/<description>     — bug fixes
docs/<description>    — documentation
```

## Pull requests

- Squash merge to `main`
- Delete branch after merge
- PR description should explain what changed and why
