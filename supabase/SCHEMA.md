# AgentBase — Database Schema
*Source of truth. Update this file with every migration. Last updated: 2026-02-26.*

Supabase project: `lecsqzctdfjwencberdj`
Migrations: `supabase/migrations/`

---

## Tables

### `profiles`
One row per Supabase Auth user (humans only). Populated by `handle_new_user()` trigger.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | — | FK → auth.users |
| email | text | NO | — | |
| full_name | text | YES | — | |
| avatar_url | text | YES | — | |
| role | text | NO | `'user'` | CHECK: `user \| admin \| superadmin` |
| created_at | timestamptz | NO | `now()` | |
| updated_at | timestamptz | NO | `now()` | |

---

### `tenants`
One workspace per tenant.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | `gen_random_uuid()` |
| name | text | NO | — |
| created_at | timestamptz | NO | `now()` |
| updated_at | timestamptz | NO | `now()` |
| openrouter_api_key | text | YES | — |
| default_model | text | NO | `'openai/gpt-4o-mini'` |

---

### `tenant_members`
Maps users (human or agent) to tenants.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| tenant_id | uuid | NO | — | FK → tenants |
| user_id | uuid | NO | — | FK → auth.users |
| role | text | NO | `'member'` | Values: `member \| agent` |
| joined_at | timestamptz | NO | `now()` | |

PK: `(tenant_id, user_id)`

---

### `agents`
Custom API key-authenticated agents. Not Supabase Auth users. Ownership via `owner_id`.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | `gen_random_uuid()` | |
| tenant_id | uuid | NO | — | FK → tenants |
| name | text | NO | — | |
| avatar_url | text | YES | — | |
| api_key_hash | text | NO | — | UNIQUE, SHA-256 of plain key |
| owner_id | uuid | NO | — | FK → profiles |
| last_seen_at | timestamptz | YES | — | Updated on each API call |
| revoked_at | timestamptz | YES | — | Non-null = revoked |
| created_at | timestamptz | NO | `now()` | |

RLS: `is_tenant_member(tenant_id)` for SELECT; superadmins for ALL.

---

### ~~`agent_owners`~~ (DROPPED in migration 005)

---

### `tags`
Workspace-scoped tag registry.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | `gen_random_uuid()` |
| tenant_id | uuid | NO | — |
| name | text | NO | — |
| color | text | YES | — |
| created_at | timestamptz | NO | `now()` |

---

### `tasks`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | `gen_random_uuid()` | |
| tenant_id | uuid | NO | — | |
| title | text | NO | — | |
| body | text | YES | — | Markdown |
| status | text | NO | `'todo'` | CHECK: `todo \| in_progress \| done \| cancelled \| blocked` |
| priority | text | NO | `'medium'` | CHECK: `critical \| high \| medium \| low` |
| assignee | text | YES | — | Display name string |
| due_date | date | YES | — | |
| tags | text[] | YES | `'{}'` | |
| source_meeting_id | uuid | YES | — | FK → meetings |
| sort_order | int | NO | `0` | |
| ticket_id | int | NO | — | Sequential, auto from sequence |
| created_at | timestamptz | NO | `now()` | |
| updated_at | timestamptz | NO | `now()` | |

---

### `meetings`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | `gen_random_uuid()` | |
| tenant_id | uuid | NO | — | |
| title | text | NO | — | |
| date | date | YES | — | |
| meeting_time | time | YES | — | |
| status | text | NO | `'upcoming'` | CHECK: `upcoming \| in_meeting \| ended \| closed` |
| tags | text[] | YES | `'{}'` | |
| prep_notes | text | YES | — | Markdown |
| live_notes | text | YES | — | Markdown, auto-saved during meeting |
| meeting_summary | text | YES | — | AI-generated Markdown |
| transcript | text | YES | — | Raw transcript text |
| proposed_tasks | jsonb | YES | `'[]'` | AI-suggested tasks array |
| recording_started_at | timestamptz | YES | — | |
| created_at | timestamptz | NO | `now()` | |
| updated_at | timestamptz | NO | `now()` | |

### `meetings_people`
| Column | Type |
|--------|------|
| meeting_id | uuid (FK → meetings) |
| person_id | uuid (FK → people) |

PK: `(meeting_id, person_id)`

### `meetings_companies`
| Column | Type |
|--------|------|
| meeting_id | uuid (FK → meetings) |
| company_id | uuid (FK → companies) |

PK: `(meeting_id, company_id)`

---

