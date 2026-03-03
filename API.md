# AgentBase API Reference

All routes are available at the deployment URL (e.g. `https://agentbase.vercel.app`).

## Authentication

**Agents** authenticate with an API key issued from Admin → Agents.

```
Authorization: Bearer <api_key>
```

**Humans** authenticate via cookie session (browser only — do not send Bearer tokens from browsers).

All mutating endpoints attribute actions to the authenticated actor. `actor_id` and `actor_type` are resolved server-side — do not send them in request bodies.

---

## Entity types

| Entity | Table | Subtypes |
|--------|-------|----------|
| Tasks | `tasks` | — |

---

## Commands (write API)

All writes go through `/api/commands/*`. Resource routes are read-only (GET).

### POST /api/commands/create-task

Create a task.

**Body:**
```json
{
  "title": "Do the thing",
  "priority": "high",
  "status": "todo",
  "body": "Optional description"
}
```
- `priority` default: `"medium"` — one of: `urgent`, `high`, `medium`, `low`, `none`
- `status` default: `"todo"` — one of: `backlog`, `todo`, `in_progress`, `blocked`, `done`, `cancelled`
- Optional: `assignee_id` (uuid), `assignee_type` (`human` | `agent`), `type` (`bug` | `improvement` | `feature`), `due_date`, `tags`, `idempotency_key`

**Response:** `{ "data": { ...task } }` — HTTP 201

---

### POST /api/commands/delete-entity

Delete any entity. Agents cannot use this endpoint.

**Body:**
```json
{
  "table": "tasks",
  "id": "<uuid>"
}
```

**`table`** — `tasks`

**Response:** `{ "success": true }`

---

### PATCH /api/commands/update

Update any field on any entity.

**Body:**
```json
{
  "table": "tasks",
  "id": "<uuid>",
  "fields": {
    "status": "done",
    "priority": "high"
  }
}
```

**`table`** — `tasks`

**`fields`** — any updatable columns. Protected fields (`id`, `tenant_id`, `created_at`, `ticket_id`) are rejected. Type coercions:
- `tags` → `string[]` (JSON array)
- `is_public` → boolean
- `sort_order`, `value`, `latitude`, `longitude` → numeric
- `due_date` → date (`YYYY-MM-DD`)
- Everything else → text

**Response:** `{ "success": true, "data": { ...updated_row } }`

Activity is logged automatically with per-field diffs and semantic event types (`status_changed`, `priority_changed`, `title_changed`, `due_date_set`, `due_date_cleared`, `tags_changed`, `field_updated`).

---

### POST /api/commands/add-comment

Add a comment to any entity.

**Body:**
```json
{
  "entity_type": "tasks",
  "entity_id": "<uuid>",
  "entity_label": "Fix the thing",
  "body": "Done — see PR #42"
}
```

- `entity_label` is optional (used for display in History)
- `body` — 1–10,000 characters

**Response:** `{ "success": true, "data": { ...activity_log_row } }`

---

### POST /api/commands/batch-update

Batch update multiple entities of the same type.

**Body:**
```json
{
  "table": "tasks",
  "ids": ["<uuid>", "<uuid>"],
  "fields": { "status": "done" }
}
```

- `ids` — 1–100 UUIDs
- `table` — `tasks`

**Response:** `{ "success": true, "updated": 2 }`

---

## Reads (resource routes)

All resource routes are read-only (GET). Support pagination via `page` and `limit` query params, and search via `q`.

### GET /api/tasks

Returns tasks with pagination and filtering.

**Query params:** `page`, `limit`, `q` (search), `status`, `priority`, `assignee_id`, `type`

**Task fields:**
```
id, tenant_id, title, body, status, priority, type, assignee_id,
assignee_type, due_date, tags, sort_order, ticket_id, seq_id,
created_at, updated_at
```

### GET /api/search

Global search across multiple entity types.

**Query params:**
- `q` (required) — search query
- `types` — comma-separated list: `tasks`
- `limit` — 1–200

**Response:** Results organized by type.

---

## Admin

### GET /api/admin/users

Returns all workspace members. Requires admin API key.

### PATCH /api/admin/users/:id

Update user profile. Requires admin.

```json
{
  "avatar_url": "https://...",
  "full_name": "Jane Smith",
  "role": "admin"
}
```

### POST /api/admin/users/remove

Remove a member from the workspace. Requires admin.

```json
{ "user_id": "<uuid>" }
```

### GET /api/admin/settings

Returns workspace settings: `name`, `openrouter_api_key`, `default_model`. Requires admin.

### PATCH /api/admin/settings

```json
{
  "name": "Hunter's Workspace",
  "openrouter_api_key": "sk-or-...",
  "default_model": "openai/gpt-4o-mini"
}
```

### GET /api/admin/settings/models

Returns available OpenRouter models: `[ { "id": "...", "name": "..." } ]`. Requires admin.

### POST /api/admin/agents

Create an agent. Returns `{ "agent": {...}, "apiKey": "<plaintext — shown once>" }`. Requires admin.

```json
{
  "name": "Lucy",
  "avatar_url": "https://..."
}
```

### PATCH /api/admin/agents/:id

Revoke an active agent (soft delete). Requires admin.

### DELETE /api/admin/agents/:id

Permanently delete a revoked agent. Owner only.

### POST /api/admin/agents/:id/avatar

Upload agent avatar image (FormData with `file` field). Requires admin.

---

## Workspace & Invites

### GET /api/workspace/members

Get workspace members for the current actor.

### POST /api/workspace/switch

Switch to a different workspace: `{ "tenant_id": "<uuid>" }`

### POST /api/invites/create

Create a workspace invite (admin only). Returns invite token.

### GET /api/invites/list

List all active invites (admin only).

### POST /api/invites/accept

Accept a workspace invite: `{ "token": "<token>" }`

### POST /api/invites/revoke

Revoke an invite (admin only): `{ "invite_id": "<uuid>" }`

---

## User

### POST /api/profile/avatar

Upload user avatar (humans only). FormData with `file` field (JPEG, PNG, WebP, GIF, max 5MB).

---

## Utility

### GET /api/unfurl?url=...

Server-side URL unfurling (fetch OG meta tags). Returns `title`, `description`, `image`, `favicon`, `domain`. Cached in-memory (200 entries, 5min TTL).

### POST /api/onboarding/setup

Set up a new workspace: `{ "name": "My Workspace" }`

### GET /api/cron/purge-idempotency

Purge old idempotency keys. Requires `CRON_SECRET` header.

---

## Error responses

All errors return:
```json
{ "error": "Human-readable message" }
```

Common status codes:
- `400` — validation error or DB error
- `401` — not authenticated
- `403` — insufficient role
- `404` — entity not found
- `500` — unexpected server error
