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
- `status` default: `"todo"` — one of: `todo`, `in_progress`, `done`, `blocked`
- Optional: `assignee_id` (uuid), `assignee_type` (`human` | `agent`), `type` (`bug` | `improvement` | `feature`), `idempotency_key`

**Response:** `{ "data": { ...task } }` — HTTP 201

---

### POST /api/commands/create-meeting

**Body:**
```json
{
  "title": "Weekly sync",
  "date": "2026-03-01",
  "meeting_time": "10:00",
  "tags": ["work"]
}
```
- Optional: `idempotency_key`

**Response:** `{ "data": { ...meeting } }` — HTTP 201

---

### POST /api/commands/create-library-item

**Body:**
```json
{
  "type": "note",
  "title": "Van maintenance log",
  "body": "Replaced brake pads...",
  "tags": ["van", "maintenance"],
  "is_public": false
}
```
- `type` — one of: `favorite`, `flag`, `restaurant`, `note`, `idea`, `article`
- Optional: `url`, `source`, `excerpt`, `location_name`, `latitude`, `longitude`, `idempotency_key`

**Response:** `{ "data": { ...library_item } }` — HTTP 201

---

### POST /api/commands/create-company

**Body:**
```json
{
  "name": "Acme Corp",
  "domain": "acme.com",
  "industry": "Software",
  "notes": "Met at SaaStr",
  "tags": ["prospect"]
}
```
- Optional: `domain`, `industry`, `notes`, `tags`, `idempotency_key`

**Response:** `{ "data": { ...company } }` — HTTP 201

---

### POST /api/commands/create-person

**Body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@acme.com",
  "phone": "+1 555 0100",
  "title": "CTO",
  "tags": ["investor"]
}
```
- Optional: `email`, `phone`, `title`, `notes`, `tags`, `idempotency_key`

**Response:** `{ "data": { ...person } }` — HTTP 201

---

### POST /api/commands/create-deal

**Body:**
```json
{
  "title": "Acme Enterprise",
  "status": "prospect",
  "value": 50000,
  "notes": "Intro call scheduled"
}
```
- `status` default: `"prospect"` — one of: `prospect`, `active`, `won`, `lost`
- Optional: `value`, `notes`, `tags`, `idempotency_key`

**Response:** `{ "data": { ...deal } }` — HTTP 201

---

### POST /api/commands/create-grocery-item

**Body:**
```json
{
  "name": "Oat milk",
  "category": "Dairy",
  "quantity": "2"
}
```
- Optional: `category`, `quantity`, `idempotency_key`

**Response:** `{ "data": { ...grocery_item } }` — HTTP 201

---

### POST /api/commands/create-diary-entry

Upserts (creates or replaces) the entry for the given date.

**Body:**
```json
{
  "date": "2026-02-26",
  "content": "Today I..."
}
```

**Response:** `{ "data": { ...diary_entry } }`

---

### POST /api/commands/create-essay

**Body:**
```json
{
  "title": "My Essay"
}
```
- Optional: `idempotency_key`

**Response:** `{ "data": { ...essay } }` — HTTP 201

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

**`table`** — one of: `tasks`, `meetings`, `library_items`, `companies`, `people`, `deals`, `grocery_items`, `diary_entries`, `essays`, `stream_entries`, `document_versions`

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

**`table`** — one of: `tasks`, `meetings`, `library_items`, `diary_entries`, `grocery_items`, `companies`, `people`, `deals`, `essays`

**`fields`** — any updatable columns. Protected fields (`id`, `tenant_id`, `created_at`, `ticket_id`) are rejected. Type coercions:
- `tags` → `string[]` (JSON array)
- `checked`, `is_public` → boolean
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

**Response:** `{ "success": true, "updated": 2 }`

---

## Reads (resource routes)

All resource routes are read-only (GET).

### GET /api/tasks
Returns all tasks ordered by `sort_order` then `created_at` desc.

**Task fields:**
```
id, tenant_id, title, body, status, priority, assignee, due_date,
tags, source_meeting_id, sort_order, ticket_id, created_at, updated_at
```

### GET /api/meetings
Returns all meetings ordered by `date` desc.

**Meeting fields:**
```
id, tenant_id, title, date, meeting_time, status, live_notes,
summary, proposed_tasks, tags, created_at, updated_at
```

### POST /api/meetings/:id/summarize
Triggers AI summary generation. Returns `{ "summary": "..." }`.

### POST /api/meetings/:id/suggest-tasks
Generates suggested follow-up tasks. Returns `{ "tasks": [...] }`.

### GET /api/library
Returns all library items ordered by `created_at` desc.

**Item types:** `favorite` | `flag` | `restaurant` | `note` | `idea` | `article`

### GET /api/diary
Returns all diary entries ordered by `date` desc.

### GET /api/diary/:date
Returns a single diary entry for `YYYY-MM-DD`. Returns `{ "data": null }` if none exists.

### GET /api/grocery
Returns all grocery items ordered by `sort_order` then `created_at`.

### DELETE /api/grocery?checked=true
Delete all checked grocery items (bulk clear).

### GET /api/essays
Returns all essays ordered by `updated_at` desc.

### GET /api/essays/:id
Returns a single essay.

### PATCH /api/essays/:id
Update essay fields via `rpc_update_entity`.

### GET /api/crm/companies
Returns all companies ordered by `name`.

### GET /api/crm/people
Returns all people ordered by `name`.

### GET /api/crm/deals
Returns all deals ordered by `created_at` desc.

---

## Admin (superadmin only)

### GET /api/admin/users
Returns all workspace members (humans only).

### PATCH /api/admin/users/:id
```json
{ "avatar_url": "https://..." }
```

### GET /api/admin/settings
Returns workspace settings: `name`, `openrouter_api_key`, `default_model`.

### PATCH /api/admin/settings
```json
{
  "name": "Hunter's Workspace",
  "openrouter_api_key": "sk-or-...",
  "default_model": "openai/gpt-4o-mini"
}
```

### GET /api/admin/settings/models
Returns available OpenRouter models: `[ { "id": "...", "name": "..." } ]`

### POST /api/admin/agents
Create an agent. Returns `{ "agent": {...}, "apiKey": "<plaintext — shown once>" }`.

```json
{
  "name": "Lucy",
  "avatar_url": "https://..."
}
```

### DELETE /api/admin/agents/:id
Revokes the agent (sets `revoked_at`).

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