### `library_items`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | `gen_random_uuid()` | |
| tenant_id | uuid | NO | — | |
| type | text | NO | — | CHECK: `favorite \| flag \| restaurant \| note \| idea \| article` |
| title | text | NO | — | |
| body | text | YES | — | Markdown notes |
| url | text | YES | — | |
| source | text | YES | — | Source site name |
| excerpt | text | YES | — | |
| location_name | text | YES | — | Human-readable location |
| latitude | numeric | YES | — | |
| longitude | numeric | YES | — | |
| is_public | boolean | NO | `false` | |
| tags | text[] | YES | `'{}'` | |
| created_at | timestamptz | NO | `now()` | |
| updated_at | timestamptz | NO | `now()` | |

---

### `diary_entries`
One entry per day per tenant. `UNIQUE (tenant_id, date)`.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | `gen_random_uuid()` | |
| tenant_id | uuid | NO | — | |
| date | date | NO | — | |
| summary | text | YES | — | Deprecated — use `content` |
| content | text | YES | — | Markdown WYSIWYG content |
| created_at | timestamptz | NO | `now()` | |
| updated_at | timestamptz | NO | `now()` | |

---

### `grocery_items`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | `gen_random_uuid()` |
| tenant_id | uuid | NO | — |
| name | text | NO | — |
| quantity | text | YES | — |
| unit | text | YES | — |
| category | text | YES | — |
| checked | boolean | NO | `false` |
| sort_order | int | NO | `0` |
| created_at | timestamptz | NO | `now()` |
| updated_at | timestamptz | NO | `now()` |

---

### `companies`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | `gen_random_uuid()` |
| tenant_id | uuid | NO | — |
| name | text | NO | — |
| domain | text | YES | — |
| industry | text | YES | — |
| notes | text | YES | — |
| tags | text[] | YES | `'{}'` |
| created_at | timestamptz | NO | `now()` |
| updated_at | timestamptz | NO | `now()` |

---

### `people`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | `gen_random_uuid()` | |
| tenant_id | uuid | NO | — | |
| name | text | NO | — | |
| email | text | YES | — | |
| phone | text | YES | — | |
| title | text | YES | — | Job title |
| notes | text | YES | — | |
| tags | text[] | YES | `'{}'` | |
| created_at | timestamptz | NO | `now()` | |
| updated_at | timestamptz | NO | `now()` | |

### `people_companies`
| Column | Type |
|--------|------|
| person_id | uuid (FK → people) |
| company_id | uuid (FK → companies) |

PK: `(person_id, company_id)`

---

### `deals`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | `gen_random_uuid()` | |
| tenant_id | uuid | NO | — | |
| title | text | NO | — | |
| status | text | NO | `'prospect'` | CHECK: `prospect \| active \| won \| lost` |
| value | numeric | YES | — | |
| notes | text | YES | — | |
| tags | text[] | YES | `'{}'` | |
| created_at | timestamptz | NO | `now()` | |
| updated_at | timestamptz | NO | `now()` | |

### `deals_companies`
| Column | Type |
|--------|------|
| deal_id | uuid (FK → deals) |
| company_id | uuid (FK → companies) |

### `deals_people`
| Column | Type |
|--------|------|
| deal_id | uuid (FK → deals) |
| person_id | uuid (FK → people) |

---

### `activity_log`
Single source of truth for all entity events. Written atomically with entity mutations via SECURITY DEFINER RPCs.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | `gen_random_uuid()` | |
| tenant_id | uuid | NO | — | |
| entity_type | text | NO | — | Table name: `tasks`, `meetings`, etc. |
| entity_id | uuid | NO | — | |
| entity_label | text | YES | — | Display name at time of event |
| event_type | text | NO | — | `created \| updated \| deleted \| commented \| status_changed \| priority_changed \| title_changed \| due_date_set \| due_date_cleared \| tags_changed \| field_updated` |
| actor_id | uuid | NO | — | FK → auth.users |
| actor_type | text | NO | — | CHECK: `human \| agent` |
| old_value | text | YES | — | For field-level diffs |
| new_value | text | YES | — | For field-level diffs |
| body | text | YES | — | Comment text |
| payload | jsonb | YES | — | Arbitrary metadata |
| created_at | timestamptz | NO | `now()` | |

---

### `notifications`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | `gen_random_uuid()` |
| tenant_id | uuid | NO | — |
| user_id | uuid | NO | — |
| title | text | NO | — |
| body | text | YES | — |
| read | boolean | NO | `false` |
| created_at | timestamptz | NO | `now()` |

---

### `idempotency_keys`

| Column | Type | Nullable |
|--------|------|----------|
| key | text | NO |
| response_body | jsonb | NO |
| created_at | timestamptz | NO |

PK: `key`

---

## SECURITY DEFINER RPCs

All mutations go through these functions. They atomically write to the entity table + `activity_log` in one transaction.

