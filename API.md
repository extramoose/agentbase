# AgentBase API Reference

All routes are available at the deployment URL (e.g. `https://agentbase.vercel.app`).

## Authentication

**Agents** authenticate with an API key issued from Admin → Agents.

```
Authorization: Bearer <api_key>
```

**Humans** authenticate via cookie session (browser only — do not send Bearer tokens from browsers).

All mutating endpoints (`POST`, `PATCH`, `DELETE`) attribute actions to the authenticated actor. `actor_id` and `actor_type` are resolved server-side — do not send them in request bodies.

---

## Commands (agent-optimized mutation API)

These two routes are the primary interface for agents. They handle any entity update or comment without needing entity-specific routes.

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

**`table`** — one of: `tasks`, `meetings`, `library_items`, `diary_entries`, `grocery_items`, `companies`, `people`, `deals`

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

## Tasks

### GET /api/tasks
Returns all tasks in the workspace, ordered by `sort_order` then `created_at` desc.

**Response:** `{ "data": [ ...tasks ] }`

**Task fields:**
```
id              uuid
tenant_id       uuid
title           text
body            text | null
status          text  — todo | in_progress | done | blocked | cancelled
priority        text  — urgent | high | medium | low | none
assignee        text | null
due_date        date | null   (YYYY-MM-DD)
tags            string[]
source_meeting_id  uuid | null
sort_order      integer
ticket_id       integer | null
created_at      timestamptz
updated_at      timestamptz
```

### POST /api/tasks
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
- `priority` default: `"medium"`
- `status` default: `"todo"`

**Response:** `{ "data": { ...task } }` — HTTP 201

### DELETE /api/tasks/:id
Delete a task.

**Response:** `{ "success": true }`

---

## Meetings

### GET /api/meetings
Returns all meetings ordered by `date` desc.

**Meeting fields:**
```
id              uuid
tenant_id       uuid
title           text
date            date | null
meeting_time    text | null
status          text  — upcoming | in_meeting | ended | closed
live_notes      text | null
summary         text | null
proposed_tasks  jsonb | null
tags            string[]
created_at      timestamptz
updated_at      timestamptz
```

### POST /api/meetings
```json
{
  "title": "Weekly sync",
  "date": "2026-03-01",
  "meeting_time": "10:00",
  "tags": ["work"]
}
```

### DELETE /api/meetings/:id

### POST /api/meetings/:id/summarize
Triggers AI summary generation using the workspace's configured OpenRouter model. Returns `{ "summary": "..." }`.

### POST /api/meetings/:id/suggest-tasks
Generates suggested follow-up tasks from meeting notes. Returns `{ "tasks": [...] }`.

---

## Library

### GET /api/library
Returns all library items ordered by `created_at` desc.

**Item types:** `favorite` | `flag` | `restaurant` | `note` | `idea` | `article`

**Library item fields:**
```
id              uuid
tenant_id       uuid
type            text
title           text
url             text | null
source          text | null
excerpt         text | null
body            text | null
location_name   text | null
latitude        numeric | null
longitude       numeric | null
tags            string[]
is_public       boolean
created_at      timestamptz
updated_at      timestamptz
```

### POST /api/library
```json
{
  "type": "note",
  "title": "Van maintenance log",
  "body": "Replaced brake pads...",
  "tags": ["van", "maintenance"],
  "is_public": false
}
```

### DELETE /api/library/:id

---

## Diary

### GET /api/diary
Returns all diary entries ordered by `date` desc.

**Diary entry fields:**
```
id              uuid
tenant_id       uuid
date            date   (YYYY-MM-DD)
content         text
created_at      timestamptz
updated_at      timestamptz
```

### GET /api/diary/:date
Returns a single diary entry for `YYYY-MM-DD`. Returns `{ "data": null }` if none exists.

### POST /api/diary
Upserts (creates or replaces) the entry for the given date.

```json
{
  "date": "2026-02-26",
  "content": "Today I..."
}
```

---

## Grocery

### GET /api/grocery
Returns all grocery items ordered by `sort_order` then `created_at`.

**Grocery item fields:**
```
id              uuid
tenant_id       uuid
name            text
category        text | null
quantity        text | null
checked         boolean
sort_order      integer
created_at      timestamptz
updated_at      timestamptz
```

### POST /api/grocery
```json
{
  "name": "Oat milk",
  "category": "Dairy",
  "quantity": "2"
}
```

### DELETE /api/grocery/:id

### DELETE /api/grocery
Delete all checked items (bulk clear).

---

## CRM

### Companies

#### GET /api/crm/companies
Returns all companies ordered by `name`.

**Company fields:**
```
id              uuid
tenant_id       uuid
name            text
domain          text | null
industry        text | null
notes           text | null
tags            string[]
created_at      timestamptz
updated_at      timestamptz
```

#### POST /api/crm/companies
```json
{
  "name": "Acme Corp",
  "domain": "acme.com",
  "industry": "Software",
  "notes": "Met at SaaStr",
  "tags": ["prospect"]
}
```

#### DELETE /api/crm/companies/:id

---

### People

#### GET /api/crm/people
Returns all people ordered by `name`.

**Person fields:**
```
id              uuid
tenant_id       uuid
name            text
email           text | null
phone           text | null
title           text | null
notes           text | null
tags            string[]
created_at      timestamptz
updated_at      timestamptz
```

#### POST /api/crm/people
```json
{
  "name": "Jane Smith",
  "email": "jane@acme.com",
  "phone": "+1 555 0100",
  "title": "CTO",
  "tags": ["investor"]
}
```

#### DELETE /api/crm/people/:id

---

### Deals

#### GET /api/crm/deals
Returns all deals ordered by `created_at` desc.

**Deal fields:**
```
id              uuid
tenant_id       uuid
title           text
status          text  — prospect | active | won | lost
value           numeric | null
notes           text | null
tags            string[]
created_at      timestamptz
updated_at      timestamptz
```

#### POST /api/crm/deals
```json
{
  "title": "Acme Enterprise",
  "status": "prospect",
  "value": 50000,
  "notes": "Intro call scheduled"
}
```

#### DELETE /api/crm/deals/:id

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
