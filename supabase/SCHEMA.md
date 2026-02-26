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
| assignee | text | YES | — | Display name string (legacy freetext) |
| assignee_id | uuid | YES | — | Actor reference — profiles or agents |
| assignee_type | text | YES | — | CHECK: `human \| agent` |
| due_date | date | YES | — | |
| tags | text[] | YES | `'{}'` | |
| source_meeting_id | uuid | YES | — | FK → meetings |
| type | text | YES | — | CHECK: `bug \| improvement \| feature` |
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

### `essays`
Timeless living documents. No phases, no dates — a single document per essay that evolves over time.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | `gen_random_uuid()` | |
| tenant_id | uuid | NO | — | FK → tenants |
| title | text | NO | — | |
| body | text | NO | `''` | Markdown |
| tags | text[] | NO | `'{}'` | |
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

### `stream_entries`
Lightweight scratchpad inputs for any entity (never cleared). Powers diary, essays, meetings stream.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | `gen_random_uuid()` | |
| tenant_id | uuid | NO | — | FK → tenants |
| entity_type | text | NO | — | e.g. `diary`, `essay`, `meeting` |
| entity_id | uuid | NO | — | Reference to the owning entity |
| content | text | NO | — | |
| actor_id | uuid | NO | — | |
| actor_type | text | NO | — | CHECK: `human \| agent` |
| created_at | timestamptz | NO | `now()` | |

Indexes: `(entity_type, entity_id, created_at DESC)`, `(tenant_id, created_at DESC)`

---

### `document_versions`
Synthesized document snapshots for any entity. Each version is immutable.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | `gen_random_uuid()` | |
| tenant_id | uuid | NO | — | FK → tenants |
| entity_type | text | NO | — | e.g. `diary`, `essay`, `meeting` |
| entity_id | uuid | NO | — | Reference to the owning entity |
| version_number | integer | NO | — | UNIQUE with entity_id |
| content | text | NO | — | Markdown document content |
| change_summary | text | NO | — | One-sentence summary of changes |
| context_hint | text | YES | — | e.g. `good_morning`, `update`, `prep` |
| actor_id | uuid | NO | — | |
| actor_type | text | NO | — | CHECK: `human \| agent` |
| created_at | timestamptz | NO | `now()` | |

UNIQUE: `(entity_id, version_number)`
Indexes: `(entity_type, entity_id, version_number DESC)`, `(tenant_id, created_at DESC)`

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

### Query helpers
| Function | Parameters | Returns |
|----------|-----------|---------|
| `get_activity_log(p_limit, p_offset, p_entity_type, p_entity_id, p_actor_id, p_date_from, p_search)` | all optional | `activity_log` rows |
| `rpc_get_workspace_members(p_tenant_id)` | tenant UUID | jsonb `{ humans, agents }` — all humans + non-revoked agents |

### Entity creates
| Function | Key params | Returns |
|----------|-----------|---------|
| `rpc_create_task` | tenant_id, actor_id, actor_type, title, priority, status, body, assignee_id, assignee_type, type | jsonb (task row) |
| `rpc_create_meeting` | tenant_id, actor_id, actor_type, title, date, meeting_time, tags | jsonb (meeting row) |
| `rpc_create_library_item` | tenant_id, actor_id, actor_type, type, title, url, body, source, excerpt, location_name, latitude, longitude, tags, is_public | jsonb |
| `rpc_upsert_diary_entry` | tenant_id, actor_id, actor_type, date, content | jsonb — logs `created` or `updated` |
| `rpc_create_grocery_item` | tenant_id, actor_id, actor_type, name, category, quantity | jsonb |
| `rpc_create_company` | tenant_id, actor_id, actor_type, name, domain, industry, notes, tags | jsonb |
| `rpc_create_person` | tenant_id, actor_id, actor_type, name, email, phone, title, notes, tags | jsonb |
| `rpc_create_deal` | tenant_id, actor_id, actor_type, title, status, value, notes, tags | jsonb |
| `rpc_create_essay` | tenant_id, title, actor_id, actor_type | essays row |
| `rpc_list_essays` | tenant_id | `SETOF essays` — ordered by updated_at DESC |