### Auth helpers
| Function | Returns | Notes |
|----------|---------|-------|
| `get_my_profile()` | `profiles` row | Uses `auth.uid()` |
| `get_my_tenant_id()` | `uuid` | Uses `auth.uid()` |
| `resolve_agent_by_key(p_key_hash)` | `jsonb` (agent row or null) | Looks up agent by hashed API key, updates `last_seen_at`. Callable by anon. |
| `admin_update_profile(p_target_id, p_avatar_url, p_full_name, p_role)` | `void` | Admin/superadmin only. Updates profile fields via COALESCE. |
| `get_workspace_settings()` | `jsonb` (tenant row) | Returns tenant for current user's workspace. |
| `update_workspace_settings(p_name, p_openrouter_api_key, p_default_model)` | `void` | Superadmin only. Updates tenant settings via COALESCE. |

### Query helper
| Function | Parameters | Returns |
|----------|-----------|---------|
| `get_activity_log(p_limit, p_offset, p_entity_type, p_entity_id, p_actor_id, p_date_from, p_search)` | all optional | `activity_log` rows |

### Entity creates
| Function | Key params | Returns |
|----------|-----------|---------|
| `rpc_create_task` | tenant_id, actor_id, actor_type, title, priority, status, body | jsonb (task row) |
| `rpc_create_meeting` | tenant_id, actor_id, actor_type, title, date, meeting_time, tags | jsonb (meeting row) |
| `rpc_create_library_item` | tenant_id, actor_id, actor_type, type, title, url, body, source, excerpt, location_name, latitude, longitude, tags, is_public | jsonb |
| `rpc_upsert_diary_entry` | tenant_id, actor_id, actor_type, date, content | jsonb — logs `created` or `updated` |
| `rpc_create_grocery_item` | tenant_id, actor_id, actor_type, name, category, quantity | jsonb |
| `rpc_create_company` | tenant_id, actor_id, actor_type, name, domain, industry, notes, tags | jsonb |
| `rpc_create_person` | tenant_id, actor_id, actor_type, name, email, phone, title, notes, tags | jsonb |
| `rpc_create_deal` | tenant_id, actor_id, actor_type, title, status, value, notes, tags | jsonb |

### Generic update/delete/comment
| Function | Parameters | Notes |
|----------|-----------|-------|
| `rpc_update_entity` | p_table, p_entity_id, p_fields (jsonb), p_actor_id, p_tenant_id | Dynamic SET, type-aware casting. Emits one activity_log row per changed field with semantic event_type + payload diff. Protected fields: id, tenant_id, actor_id, created_at, ticket_id |
| `rpc_delete_entity` | p_table, p_entity_id, p_actor_id, p_actor_type, p_tenant_id | Per-table label lookup, then DELETE + activity_log |
| `rpc_add_comment` | p_entity_type, p_entity_id, p_entity_label, p_body, p_actor_id, p_tenant_id | Inserts `event_type='commented'` into activity_log |

### Utility
| Function | Notes |
|----------|-------|
| `handle_new_user()` | Trigger: INSERT into profiles on auth.users INSERT |
| `set_updated_at()` | Trigger: updates updated_at on entity row changes |
| `is_tenant_member(uuid)` | Returns bool — used in RLS policies |

---

## Migrations (in order)

| File | Contents |
|------|----------|
| `001_initial_schema.sql` | All 21 tables, RLS policies, triggers, indexes |
| `002_command_bus_rpcs.sql` | `rpc_update_entity`, `rpc_add_comment`, `get_my_profile`, `get_my_tenant_id` |
| `003_activity_log_mutations.sql` | All `rpc_create_*` (8 entities) + `rpc_delete_entity` |
| `004_schema_fixes.sql` | Schema corrections: people (phone+title), deals status, companies (notes+industry), library_items (body, latitude, longitude, location_name) |
| `005_agents_table.sql` | Custom `agents` table, `resolve_agent_by_key` + `admin_update_profile` RPCs, DROP `agent_owners` |
| `006_rpc_fixes.sql` | `is_admin()`, `is_superadmin()` SECURITY DEFINER helpers; profiles RLS fix |
| `007_workspace_settings.sql` | `tenants`: add `updated_at`, `openrouter_api_key`, `default_model`; `get_workspace_settings` + `update_workspace_settings` RPCs |
| `008_rich_activity_diffs.sql` | `rpc_update_entity` captures per-field diffs with semantic event types; emits one `activity_log` row per changed field |

---

## Key Architecture Rules

- **All entity mutations go through SECURITY DEFINER RPCs** — never direct table inserts from route handlers
- **Both humans and agents use the same routes** — `resolveActorUnified()` handles Bearer (agent) vs cookie (human) auth
- **`SUPABASE_SECRET_KEY` is scripts only** — not in any runtime code (admin routes use SECURITY DEFINER RPCs instead)
- **`actor_type` CHECK is `human | agent` only** — no `system` or `platform`
- **All text content is Markdown** — stored as plain text, rendered by Tiptap or markdown parser
- **`diary_entries.summary` is deprecated** — always read/write `content`