### Generic update/delete/comment
| Function | Parameters | Notes |
|----------|-----------|-------|
| `rpc_update_entity` | p_table, p_entity_id, p_fields (jsonb), p_actor_id, p_tenant_id | Dynamic SET, type-aware casting. Emits one activity_log row per changed field with semantic event_type + payload diff. Protected fields: id, tenant_id, actor_id, created_at, ticket_id |
| `rpc_delete_entity` | p_table, p_entity_id, p_actor_id, p_actor_type, p_tenant_id | DELETE only — activity_log written by route handler (agents blocked at route level) |
| `rpc_add_comment` | p_entity_type, p_entity_id, p_entity_label, p_body, p_actor_id, p_tenant_id | Inserts `event_type='commented'` into activity_log |

### Stream & versioning
| Function | Parameters | Returns |
|----------|-----------|---------|
| `rpc_list_stream_entries` | p_tenant_id, p_entity_type, p_entity_id | `SETOF stream_entries` — last 50, oldest first |
| `rpc_create_stream_entry` | p_tenant_id, p_entity_type, p_entity_id, p_content, p_actor_id, p_actor_type | `stream_entries` row |
| `rpc_list_document_versions` | p_tenant_id, p_entity_type, p_entity_id | `SETOF document_versions` — latest first |
| `rpc_get_essay` | p_tenant_id, p_essay_id | `TABLE (id, title, tags)` — single essay lookup |
| `rpc_get_diary_entry_id` | p_tenant_id, p_date | `TABLE (id)` — diary entry UUID by date |
| `rpc_save_document_synthesis` | p_tenant_id, p_entity_type, p_entity_id, p_version_number, p_content, p_change_summary, p_context_hint, p_actor_id, p_actor_type | `SETOF document_versions` — atomic insert + activity_log |

### Utility
| Function | Notes |
|----------|-------|
| `handle_new_user()` | Trigger: INSERT into profiles on auth.users INSERT |
| `set_updated_at()` | Trigger: updates updated_at on entity row changes |
| `is_tenant_member(uuid)` | Returns bool — used in RLS policies |
| `is_superadmin()` | Returns bool — used in RLS policies |

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
| `010_task_assignee.sql` | Add `assignee_id` + `assignee_type` to tasks; update `rpc_create_task` + `rpc_update_entity` (uuid cast for `assignee_id`) |
| `011_delete_permissions.sql` | `rpc_delete_entity` stripped to DELETE-only — activity_log now written by route handlers; agents blocked 403 at route level |
| `012_task_type.sql` | Add nullable `type` column (`bug \| improvement \| feature`) to tasks; update `rpc_create_task` with `p_type` param |
| `013_stream_versioning.sql` | `stream_entries` + `document_versions` tables, RLS policies, `rpc_list_stream_entries`, `rpc_create_stream_entry`, `rpc_list_document_versions` RPCs |
| `014_essays.sql` | `essays` table, RLS policy, `rpc_create_essay`, `rpc_list_essays` |
| `018_synthesize_rpcs.sql` | `rpc_get_essay`, `rpc_get_diary_entry_id`, `rpc_save_document_synthesis` — SECURITY DEFINER RPCs for synthesize endpoints (agent path) |
| `019_workspace_members_rpc.sql` | `rpc_get_workspace_members` — returns all humans + non-revoked agents for a tenant |

---

## Key Architecture Rules

- **All entity mutations go through SECURITY DEFINER RPCs** — never direct table inserts from route handlers (exception: `activity_log` for deletes, since the entity label must be captured before RPC execution)
- **Both humans and agents use the same routes** — `resolveActorUnified()` handles Bearer (agent) vs cookie (human) auth
- **`SUPABASE_SECRET_KEY` is scripts only** — not in any runtime code (admin routes use SECURITY DEFINER RPCs instead)
- **`actor_type` CHECK is `human | agent` only** — no `system` or `platform`
- **All text content is Markdown** — stored as plain text, rendered by Tiptap or markdown parser
- **`diary_entries.summary` is deprecated** — always read/write `content`
