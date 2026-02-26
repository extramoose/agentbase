# AgentBase — Technical Plan

> Multi-agent, multi-tenant Life OS platform.
> Replaces HAH Toolbox over time. Fully independent systems — HAH Toolbox stays live during the build.

---

## 1. Project Overview

AgentBase is a greenfield "Life OS" — a personal productivity platform where human users and AI agents (Lucy, Frank) collaborate on tasks, meetings, CRM, notes, diary, and grocery lists. Every mutation flows through a typed command bus, every change is recorded in a unified activity log, and every surface is multi-tenant with strict user isolation via RLS.

**Domain:** Configurable via `NEXT_PUBLIC_APP_DOMAIN` env var (default: `agentbase.hah.to`).
**Repo:** `git@github.com:extramoose/agentbase.git`
**Self-deployable:** Anyone clones, fills `.env.local`, deploys to Vercel.

---

## 2. Tech Stack & Rationale

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Next.js 15** (App Router) | Server components, API routes, middleware — all in one. App Router is the current standard. |
| Database / Auth / Realtime | **Supabase** (Postgres + Auth + Realtime) | Proven in HAH Toolbox. RLS, realtime subscriptions, Google OAuth all built in. Self-hostable. |
| Styling | **Tailwind CSS v4** | Utility-first, consistent with HAH Toolbox. v4 for CSS-first config and improved performance. |
| Component library | **shadcn/ui** (used to its full extent) | Copy-paste components, fully customizable, Tailwind-native. No runtime dependency. |
| Language | **TypeScript strict** | `strict: true` in tsconfig. No `any` escape hatches. |
| Package manager | **pnpm** | Fast, disk-efficient, workspace-ready. Same as HAH Toolbox. |
| Rich text | **Tiptap** | Already proven in HAH Toolbox tasks + meetings. Headless, extensible. |
| Drag & drop | **@dnd-kit** | Used in HAH Toolbox for task reordering. Accessible, composable. |

**What changes from HAH Toolbox and why:**

- **Command bus (new):** HAH Toolbox has ad-hoc Supabase client calls scattered across components. AgentBase routes all mutations through Next.js API routes so agents (external HTTP clients) and browsers use the same path.
- **Real agent auth (new):** HAH Toolbox uses `SET LOCAL app.current_actor` for agent attribution — fragile, service-role-dependent. AgentBase gives agents real Supabase Auth users with hand-signed JWTs.
- **Multi-tenancy (new):** HAH Toolbox is single-user. AgentBase scopes all data by `user_id` via RLS from day one.
- **Componentized edit shelf (new):** HAH Toolbox's task shelf is a monolithic 900+ line component. AgentBase has a universal `<EditShelf>` with a pluggable content slot and a shared `<ActivityAndComments>` section.

---

## 3. Architecture Overview

### 3.1 Command Bus

Every mutation goes through one of two paths — both are standard Next.js API routes (NOT server actions, because agents in Docker containers need to call them via HTTP).

#### Semantic Actions

Named mutations that emit typed history events. Each has its own API route handler.

```
POST /api/commands/{action}
Authorization: Bearer <session-cookie-or-agent-jwt>
Content-Type: application/json

{ ...action-specific payload }
```

Examples: `createTask`, `changeTaskStatus`, `addComment`, `closeMeeting`, `acceptSuggestedTask`, `createDeal`, `checkGroceryItem`.

Each semantic action:
1. Validates input (Zod schema)
2. Resolves actor from auth (`auth.uid()`)
3. Performs the DB mutation
4. Writes a typed event to `activity_log` in the same transaction
5. Returns `{ success: true, data: {...}, event: {...} }`

**Idempotency:** Agents are Docker containers hitting HTTP endpoints. Network retries will happen. All create commands accept an optional `idempotency_key` field (UUID or string, max 128 chars). The implementation uses an `idempotency_keys` table (see §5): before inserting, check if the key exists — if yes, return the stored response; if no, proceed with the insert and store `(key, response)` in the table. A Postgres cron job or TTL trigger purges entries older than 24 hours. Idempotency keys are optional — browser callers don't need them. Only agents should send them.

**Rate limiting:** All command handlers run behind per-actor rate limiting middleware (see Phase 1 in §10). Limit: 60 requests/minute per `actor_id`. This protects against runaway agents burning Vercel/Supabase quotas.

**Atomicity via Postgres RPC.** Every semantic command handler does two things: (1) resolve the actor, (2) call a Postgres RPC function. The RPC function does the entity mutation AND the activity_log INSERT inside a single PL/pgSQL function — one network round-trip, one database transaction, guaranteed atomicity. If the entity update fails, no activity event is written. If the activity insert fails, the entity update is rolled back. There is no failure mode where these get out of sync.

This is also what makes the platform transparent to agents. An agent calls `POST /api/commands/change-task-status` with a task ID and new status. It gets back a result. It never knows activity_log exists. The platform captures all context — who, what, when, old value, new value — automatically.

#### Generic Field Updates

Schema-agnostic patch for any entity. New fields on any entity just work without writing new API code.

```
PATCH /api/commands/update
Authorization: Bearer <session-cookie-or-agent-jwt>
Content-Type: application/json

{
  "table": "tasks",
  "id": "uuid",
  "fields": { "title": "New title", "body": "Updated body" }
}
```

- Validates `table` against an allowlist
- Validates `id` exists and belongs to the requesting user
- Calls `rpc_update_entity(table_name, entity_id, fields jsonb, actor_id uuid, user_id uuid)` — a Postgres function that runs `UPDATE {table} SET ... WHERE id = entity_id AND user_id = user_id` and `INSERT INTO activity_log (...)` in one transaction
- Returns `{ success: true, data: {...} }`

#### Auth Resolution in API Routes

Every API route handler:
1. Reads the `Authorization` header
2. If it's a Supabase session cookie → creates a Supabase client with the cookie (same as browser)
3. If it's a `Bearer <jwt>` → verifies the JWT, creates a Supabase client with the JWT
4. In both cases, `auth.uid()` resolves correctly for RLS and trigger attribution

```typescript
// lib/api/auth.ts
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";

export async function resolveActor(request: Request) {
  const authHeader = request.headers.get("authorization");

  // Case 1: Agent JWT (Bearer token)
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    // Verify it's a valid JWT signed with our secret
    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    // Create a Supabase client that authenticates as this user
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    return {
      supabase,
      actorId: payload.sub as string,
      actorType: "agent" as const,
    };
  }

  // Case 2: Browser session (cookie-based)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return {
    supabase,
    actorId: user.id,
    actorType: "human" as const,
  };
}
```

### 3.2 Activity Log

Single table. All entity types. All actors.

```sql
CREATE TABLE activity_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  actor_id    uuid NOT NULL REFERENCES auth.users(id),
  actor_type  text NOT NULL CHECK (actor_type IN ('human', 'agent', 'platform')),
  event_type  text NOT NULL,
  payload     jsonb,
  created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_activity_log_entity ON activity_log (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_activity_log_actor  ON activity_log (actor_id, created_at DESC);
CREATE INDEX idx_activity_log_user   ON activity_log (user_id, created_at DESC);
CREATE INDEX idx_activity_log_time   ON activity_log (created_at DESC);
```

`user_id` is the data owner — the human user whose data this event pertains to. `actor_id` is who performed the action. These can differ: Frank (actor) creates a task for Hunter (owner). The command bus knows the owner at write time, so we denormalize it directly onto the table instead of computing it via subqueries at read time.

**Event types** (extensible, not enum — allows new types without migration):
- `created`, `updated`, `deleted`
- `status_changed`, `priority_changed`, `assignee_changed`
- `commented`
- `tag_added`, `tag_removed`
- Entity-specific: `meeting_started`, `meeting_closed`, `task_accepted`, `item_checked`, `item_unchecked`

**Payload examples:**
```jsonc
// status_changed
{ "field": "status", "old_value": "todo", "new_value": "in_progress" }

// commented
{ "comment_body": "This looks good, let's ship it." }

// updated (generic)
{ "fields": ["title", "body"] }

// created
{ "title": "New task title" }
```

**Key difference from HAH Toolbox:** The old `activity_log` used `author` as a text string (`"hunter"`, `"frank"`) and had no `user_id` scoping. AgentBase uses `actor_id` as a real FK to `auth.users`, enabling proper RLS and multi-tenant filtering. Actor display names are resolved client-side from a profiles lookup.

### 3.3 Action → Activity → Toast → Realtime Pipeline

One event, four surfaces. This is the core loop of the entire application.

```
User/Agent fires command
        │
        ▼
  API Route Handler
        │
        ├─► Write to entity table (INSERT/UPDATE/DELETE)
        │
        ├─► Write to activity_log (same transaction)
        │
        ▼
  Return response to caller
        │
        ├─► Caller shows toast (immediate feedback)
        │
        ▼
  Supabase Realtime fires
        │
        ├─► activity_log INSERT subscription → updates ActivityFeed components
        │
        └─► Entity table UPDATE subscription → updates list views / detail views
```

**Client-side wiring:**

```typescript
// hooks/use-activity-subscription.ts
// Single subscription to activity_log for the current entity
const channel = supabase
  .channel(`activity:${entityType}:${entityId}`)
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "activity_log",
      filter: `entity_type=eq.${entityType},entity_id=eq.${entityId}`,
    },
    (payload) => {
      // Append to local activity list
      // Fire toast if actor is not the current user
    }
  )
  .subscribe();
```

**Toast behavior:**
- The actor who triggered the command gets an immediate optimistic toast from the API response (not from realtime).
- Other users viewing the same entity get a toast from the realtime subscription ("Frank changed status to done").
- Toast shows entity label + link to open the entity.

### 3.4 Multi-Tenancy & RLS Model

**Core principle:** All data is scoped by `user_id`. No cross-user reads, ever.

Every entity table has:
```sql
user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id)
```

Every entity table has these RLS policies:
```sql
-- Users can only see their own data
CREATE POLICY "Users read own" ON {table}
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own data
CREATE POLICY "Users insert own" ON {table}
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own data
CREATE POLICY "Users update own" ON {table}
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can only delete their own data
CREATE POLICY "Users delete own" ON {table}
  FOR DELETE USING (auth.uid() = user_id);
```

**Agent access:** Agents (Lucy, Frank) are real Supabase Auth users. They operate within their owner's scope. This requires a mapping:

```sql
CREATE TABLE agent_owners (
  agent_id uuid NOT NULL REFERENCES auth.users(id),
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (agent_id)
);
```

RLS policies for agent-writable tables need an additional clause:
```sql
-- Agents can read/write data belonging to their owner
CREATE POLICY "Agents access owner data" ON {table}
  FOR ALL USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM agent_owners
      WHERE agent_owners.agent_id = auth.uid()
      AND agent_owners.owner_id = {table}.user_id
    )
  );
```

In practice, this means the per-table policies combine both clauses:
```sql
CREATE POLICY "Owner or agent read" ON tasks
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
```

**Agent writes and user_id:** When an agent creates a record, we need the `user_id` to be the owner, not the agent. The command bus API route handles this: it looks up the agent's owner from `agent_owners` and explicitly sets `user_id` to the owner's ID.

**Admin access:** Admin users can read all data (for the admin panel). Admin policies:
```sql
CREATE POLICY "Admins read all" ON {table}
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );
```

**Invite model:** Admin creates users. No self-signup. Admin panel has a "Users" section for managing invites.

### 3.5 Agent Service Accounts

Lucy and Frank get real Supabase Auth users. Here's exactly how to set them up.

#### Step 1: Create the auth users

Use the Supabase Management API or dashboard to create users:

```sql
-- Via Supabase SQL editor (or migration)
-- These are created as Supabase Auth users, not just profile rows

-- After creating them via supabase.auth.admin.createUser():
-- lucy@internal.hah.to → gets UUID (e.g., aaaaaaaa-1111-...)
-- frank@internal.hah.to → gets UUID (e.g., bbbbbbbb-2222-...)
```

```typescript
// scripts/create-agent-users.ts (run once)
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createAgentUser(email: string, name: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name, is_agent: true },
  });
  if (error) throw error;
  console.log(`Created ${name}: ${data.user.id}`);
  return data.user.id;
}

const lucyId = await createAgentUser("lucy@internal.hah.to", "Lucy");
const frankId = await createAgentUser("frank@internal.hah.to", "Frank");

// Map agents to their owner
// (Run after the owner user has signed up)
const OWNER_ID = "..."; // Hunter's user_id after he signs up
await supabase.from("agent_owners").insert([
  { agent_id: lucyId, owner_id: OWNER_ID },
  { agent_id: frankId, owner_id: OWNER_ID },
]);
```

#### Step 2: Generate long-lived JWTs

Hand-sign JWTs using the Supabase JWT secret (HS256). JWTs are signed with 90-day expiry (not 10 years). A refresh script (`scripts/refresh-agent-jwts.ts`) regenerates and re-stores them before expiry. Set a calendar reminder or cron job to run this every 60 days.

```typescript
// scripts/generate-agent-jwt.ts
import * as jose from "jose";

const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);

async function generateAgentJWT(userId: string, email: string) {
  const jti = crypto.randomUUID(); // Unique JWT ID for revocation tracking
  const jwt = await new jose.SignJWT({
    sub: userId,
    email,
    role: "authenticated",
    iss: "supabase",
    aud: "authenticated",
    jti, // Store this alongside the token for easy revocation if needed
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(secret);

  console.log(`JWT for ${email} (jti: ${jti}):\n${jwt}\n`);
  return { jwt, jti };
}

await generateAgentJWT(LUCY_USER_ID, "lucy@internal.hah.to");
await generateAgentJWT(FRANK_USER_ID, "frank@internal.hah.to");
```

Store these JWTs as environment variables in the agent containers:
```
LUCY_JWT=eyJhbGci...
FRANK_JWT=eyJhbGci...
```

#### Token Revocation

**Token revocation:** A `revoked_agent_tokens` table (see §5) stores revoked token JTIs (`jti text PRIMARY KEY, revoked_at timestamptz`). The `resolveActor()` function checks this table on every request for agent JWTs. To revoke a token: insert its `jti` claim. This avoids the nuclear option of rotating `SUPABASE_JWT_SECRET` (which invalidates all tokens including legitimate ones).

Hand-sign agent JWTs with a unique `jti` (UUID). Store the `jti` in `openclaw.json` alongside the token for easy reference if revocation is needed.

#### Step 3: RLS policies that work for agents

Because agents are real `authenticated` users, `auth.uid()` resolves to their UUID. The RLS policies in §3.4 handle this via the `agent_owners` table — no special exceptions needed. The agent's UUID is in `agent_owners.agent_id`, and the policy checks if the data's `user_id` matches the agent's `owner_id`.

**Policies that reference agent UUIDs directly (none needed):** The `agent_owners` join handles all access control. No hardcoded UUIDs in policies.

**activity_log writes:** Agents need INSERT on `activity_log`:
```sql
CREATE POLICY "Authenticated users insert activity" ON activity_log
  FOR INSERT WITH CHECK (auth.uid() = actor_id);
```

This works for both humans and agents because `actor_id` is always `auth.uid()` of the caller.

---

## 4. Real-Time Strategy

### Where Realtime Is High-Value (Subscribe)

| Surface | Subscription | Why |
|---------|-------------|-----|
| **Tasks list** | `postgres_changes` on `tasks` filtered by `user_id` | Agents frequently create/update tasks. Humans need to see changes immediately. Core workflow surface. |
| **Task EditShelf → ActivityAndComments** | `postgres_changes` on `activity_log` filtered by `entity_type=task, entity_id=X` | Comments and status changes appear live while shelf is open. |
| **Meetings detail** | `postgres_changes` on `meetings` filtered by `id=X` | During live meetings, agent writes meeting_summary, proposed_tasks. Must appear without refresh. |
| **Meeting EditShelf → ActivityAndComments** | Same as task shelf | Same pattern. |
| **Global History page** | `postgres_changes` on `activity_log` filtered by actor's `user_id` scope | The "everything" feed. New events stream in live. |
| **Grocery list** | `postgres_changes` on `grocery_items` filtered by `user_id` | Shared between user + agent. Checking items off should sync instantly. |

### Where Realtime Is Overkill (Don't Subscribe)

| Surface | Strategy | Why |
|---------|----------|-----|
| **Diary** | Fetch on mount. No subscription. | Written once per day by Lucy. User reads it. No collaboration. No urgency. |
| **Library list** | Fetch on mount + optimistic update on own writes. | Low-frequency writes. User adds items manually. Agent enrichment is rare. Not worth a persistent connection. |
| **CRM lists (Companies, People, Deals)** | Fetch on mount + refetch on shelf close. | Low-frequency. Enrichment by agents happens in background — a page refresh or shelf-close refetch is sufficient. |
| **CRM EditShelf → ActivityAndComments** | Subscribe only while shelf is open. | Worth it — comments are collaborative. But the list itself doesn't need live updates. |
| **Settings / Admin** | No subscription. | Static config screens. |

### Subscription Strategy

**Per-table, user-filtered subscriptions.** NOT one global subscription.

```typescript
// Each page that needs realtime creates a targeted subscription:
supabase
  .channel("tasks-list")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "tasks",
    filter: `user_id=eq.${userId}`,
  }, handler)
  .subscribe();
```

**Why per-table, not per-entity:** Supabase Realtime filters are applied server-side, so a `user_id=eq.X` filter means only events for that user's data are sent. This is both efficient and secure (no data leaks).

**Why not one global subscription:** Different surfaces need different update handlers. A task list update handler differs from a meeting detail handler. Multiplexing onto one channel adds complexity with no benefit — Supabase Realtime handles multiple channels efficiently.

**Subscription lifecycle:** Channels are created in `useEffect` hooks and cleaned up on unmount. The `EditShelf` subscribes to `activity_log` for the current entity on open, unsubscribes on close.

### Cost / Complexity Analysis

**Supabase Realtime pricing (as of 2026):** Included in Pro plan. Concurrent connections are the main limit (500 on Pro, 10,000 on Team). AgentBase is a small-user-count app — we'll never hit connection limits.

**Complexity cost:** Each realtime subscription requires:
1. A `useEffect` for setup/teardown (~15 lines)
2. A handler that merges remote data into local state (~10 lines)
3. Deduplication logic for optimistic updates (~5 lines)

This is manageable for 6-8 surfaces. The hook `useRealtimeSubscription(table, filter, handler)` abstracts the boilerplate.

**The one tricky bit: optimistic updates + realtime.** When a user changes a task status, the UI updates optimistically. Then the realtime subscription fires with the same change. We need to deduplicate:

```typescript
// Track pending optimistic IDs
const pendingRef = useRef<Set<string>>(new Set());

function handleOptimisticUpdate(id: string, changes: Partial<Task>) {
  pendingRef.current.add(id);
  setTasks(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
}

function handleRealtimeUpdate(payload: RealtimePayload) {
  const id = payload.new.id;
  if (pendingRef.current.has(id)) {
    pendingRef.current.delete(id);
    return; // Already applied optimistically
  }
  setTasks(prev => prev.map(t => t.id === id ? payload.new : t));
}
```

---

## 5. Database Schema

Full SQL for all tables, indexes, constraints, triggers, and RLS policies.

### Profiles

```sql
-- Auto-created on user signup via trigger
CREATE TABLE profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  full_name  text,
  avatar_url text,
  role       text NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin', 'admin', 'user')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins read all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))
  );
CREATE POLICY "Users update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RPC for reliable profile fetch (avoids RLS timing issues in server components)
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS profiles AS $$
  SELECT * FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;
```

### Agent Owners

```sql
CREATE TABLE agent_owners (
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id)
);

ALTER TABLE agent_owners ENABLE ROW LEVEL SECURITY;

-- Only superadmins can manage agent ownership
CREATE POLICY "Superadmins manage agent_owners" ON agent_owners
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Agents can read their own mapping (to resolve owner_id)
CREATE POLICY "Agents read own mapping" ON agent_owners
  FOR SELECT USING (auth.uid() = agent_id);
```

### Global Tags

```sql
CREATE TABLE tags (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own tags" ON tags
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Users insert own tags" ON tags
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );

-- Unique per user (same tag name can exist for different users)
-- Replace the global UNIQUE with a composite unique
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_key;
CREATE UNIQUE INDEX idx_tags_name_user ON tags (user_id, name);
```

### Tasks

```sql
CREATE SEQUENCE tasks_ticket_id_seq;

CREATE TABLE tasks (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  title             text NOT NULL,
  body              text,
  status            text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'blocked', 'done')),
  priority          text NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  assignee          text DEFAULT 'unassigned',
  due_date          date,
  tags              text[] NOT NULL DEFAULT '{}',
  ticket_id         integer NOT NULL DEFAULT nextval('tasks_ticket_id_seq') UNIQUE,
  source_meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_user_status ON tasks (user_id, status);
CREATE INDEX idx_tasks_user_priority ON tasks (user_id, priority);
CREATE INDEX idx_tasks_due_date ON tasks (user_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_tags ON tasks USING gin (tags);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tasks owner or agent select" ON tasks
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Tasks owner or agent insert" ON tasks
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Tasks owner or agent update" ON tasks
  FOR UPDATE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Tasks owner or agent delete" ON tasks
  FOR DELETE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Admins read all tasks" ON tasks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );
```

### Meetings

```sql
CREATE TABLE meetings (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  title           text NOT NULL,
  date            date NOT NULL,
  meeting_time    text,
  status          text NOT NULL DEFAULT 'upcoming'
                    CHECK (status IN ('upcoming', 'in_meeting', 'ended', 'closed')),
  live_notes      text,
  agent_notes     text,
  transcript      text,
  proposed_tasks  jsonb DEFAULT '[]'::jsonb,
  tags            text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meetings_user_date ON meetings (user_id, date DESC);
CREATE INDEX idx_meetings_user_status ON meetings (user_id, status);
CREATE INDEX idx_meetings_tags ON meetings USING gin (tags);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Meetings owner or agent select" ON meetings
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Meetings owner or agent insert" ON meetings
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Meetings owner or agent update" ON meetings
  FOR UPDATE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Meetings owner or agent delete" ON meetings
  FOR DELETE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Admins read all meetings" ON meetings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- Join table: meetings ↔ people
CREATE TABLE meetings_people (
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, person_id)
);

ALTER TABLE meetings_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Meetings_people via meeting ownership" ON meetings_people
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
      AND m.user_id = auth.uid()
    )
  );

-- Join table: meetings ↔ companies
CREATE TABLE meetings_companies (
  meeting_id  uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, company_id)
);

ALTER TABLE meetings_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Meetings_companies via meeting ownership" ON meetings_companies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
      AND m.user_id = auth.uid()
    )
  );
```

### Library Items

```sql
CREATE TABLE library_items (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  type         text NOT NULL CHECK (type IN ('note', 'idea', 'article', 'restaurant', 'favorite', 'flag')),
  title        text NOT NULL,
  description  text,
  url          text,
  source       text,
  excerpt      text,
  location_lat numeric,
  location_lng numeric,
  is_public    boolean NOT NULL DEFAULT false,
  tags         text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_library_user_type ON library_items (user_id, type);
CREATE INDEX idx_library_tags ON library_items USING gin (tags);
CREATE INDEX idx_library_public ON library_items (is_public) WHERE is_public = true;

ALTER TABLE library_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Library owner or agent select" ON library_items
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
    OR is_public = true
  );
CREATE POLICY "Library owner or agent insert" ON library_items
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Library owner or agent update" ON library_items
  FOR UPDATE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Library owner or agent delete" ON library_items
  FOR DELETE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Admins read all library items" ON library_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );
```

### Diary Entries

```sql
CREATE TABLE diary_entries (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  date       date NOT NULL,
  summary    text,
  content    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX idx_diary_user_date ON diary_entries (user_id, date DESC);

ALTER TABLE diary_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Diary owner or agent select" ON diary_entries
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Diary owner or agent insert" ON diary_entries
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Diary owner or agent update" ON diary_entries
  FOR UPDATE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Admins read all diary" ON diary_entries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );
```

### Grocery Items

```sql
CREATE TABLE grocery_items (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  name       text NOT NULL,
  quantity   numeric,
  unit       text,
  category   text,
  is_checked boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_grocery_user ON grocery_items (user_id, sort_order);

ALTER TABLE grocery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Grocery owner or agent select" ON grocery_items
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Grocery owner or agent insert" ON grocery_items
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Grocery owner or agent update" ON grocery_items
  FOR UPDATE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Grocery owner or agent delete" ON grocery_items
  FOR DELETE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
```

### CRM — Companies

```sql
CREATE TABLE companies (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  name        text NOT NULL,
  domain      text,
  description text,
  tags        text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_user ON companies (user_id);
CREATE INDEX idx_companies_tags ON companies USING gin (tags);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies owner or agent select" ON companies
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Companies owner or agent insert" ON companies
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Companies owner or agent update" ON companies
  FOR UPDATE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Companies owner or agent delete" ON companies
  FOR DELETE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Admins read all companies" ON companies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );
```

### CRM — People

```sql
CREATE TABLE people (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  name       text NOT NULL,
  email      text,
  role       text,
  notes      text,
  tags       text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_people_user ON people (user_id);
CREATE INDEX idx_people_tags ON people USING gin (tags);

ALTER TABLE people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "People owner or agent select" ON people
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "People owner or agent insert" ON people
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "People owner or agent update" ON people
  FOR UPDATE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "People owner or agent delete" ON people
  FOR DELETE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Admins read all people" ON people
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- Join table: people ↔ companies
CREATE TABLE people_companies (
  person_id  uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       text,
  PRIMARY KEY (person_id, company_id)
);

ALTER TABLE people_companies ENABLE ROW LEVEL SECURITY;

-- RLS via join to parent tables (person must belong to user)
CREATE POLICY "People_companies via person ownership" ON people_companies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE people.id = people_companies.person_id
      AND (
        people.user_id = auth.uid()
        OR people.user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
      )
    )
  );
```

### CRM — Deals

```sql
CREATE TABLE deals (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  title      text NOT NULL,
  status     text NOT NULL DEFAULT 'lead'
               CHECK (status IN ('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  value      numeric,
  notes      text,
  tags       text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deals_user ON deals (user_id);
CREATE INDEX idx_deals_user_status ON deals (user_id, status);
CREATE INDEX idx_deals_tags ON deals USING gin (tags);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deals owner or agent select" ON deals
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Deals owner or agent insert" ON deals
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Deals owner or agent update" ON deals
  FOR UPDATE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Deals owner or agent delete" ON deals
  FOR DELETE USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );
CREATE POLICY "Admins read all deals" ON deals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- Join table: deals ↔ companies
CREATE TABLE deals_companies (
  deal_id    uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, company_id)
);

ALTER TABLE deals_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deals_companies via deal ownership" ON deals_companies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = deals_companies.deal_id
      AND (
        deals.user_id = auth.uid()
        OR deals.user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
      )
    )
  );

-- Join table: deals ↔ people
CREATE TABLE deals_people (
  deal_id   uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, person_id)
);

ALTER TABLE deals_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deals_people via deal ownership" ON deals_people
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = deals_people.deal_id
      AND (
        deals.user_id = auth.uid()
        OR deals.user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
      )
    )
  );
```

### Activity Log

```sql
CREATE TABLE activity_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  actor_id    uuid NOT NULL REFERENCES auth.users(id),
  actor_type  text NOT NULL CHECK (actor_type IN ('human', 'agent', 'platform')),
  event_type  text NOT NULL,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_log_entity ON activity_log (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_activity_log_actor  ON activity_log (actor_id, created_at DESC);
CREATE INDEX idx_activity_log_user   ON activity_log (user_id, created_at DESC);
CREATE INDEX idx_activity_log_time   ON activity_log (created_at DESC);

-- Composite index for realtime subscription filtering
-- (Supabase Realtime uses the filter to decide which rows to broadcast)
CREATE INDEX idx_activity_log_entity_pair ON activity_log (entity_type, entity_id);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- RLS: identical to all other tables — simple user_id check, no subqueries needed
CREATE POLICY "Activity owner or agent select" ON activity_log
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
  );

CREATE POLICY "Admins read all activity" ON activity_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

CREATE POLICY "Authenticated insert activity" ON activity_log
  FOR INSERT WITH CHECK (auth.uid() = actor_id);

-- RPC for paginated activity log (SECURITY DEFINER for reliable access)
CREATE OR REPLACE FUNCTION get_activity_log(
  p_entity_type text DEFAULT NULL,
  p_entity_id   uuid DEFAULT NULL,
  p_actor_id    uuid DEFAULT NULL,
  p_event_type  text DEFAULT NULL,
  p_date_from   timestamptz DEFAULT NULL,
  p_search      text DEFAULT NULL,
  p_limit       integer DEFAULT 50,
  p_offset      integer DEFAULT 0
)
RETURNS SETOF activity_log AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
BEGIN
  -- Resolve owner if caller is an agent
  SELECT owner_id INTO v_owner_id FROM agent_owners WHERE agent_id = v_user_id;

  RETURN QUERY
  SELECT al.*
  FROM activity_log al
  WHERE
    -- Scope to user's data (simple user_id check — no entity joins needed)
    al.user_id = COALESCE(v_owner_id, v_user_id)
    -- Optional filters
    AND (p_entity_type IS NULL OR al.entity_type = p_entity_type)
    AND (p_entity_id   IS NULL OR al.entity_id   = p_entity_id)
    AND (p_actor_id    IS NULL OR al.actor_id     = p_actor_id)
    AND (p_event_type  IS NULL OR al.event_type   = p_event_type)
    AND (p_date_from   IS NULL OR al.created_at  >= p_date_from)
    AND (p_search      IS NULL OR al.payload::text ILIKE '%' || p_search || '%')
  ORDER BY al.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

### Command RPC Functions

```sql
-- Semantic command RPCs (each does entity mutation + activity_log INSERT atomically)
-- rpc_create_task(title, body, status, priority, assignee, due_date, tags, actor_id, user_id, idempotency_key)
-- rpc_change_task_status(task_id, new_status, actor_id, user_id)
-- rpc_create_meeting(title, date, meeting_time, tags, actor_id, user_id, idempotency_key)
-- rpc_change_meeting_status(meeting_id, new_status, actor_id, user_id)
-- rpc_accept_suggested_task(meeting_id, task_title, task_body, actor_id, user_id)
-- rpc_create_library_item(type, title, description, url, tags, is_public, actor_id, user_id, idempotency_key)
-- rpc_upsert_diary_entry(date, summary, content, actor_id, user_id)
-- rpc_add_grocery_item(name, quantity, unit, category, actor_id, user_id, idempotency_key)
-- rpc_check_grocery_item(item_id, is_checked, actor_id, user_id)
-- rpc_create_company(name, domain, description, tags, actor_id, user_id, idempotency_key)
-- rpc_create_person(name, email, role, notes, tags, actor_id, user_id, idempotency_key)
-- rpc_create_deal(title, status, value, notes, tags, actor_id, user_id, idempotency_key)
-- rpc_change_deal_status(deal_id, new_status, actor_id, user_id)
-- rpc_add_comment(entity_type, entity_id, entity_label, comment_body, actor_id, user_id)
-- rpc_update_entity(table_name, entity_id, fields jsonb, actor_id, user_id)  -- generic
```

These RPCs are defined in the initial migration. Each is a SECURITY DEFINER function so it can bypass RLS internally while still running in the caller's transaction context. The API route validates identity before calling — the RPC trusts the actor_id it receives.

### Triggers — Updated At

```sql
-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_meetings_updated_at
  BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_library_items_updated_at
  BEFORE UPDATE ON library_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_diary_entries_updated_at
  BEFORE UPDATE ON diary_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_companies_updated_at
  BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_people_updated_at
  BEFORE UPDATE ON people FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_deals_updated_at
  BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Idempotency Keys

```sql
CREATE TABLE idempotency_keys (
  key           text PRIMARY KEY,
  response_body jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Purge entries older than 24 hours (run via pg_cron or application-level cleanup)
-- If pg_cron is available:
--   SELECT cron.schedule('purge-idempotency-keys', '0 * * * *',
--     $$DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'$$);
-- Otherwise: call DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'
-- from a scheduled Vercel cron or similar.
```

No RLS needed — this table is only accessed from API route handlers via the service role, not directly by clients.

### Revoked Agent Tokens

```sql
CREATE TABLE revoked_agent_tokens (
  jti        text PRIMARY KEY,  -- JWT ID claim
  revoked_at timestamptz NOT NULL DEFAULT now(),
  reason     text
);
-- No RLS needed — only accessible via service role / SECURITY DEFINER function
```

### Enable Realtime

```sql
-- Enable Supabase Realtime on tables that need live subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE grocery_items;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
```

---

## 6. Command Bus API Routes

### File Structure

```
app/api/commands/
├── _lib/
│   ├── auth.ts          # resolveActor() — shared auth resolution
│   └── validate.ts      # Zod schemas + validation helpers
├── create-task/
│   └── route.ts
├── change-task-status/
│   └── route.ts
├── add-comment/
│   └── route.ts
├── create-meeting/
│   └── route.ts
├── change-meeting-status/
│   └── route.ts
├── accept-suggested-task/
│   └── route.ts
├── create-library-item/
│   └── route.ts
├── create-diary-entry/
│   └── route.ts
├── create-company/
│   └── route.ts
├── create-person/
│   └── route.ts
├── create-deal/
│   └── route.ts
├── change-deal-status/
│   └── route.ts
├── check-grocery-item/
│   └── route.ts
├── add-grocery-item/
│   └── route.ts
└── update/
    └── route.ts         # Generic field update
```

All semantic commands correspond to a named Postgres RPC function. The API route is thin: auth resolution + RPC call + response shaping.

### Example 1: `POST /api/commands/create-task`

```typescript
// app/api/commands/create-task/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveActor } from "../_lib/auth";

const schema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).default("todo"),
  priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  assignee: z.string().optional(),
  due_date: z.string().date().optional(),
  tags: z.array(z.string()).default([]),
  source_meeting_id: z.string().uuid().optional(),
  idempotency_key: z.string().max(128).optional(),
});

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, ownerId } = await resolveActor(request);
    const body = await request.json();
    const input = schema.parse(body);

    // Single atomic RPC — creates task + writes activity_log in one transaction
    const { data: task, error } = await supabase.rpc("rpc_create_task", {
      p_title: input.title,
      p_body: input.body ?? null,
      p_status: input.status,
      p_priority: input.priority,
      p_assignee: input.assignee ?? null,
      p_due_date: input.due_date ?? null,
      p_tags: input.tags,
      p_actor_id: actorId,
      p_user_id: ownerId,
      p_idempotency_key: input.idempotency_key ?? null,
    });

    if (error) throw error;

    return NextResponse.json({ success: true, data: task });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
```

**Request:**
```json
POST /api/commands/create-task
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "title": "Review Q3 financials",
  "priority": "high",
  "assignee": "hunter",
  "tags": ["finance", "quarterly"],
  "due_date": "2026-03-15"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "abc123...",
    "user_id": "owner-uuid",
    "title": "Review Q3 financials",
    "status": "todo",
    "priority": "high",
    "assignee": "hunter",
    "ticket_id": 42,
    "tags": ["finance", "quarterly"],
    "due_date": "2026-03-15",
    "created_at": "2026-02-25T10:30:00Z",
    "updated_at": "2026-02-25T10:30:00Z"
  }
}
```

### Example 2: `POST /api/commands/change-task-status`

```typescript
// app/api/commands/change-task-status/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveActor } from "../_lib/auth";

const schema = z.object({
  task_id: z.string().uuid(),
  status: z.enum(["todo", "in_progress", "blocked", "done"]),
});

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, ownerId } = await resolveActor(request);
    const body = await request.json();
    const { task_id, status } = schema.parse(body);

    // Single atomic RPC — updates status + writes activity_log (with old/new values) in one transaction
    const { data: task, error } = await supabase.rpc("rpc_change_task_status", {
      p_task_id: task_id,
      p_new_status: status,
      p_actor_id: actorId,
      p_user_id: ownerId,
    });

    if (error) throw error;

    return NextResponse.json({ success: true, data: task });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
```

**Request:**
```json
POST /api/commands/change-task-status
Authorization: Bearer <jwt>

{ "task_id": "abc123...", "status": "in_progress" }
```

**Response:**
```json
{
  "success": true,
  "data": { "id": "abc123...", "status": "in_progress", "..." : "..." }
}
```

### Example 3: `PATCH /api/commands/update` (Generic)

```typescript
// app/api/commands/update/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveActor } from "../_lib/auth";

const ALLOWED_TABLES = [
  "tasks", "meetings", "library_items", "diary_entries",
  "grocery_items", "companies", "people", "deals",
] as const;

const schema = z.object({
  table: z.enum(ALLOWED_TABLES),
  id: z.string().uuid(),
  fields: z.record(z.string(), z.unknown()).refine(
    (obj) => Object.keys(obj).length > 0,
    "At least one field required"
  ),
});

export async function PATCH(request: Request) {
  try {
    const { supabase, actorId, actorType, ownerId } = await resolveActor(request);
    const body = await request.json();
    const { table, id, fields } = schema.parse(body);

    // Prevent updating protected fields
    const PROTECTED_FIELDS = ["id", "user_id", "created_at", "ticket_id"];
    for (const key of PROTECTED_FIELDS) {
      if (key in fields) {
        return NextResponse.json(
          { success: false, error: `Cannot update protected field: ${key}` },
          { status: 400 }
        );
      }
    }

    // Single atomic RPC — updates entity + writes activity_log in one transaction
    const { data, error } = await supabase.rpc("rpc_update_entity", {
      p_table_name: table,
      p_entity_id: id,
      p_fields: fields,
      p_actor_id: actorId,
      p_user_id: ownerId,
    });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
```

**Request:**
```json
PATCH /api/commands/update
Authorization: Bearer <session-cookie>

{
  "table": "meetings",
  "id": "def456...",
  "fields": { "title": "Updated meeting title", "meeting_time": "3:00 PM" }
}
```

**Response:**
```json
{
  "success": true,
  "data": { "id": "def456...", "title": "Updated meeting title", "..." : "..." }
}
```

---

## 7. RLS Policy Design

### Summary Table

| Table | Owner Read | Owner Write | Agent Read | Agent Write | Admin Read | Public Read |
|-------|-----------|-------------|-----------|-------------|-----------|-------------|
| profiles | Own row | Own row | — | — | All rows | — |
| agent_owners | Own row (agent) | — | Own row | — | All (superadmin) | — |
| tags | Own | Insert | Via owner | Via owner | — | — |
| tasks | Own | Own | Via owner | Via owner | All | — |
| meetings | Own | Own | Via owner | Via owner | All | — |
| library_items | Own | Own | Via owner | Via owner | All | `is_public=true` |
| diary_entries | Own | Own | Via owner | Via owner | All | — |
| grocery_items | Own | Own | Via owner | Via owner | — | — |
| companies | Own | Own | Via owner | Via owner | All | — |
| people | Own | Own | Via owner | Via owner | All | — |
| deals | Own | Own | Via owner | Via owner | All | — |
| people_companies | Via person | Via person | Via person | Via person | — | — |
| deals_companies | Via deal | Via deal | Via deal | Via deal | — | — |
| deals_people | Via deal | Via deal | Via deal | Via deal | — | — |
| meetings_people | Via meeting | Via meeting | Via meeting | Via meeting | — | — |
| meetings_companies | Via meeting | Via meeting | Via meeting | Via meeting | — | — |
| activity_log | Own (`user_id`) | Insert (own actor_id) | Via owner | Insert (own actor_id) | All | — |

### The Agent Access Pattern (Used Everywhere)

Every entity RLS policy uses this pattern:
```sql
user_id = auth.uid()
OR user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
```

This is a subquery that runs once per policy evaluation. For performance, `agent_owners` is a tiny table (typically 2-3 rows total) with a PK index on `agent_id`. The subquery is effectively a single index lookup.

**Performance note:** If this subquery becomes a bottleneck (unlikely with <100 users), we can memoize it with `SET LOCAL` at the start of each request or use a materialized view. But for the expected scale, this is fine.

**Semantic command RPCs and RLS:** Semantic command RPCs are SECURITY DEFINER functions. They bypass RLS internally to perform mutations — which is intentional, because the API route has already validated actor identity. RLS still applies to all direct table reads.

### RLS on Join Tables

Join tables (people_companies, deals_companies, deals_people, meetings_people, meetings_companies) don't have `user_id` directly. They inherit access from their parent entity:

```sql
-- Example: people_companies
CREATE POLICY "..." ON people_companies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE people.id = people_companies.person_id
      AND (
        people.user_id = auth.uid()
        OR people.user_id IN (SELECT owner_id FROM agent_owners WHERE agent_id = auth.uid())
      )
    )
  );
```

---

## 8. Shared Component Library

### File List

```
components/
├── shared/
│   ├── edit-shelf.tsx
│   ├── activity-and-comments.tsx
│   ├── activity-feed.tsx
│   ├── comment-box.tsx
│   ├── combo-input.tsx
│   ├── tag-combobox.tsx
│   ├── status-control.tsx
│   ├── search-filter-bar.tsx
│   ├── rich-text-editor.tsx
│   └── toast-provider.tsx
├── app-shell.tsx
├── sidebar-nav.tsx
└── cmd-k.tsx
```

### Props Interface Sketches

#### `<EditShelf>`

```typescript
// components/shared/edit-shelf.tsx

interface EditShelfProps {
  /** Whether the shelf is open */
  isOpen: boolean;
  /** Called when the shelf should close (backdrop click, X button, Escape) */
  onClose: () => void;
  /** Title displayed in the shelf header */
  title: string;
  /** The entity type (for activity_log queries) */
  entityType: string;
  /** The entity ID (for activity_log queries) */
  entityId: string;
  /** The entity-specific content (task fields, meeting fields, etc.) */
  children: React.ReactNode;
  /** Optional actions to render in the header (e.g., delete button, status badge) */
  headerActions?: React.ReactNode;
  /** Width override. Default: "w-[480px]" */
  width?: string;
}

// Usage:
// <EditShelf isOpen={!!selectedTask} onClose={close} title={`#${task.ticket_id}`}
//            entityType="task" entityId={task.id}>
//   <TaskContent task={task} />
// </EditShelf>
//
// EditShelf renders:
// ┌─────────────────────────────┐
// │ Header: title + actions + X │
// ├─────────────────────────────┤
// │ {children}                  │  ← entity-specific content
// │                             │
// ├─────────────────────────────┤
// │ <ActivityAndComments />     │  ← always here, always same
// └─────────────────────────────┘
```

**Key improvement over HAH Toolbox:** In HAH Toolbox, the `RightShelf` is a generic container and each entity type manually includes `<ActivityFeed>`. In AgentBase, `EditShelf` always renders `<ActivityAndComments>` — you can't forget it.

#### `<ActivityAndComments>`

```typescript
// components/shared/activity-and-comments.tsx

interface ActivityAndCommentsProps {
  /** Entity type for activity_log queries */
  entityType: string;
  /** Entity ID for activity_log queries */
  entityId: string;
  /** Whether to show compact or full activity items. Default: true (compact) */
  compact?: boolean;
}

// Internally renders:
// - <CommentBox> at the top
// - <ActivityFeed> below (with realtime subscription)
// - Subscribes to activity_log INSERT events for this entity
// - Auto-scrolls on new events
```

#### `<ActivityFeed>`

```typescript
// components/shared/activity-feed.tsx

interface ActivityFeedProps {
  /** Entity type filter. If omitted, shows all types (global history). */
  entityType?: string;
  /** Entity ID filter. If omitted, shows all entities of the type. */
  entityId?: string;
  /** Compact mode (inside shelf) vs full mode (history page). Default: false */
  compact?: boolean;
  /** External entries (for optimistic updates from CommentBox) */
  externalEntries?: ActivityLogEntry[];
  /** Whether to subscribe to realtime updates. Default: true */
  realtime?: boolean;
}

type ActivityLogEntry = {
  id: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  actor_id: string;
  actor_type: "human" | "agent" | "platform";
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};
```

**Key improvement over HAH Toolbox:** The HAH Toolbox `ActivityFeed` has no realtime subscription — it fetches on mount and doesn't update until the page is refreshed. AgentBase's version subscribes to `activity_log` INSERT events and auto-appends new entries.

#### `<CommentBox>`

```typescript
// components/shared/comment-box.tsx

interface CommentBoxProps {
  /** Entity type */
  entityType: string;
  /** Entity ID */
  entityId: string;
  /** Called after a comment is successfully submitted */
  onCommentAdded?: (entry: ActivityLogEntry) => void;
}

// Features:
// - Textarea with Cmd+Enter to submit
// - Calls POST /api/commands/add-comment
// - Optimistic update: immediately calls onCommentAdded with temp entry
// - Shows current user avatar
```

#### `<ComboInput>`

```typescript
// components/shared/combo-input.tsx

interface ComboInputProps<T> {
  /** Current selected items */
  value: T[];
  /** Called when selection changes */
  onChange: (value: T[]) => void;
  /** Async function to search for options */
  search: (query: string) => Promise<T[]>;
  /** How to render each selected item as a chip */
  renderChip: (item: T) => React.ReactNode;
  /** How to render each option in the dropdown */
  renderOption: (item: T) => React.ReactNode;
  /** Extract a unique key from an item */
  getKey: (item: T) => string;
  /** Placeholder text */
  placeholder?: string;
  /** Allow creating new items */
  allowCreate?: boolean;
  /** Called when a new item is created */
  onCreate?: (query: string) => Promise<T>;
}

// Features:
// - Type to search, arrow keys to navigate, Enter to select
// - Escape to close dropdown
// - Backspace to remove last chip
// - Pluggable data sources (tags, people, companies)
```

#### `<TagCombobox>`

```typescript
// components/shared/tag-combobox.tsx

interface TagComboboxProps {
  /** Current tags */
  value: string[];
  /** Called when tags change */
  onChange: (tags: string[]) => void;
  /** User ID for scoped tag autocomplete */
  userId?: string;
}

// Wraps <ComboInput> with tag-specific behavior:
// - Searches the tags table for autocomplete
// - Creates new tags on the fly
// - Renders colored chips
```

#### `<StatusControl>`

```typescript
// components/shared/status-control.tsx

interface StatusControlProps {
  /** Current status value */
  value: string;
  /** Called when status changes */
  onChange: (newStatus: string) => void;
  /** Status configuration */
  statuses: Array<{
    value: string;
    label: string;
    color: string; // Tailwind class e.g. "bg-blue-500/20 text-blue-300"
  }>;
  /** Status transition rules. Maps current status to allowed next statuses. */
  transitions?: Record<string, string[]>;
  /** Whether to show the "next step" primary action button */
  showNextAction?: boolean;
}

// Renders:
// [Current Status ▾]  [→ Next Status]
//
// The dropdown shows all statuses.
// The "next status" button shows the most logical next step
// (e.g., "todo" → "in_progress", "in_progress" → "done").
// Transitions config allows restricting which status changes are valid.
```

#### `<SearchFilterBar>`

```typescript
// components/shared/search-filter-bar.tsx

interface SearchFilterBarProps {
  /** Search input value */
  search: string;
  /** Called on search change (already debounced internally) */
  onSearchChange: (value: string) => void;
  /** Filter definitions */
  filters: Array<{
    key: string;
    label: string;
    options: Array<{ value: string; label: string }>;
    value: string;
    onChange: (value: string) => void;
  }>;
}

// Renders:
// [🔍 Search...          ] [Status ▾] [Priority ▾] [Assignee ▾]
```

#### `<RichTextEditor>`

```typescript
// components/shared/rich-text-editor.tsx

interface RichTextEditorProps {
  /** HTML content */
  content: string;
  /** Called on content change */
  onChange: (html: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Minimal mode (no toolbar, just formatting shortcuts) */
  minimal?: boolean;
}

// Wraps Tiptap with:
// - StarterKit (headings, bold, italic, lists, code blocks)
// - Placeholder extension
// - Consistent styling across all uses
// - Optional toolbar (hidden in minimal mode)
```

#### `<AppShell>`

```typescript
// components/app-shell.tsx

interface AppShellProps {
  user: { email: string } | null;
  role: string | null;
  children: React.ReactNode;
}

// Renders:
// ┌──────┬──────────────────────────┐
// │      │                          │
// │ Side │    {children}            │
// │ bar  │                          │
// │      │                          │
// └──────┴──────────────────────────┘
//
// Sidebar: collapsible, nav items, user menu at bottom
// Responsive: sidebar becomes top bar on mobile
```

---

## 9. File & Folder Structure

```
agentbase/
├── .env.example
├── .env.local                    # (git-ignored)
├── .gitignore
├── PLAN.md
├── README.md
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
├── postcss.config.mjs
├── tailwind.config.ts            # Tailwind v4 (may be CSS-first — see note)
├── tsconfig.json
├── components.json               # shadcn/ui config
│
├── app/
│   ├── layout.tsx                # Root layout (html, body, fonts)
│   ├── page.tsx                  # Landing / redirect to dashboard
│   ├── globals.css               # Tailwind imports + theme vars
│   │
│   ├── auth/
│   │   ├── login/
│   │   │   └── page.tsx          # Google sign-in page
│   │   ├── callback/
│   │   │   └── route.ts          # OAuth callback handler
│   │   └── logout/
│   │       └── route.ts          # Sign-out handler
│   │
│   ├── (shell)/                  # Authenticated shell (sidebar + content)
│   │   ├── layout.tsx            # Fetches user/profile, renders AppShell
│   │   │
│   │   ├── tasks/
│   │   │   ├── page.tsx          # Server component: fetch tasks, render client
│   │   │   └── tasks-client.tsx  # Client component: list + shelf
│   │   │
│   │   ├── meetings/
│   │   │   ├── page.tsx
│   │   │   ├── meetings-client.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── meeting-detail-client.tsx
│   │   │
│   │   ├── library/
│   │   │   ├── page.tsx
│   │   │   └── library-client.tsx
│   │   │
│   │   ├── diary/
│   │   │   ├── page.tsx
│   │   │   └── diary-client.tsx
│   │   │
│   │   ├── grocery/
│   │   │   ├── page.tsx
│   │   │   └── grocery-client.tsx
│   │   │
│   │   ├── crm/
│   │   │   ├── layout.tsx        # CRM sub-nav (Companies, People, Deals)
│   │   │   ├── companies/
│   │   │   │   ├── page.tsx
│   │   │   │   └── companies-client.tsx
│   │   │   ├── people/
│   │   │   │   ├── page.tsx
│   │   │   │   └── people-client.tsx
│   │   │   └── deals/
│   │   │       ├── page.tsx
│   │   │       └── deals-client.tsx
│   │   │
│   │   ├── history/
│   │   │   ├── page.tsx
│   │   │   └── history-client.tsx
│   │   │
│   │   └── admin/
│   │       ├── layout.tsx        # Admin guard (requireAdmin)
│   │       ├── users/
│   │       │   ├── page.tsx
│   │       │   └── users-client.tsx
│   │       └── settings/
│   │           ├── page.tsx
│   │           └── settings-client.tsx
│   │
│   └── api/
│       └── commands/
│           ├── _lib/
│           │   ├── auth.ts
│           │   └── validate.ts
│           ├── create-task/
│           │   └── route.ts
│           ├── change-task-status/
│           │   └── route.ts
│           ├── add-comment/
│           │   └── route.ts
│           ├── create-meeting/
│           │   └── route.ts
│           ├── change-meeting-status/
│           │   └── route.ts
│           ├── accept-suggested-task/
│           │   └── route.ts
│           ├── create-library-item/
│           │   └── route.ts
│           ├── create-diary-entry/
│           │   └── route.ts
│           ├── create-company/
│           │   └── route.ts
│           ├── create-person/
│           │   └── route.ts
│           ├── create-deal/
│           │   └── route.ts
│           ├── change-deal-status/
│           │   └── route.ts
│           ├── check-grocery-item/
│           │   └── route.ts
│           ├── add-grocery-item/
│           │   └── route.ts
│           └── update/
│               └── route.ts
│
├── components/
│   ├── ui/                       # shadcn/ui primitives (button, input, badge, etc.)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── badge.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── popover.tsx
│   │   ├── separator.tsx
│   │   ├── skeleton.tsx
│   │   ├── textarea.tsx
│   │   ├── tooltip.tsx
│   │   └── ...
│   ├── shared/
│   │   ├── edit-shelf.tsx
│   │   ├── activity-and-comments.tsx
│   │   ├── activity-feed.tsx
│   │   ├── comment-box.tsx
│   │   ├── combo-input.tsx
│   │   ├── tag-combobox.tsx
│   │   ├── status-control.tsx
│   │   ├── search-filter-bar.tsx
│   │   ├── rich-text-editor.tsx
│   │   └── toast-provider.tsx
│   ├── app-shell.tsx
│   ├── sidebar-nav.tsx
│   └── cmd-k.tsx
│
├── hooks/
│   ├── use-realtime-subscription.ts
│   ├── use-command.ts            # Hook for calling command bus API routes
│   ├── use-debounce.ts
│   └── use-media-query.ts
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser client (createBrowserClient)
│   │   ├── server.ts             # Server client (createServerClient with cookies)
│   │   └── middleware.ts         # Middleware client (createServerClient for middleware)
│   ├── auth.ts                   # getSession, getUserProfile, requireAuth, requireAdmin
│   ├── constants.ts              # Status/priority configs, entity type maps
│   └── utils.ts                  # cn(), formatDate, relativeTime, etc.
│
├── middleware.ts                 # Auth middleware (session refresh, route protection)
│
├── types/
│   ├── entities.ts               # Task, Meeting, LibraryItem, DiaryEntry, etc.
│   ├── activity.ts               # ActivityLogEntry, EventType
│   └── api.ts                    # CommandResponse, CommandError
│
├── scripts/
│   ├── create-agent-users.ts     # One-time: create Lucy + Frank auth users
│   ├── generate-agent-jwt.ts     # One-time: generate agent JWTs (90-day expiry, unique jti)
│   └── refresh-agent-jwts.ts     # Periodic: regenerate agent JWTs before 90-day expiry
│
├── supabase/
│   ├── migrations/
│   │   └── 00000000000000_initial.sql  # Full schema (all tables, RLS, triggers)
│   └── SCHEMA.md                 # Living schema reference (same pattern as HAH Toolbox)
│
└── public/
    ├── favicon.ico
    └── avatars/
        ├── lucy.png
        └── frank.png
```

**Note on Tailwind v4:** Tailwind v4 supports CSS-first configuration (defining theme in `globals.css` instead of `tailwind.config.ts`). If using CSS-first config, the `tailwind.config.ts` file may not be needed. Decide during scaffolding based on shadcn/ui v4 compatibility at that time.

---

## 10. Build Phases

### Phase 1: Scaffolding & Infrastructure

**Goal:** Empty app that boots, authenticates, and has the full DB schema deployed.

- [ ] Initialize Next.js 15 with App Router, TypeScript strict, pnpm
- [ ] Install and configure Tailwind CSS v4 + shadcn/ui
- [ ] Set up Supabase project (or configure for existing)
- [ ] Create all Supabase client helpers (`lib/supabase/client.ts`, `server.ts`, `middleware.ts`)
- [ ] Write `middleware.ts` (auth session refresh + route protection)
- [ ] Write `lib/auth.ts` (getSession, getUserProfile, requireAuth, requireAdmin)
- [ ] Deploy initial migration (`00000000000000_initial.sql`) — all tables, RLS, triggers
- [ ] Set up Google OAuth in Supabase Auth
- [ ] Build auth pages (`/auth/login`, `/auth/callback`, `/auth/logout`)
- [ ] Create `.env.example` with all required env vars
- [ ] Create agent users (Lucy, Frank) and generate JWTs via scripts
- [ ] Ship empty `AppShell` with sidebar nav (all items, no content yet)
- [ ] Add per-actor rate limiting middleware on `/api/commands/*` — simple in-memory or Supabase-based counter. Limit: 60 requests/minute per `actor_id`. Protects against runaway agents burning Vercel/Supabase quotas.
- [ ] Verify: user can sign in, see empty shell, sign out

### Phase 2: Command Bus & Activity System

**Goal:** The full command bus infrastructure is working. Activity log writes and reads work. Toast system works.

- [ ] Build `resolveActor()` — auth resolution for API routes (cookie + JWT)
- [ ] Write initial PL/pgSQL RPC functions: `rpc_create_task`, `rpc_change_task_status`, `rpc_add_comment`, `rpc_update_entity` (the first ones needed for Phase 3). Add remaining RPCs in each entity's phase.
- [ ] Build `PATCH /api/commands/update` (generic update route — calls `rpc_update_entity`)
- [ ] Build `POST /api/commands/add-comment` (calls `rpc_add_comment`)
- [ ] Build `<ToastProvider>` and toast system (fires on command responses)
- [ ] Build `<ActivityFeed>` component (fetch + render, no realtime yet)
- [ ] Build `<CommentBox>` component
- [ ] Build `<ActivityAndComments>` component
- [ ] Build `<EditShelf>` component (container with activity slot)
- [ ] Verify: can call commands via curl, see activity_log entries, see them in ActivityFeed

**Note:** API routes are thin wrappers — `resolveActor()` + `rpc()` call + response. No multi-call sequences.

### Phase 3: First Full Entity — Tasks

**Goal:** Tasks page is fully functional with list, shelf, create, edit, status changes, comments, and realtime.

- [ ] Build `POST /api/commands/create-task`
- [ ] Build `POST /api/commands/change-task-status`
- [ ] Build task type definitions
- [ ] Build tasks list page (server fetch + client rendering)
- [ ] Build task EditShelf content (title, body, status, priority, assignee, due date, tags)
- [ ] Build `<StatusControl>` component (used by tasks and meetings)
- [ ] Build `<TagCombobox>` component
- [ ] Build `<SearchFilterBar>` component
- [ ] Build `<RichTextEditor>` (Tiptap wrapper for task body)
- [ ] Wire up realtime subscription on tasks list
- [ ] Wire up realtime subscription on task activity (inside shelf)
- [ ] Build `use-command.ts` hook (typed API route caller)
- [ ] Verify: full CRUD, status changes, comments, realtime updates, toast feedback

### Phase 4: Remaining Entities

**Goal:** All entity types have full CRUD, edit shelves, activity integration.

#### 4a: Meetings
- [ ] Build meeting command routes (create, change-status, accept-suggested-task)
- [ ] Build meetings list page
- [ ] Build meeting detail page with lifecycle states (upcoming → in_meeting → ended → closed)
- [ ] Build meeting EditShelf content (date, time, notes, transcript, proposed tasks)
- [ ] Build people/company linking via `meetings_people` and `meetings_companies` join tables (ComboInput for search + select)
- [ ] Wire up realtime for meeting detail (agent writes during live meeting)

#### 4b: Library
- [ ] Build library command route (create-library-item)
- [ ] Build library list page with type filtering (note, idea, article, restaurant, favorite, flag)
- [ ] Build library EditShelf content (type-specific fields, URL, location)
- [ ] No realtime on list (fetch on mount)

#### 4c: Diary
- [ ] Build diary command route (create-diary-entry with upsert)
- [ ] Build diary page (calendar or date-list view, one entry per day)
- [ ] Build diary EditShelf content (summary, rich text content)
- [ ] No realtime (fetch on mount)

#### 4d: Grocery
- [ ] Build grocery command routes (add-grocery-item, check-grocery-item)
- [ ] Build grocery list page (checkbox items, categories, reorder)
- [ ] Wire up realtime (shared between user + agent)

#### 4e: CRM — Companies, People, Deals
- [ ] Build CRM command routes (create-company, create-person, create-deal, change-deal-status)
- [ ] Build CRM sub-nav layout
- [ ] Build companies list + EditShelf
- [ ] Build people list + EditShelf (with company linking via people_companies)
- [ ] Build deals list + EditShelf (with company + people linking)
- [ ] Build `<ComboInput>` for people/company mention (used in deals, meetings)
- [ ] `DEAL_LABEL` env var support in UI

### Phase 5: Cross-Cutting Concerns

**Goal:** Global features that span all entities.

- [ ] Build History page (global ActivityFeed with filters: actor, entity type, date range, search)
- [ ] Build Admin → Users page (invite users, manage roles)
- [ ] Build Admin → Settings page (app configuration)
- [ ] Build `<CmdK>` command palette (quick nav, quick create)
- [ ] Add `<ComboInput>` for @ mentions (people, companies) in comment boxes
- [ ] Performance audit: check realtime subscription count, query patterns, bundle size

### Phase 6: Polish & Hardening

**Goal:** Production-ready.

- [ ] Mobile responsive pass on all pages
- [ ] Loading states and skeletons on all pages
- [ ] Error boundaries and error states
- [ ] Empty states for all entity lists
- [ ] Keyboard shortcuts (Escape to close shelf, Cmd+K for palette)
- [ ] Accessibility audit (focus management, ARIA labels, color contrast)
- [ ] SEO basics (metadata, OG tags)
- [ ] Input sanitization audit (XSS prevention in rich text, SQL injection prevention)
- [ ] Deployment documentation (Vercel setup, Supabase setup, env vars)
- [ ] README.md

---

## 11. Open Questions / Decisions Deferred to Hunter

1. **Agent user_id in writes:** When Frank creates a task, should `user_id` be Hunter's ID (the owner) or Frank's ID? The plan assumes the owner's ID (so RLS scoping works naturally), but this means the `created_by` information lives only in `activity_log.actor_id`, not on the entity itself. **Alternative:** Add a `created_by` column to entity tables. **Recommendation:** Keep it in activity_log only — simpler schema, single source of truth for attribution.

2. **Task assignee values:** HAH Toolbox uses string assignees (`"hunter"`, `"frank"`, `"lucy"`). Should AgentBase use UUIDs referencing `auth.users` instead? **Tradeoff:** UUIDs are cleaner but require a join to display names. Strings are simpler but don't validate. **Recommendation:** Use UUIDs, resolve display names client-side from a profiles cache.

3. **Rich text storage format:** Tiptap can output HTML or JSON. HAH Toolbox uses plain Markdown (text columns). **Options:**
   - Store as HTML (easy to render, harder to diff)
   - Store as Tiptap JSON (lossless, harder to render outside Tiptap)
   - Store as Markdown (compatible, but lossy round-trip with Tiptap)
   **Recommendation:** Store as HTML. It's the standard output format, renderable everywhere, and `dangerouslySetInnerHTML` with DOMPurify is safe enough.

4. **Meeting lifecycle — `wrapping_up` vs `ended`:** HAH Toolbox has `upcoming → in_meeting → wrapping_up → complete`. The spec says `upcoming → in_meeting → ended → closed`. Is `ended` the same as `wrapping_up` (post-meeting but not finalized)? **Recommendation:** Yes, treat `ended` as "meeting is over, wrapping up notes/tasks" and `closed` as "fully processed, archived."

5. **Grocery list — shared between users?** The spec says "shared between user + agent." But in multi-tenant mode, can two human users share a grocery list? (e.g., Hunter + partner?) **Recommendation:** Not in v1. Keep it single-user + agent. Shared lists would require a separate sharing model.

6. **Tag scope:** Should tags be global (all users share one tag namespace) or per-user? The plan assumes per-user (each user has their own tags). **Impact:** Changes the tags table unique constraint and autocomplete queries. **Recommendation:** Per-user — multi-tenant isolation is cleaner.

7. **Deal statuses:** The spec says `lead | qualified | proposal | negotiation | won | lost`. HAH Toolbox has `lead | qualified | proposal_sent | negotiation | accepted | passed`. Which set? **Recommendation:** Use the spec's set (`won`/`lost` are clearer than `accepted`/`passed`). Can always add more via migration.

8. **Comments — separate table or activity_log only?** The current design puts comments in `activity_log` with `event_type: "commented"`. HAH Toolbox dual-writes to `task_activity` AND `activity_log`. **Options:**
   - Comments only in `activity_log` (simpler, single source of truth)
   - Separate `comments` table + mirror to `activity_log` (more queryable, but two sources)
   **Recommendation:** Comments only in `activity_log`. The `payload.comment_body` field is sufficient. If we need full-text search on comments, we index `payload` with a GIN index.

9. **Notification data model:** The spec says "design data model to support it, no UI now." Should we add a `notifications` table in the initial migration? **Recommendation:** Yes, add the table structure now (empty, no UI, no triggers):
   ```sql
   CREATE TABLE notifications (
     id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
     user_id    uuid NOT NULL REFERENCES auth.users(id),
     type       text NOT NULL,
     title      text NOT NULL,
     body       text,
     entity_type text,
     entity_id  uuid,
     read       boolean NOT NULL DEFAULT false,
     created_at timestamptz NOT NULL DEFAULT now()
   );
   ```

---

## 12. Key Differences from HAH Toolbox (and Why)

| Area | HAH Toolbox | AgentBase | Why |
|------|-------------|-----------|-----|
| **Multi-tenancy** | Single-user. No `user_id` on most tables. | All tables have `user_id`. RLS scopes everything. | Anyone can deploy and use it. Data isolation is a must. |
| **Agent auth** | Service role key + `SET LOCAL app.current_actor` | Real Supabase Auth users with hand-signed JWTs. `auth.uid()` resolves correctly. | Eliminates the fragile `SET LOCAL` pattern. Proper audit trail. RLS works naturally. |
| **Mutation path** | Direct Supabase client calls from components | All mutations go through API routes (command bus) | Agents (external HTTP clients) need the same endpoints as the browser. Server actions can't be called by Docker containers. |
| **Activity log** | `author` as text (`"hunter"`, `"frank"`). No `user_id` scope. | `actor_id` as UUID FK to `auth.users`. Activity scoped via entity ownership. | Multi-tenant safe. Proper FK relationships. Actors resolved client-side. |
| **Task activity** | Dual-write to `task_activity` AND `activity_log` | Single write to `activity_log` only | One source of truth. No sync issues. `task_activity` was a legacy artifact. |
| **Edit shelf** | Generic `RightShelf` container. ActivityFeed manually included per entity. | `EditShelf` always includes `ActivityAndComments`. Universal pattern. | Can't forget activity/comments. Consistent UX across all entities. |
| **Task component** | Single 900+ line monolithic file | Decomposed: list view, shelf content, shared components | Maintainable. Testable. Reusable pieces. |
| **Realtime** | None — fetch on mount only | Supabase Realtime on high-value surfaces (Tasks, Meetings, Grocery, Activity) | Agents write data constantly. Users need to see changes without refreshing. |
| **Toast** | Implemented but not connected to a command bus | Every semantic action fires a toast via the command response | Immediate feedback loop for every mutation. |
| **CRM schema** | HAH-specific fields (`partnership_type`, `enrichment_status`, `llm_summary`) | Generic fields (`value`, `status`, `notes`). Clean data model. | AgentBase is a platform, not an HAH-specific tool. |
| **Deals label** | Hardcoded "Deals" | Configurable via `DEAL_LABEL` env var | Self-deployable. Different users have different terminology. |
| **Profiles** | Minimal (`id`, `email`, `role`) | Adds `full_name`, `avatar_url` | Better user display in activity feeds, comments, admin panel. |
| **Meeting lifecycle** | `upcoming → in_meeting → wrapping_up → complete` | `upcoming → in_meeting → ended → closed` | Cleaner naming. `ended` = post-meeting work. `closed` = done. |
| **Meeting schema** | `contact` (text), `prep_notes`, `meeting_summary`, `notes`, `summary` (legacy) | `title`, `agent_notes` (replaces `meeting_summary`), no legacy fields | Clean schema. No accumulated cruft. |
| **Library schema** | No `url`, `source`, `excerpt` fields | Added `url`, `source`, `excerpt` for article/bookmark types | Library items need to store web content properly. |
| **Grocery schema** | `item` (text), `checked` (bool), no user_id | `name`, `quantity`, `unit`, `category`, `is_checked`, `sort_order`, `user_id` | Multi-tenant. Richer data model for better UX (categories, quantities). |
| **Tags** | Global (one namespace) | Per-user (scoped by `user_id`) | Multi-tenant isolation. |
| **Migration strategy** | 35+ incremental migrations (organic growth) | Single initial migration with complete schema | Greenfield advantage. Clean start. |
| **Atomicity** | Two separate Supabase calls (entity update, then activity insert) — can get out of sync | Single Postgres RPC call — entity mutation + activity_log insert in one transaction | Guaranteed consistency. No orphaned events. |

---

## Later / Low Priority

These are real concerns but deliberately out of scope for v1. Ticket them when the core is stable.

### L-1: JWT refresh automation
Agent JWTs use 90-day expiry with a manual refresh script. Future work: automate the refresh cycle (cron job that regenerates and stores JWTs before expiry, notifies if refresh fails). Also consider: PKCE-based agent auth flow for tighter security.

### L-2: Smart event detection on generic update route
The `PATCH /api/commands/update` route writes `event_type: "updated"` for all field changes. For known semantic fields (status, priority, assignee), it could detect the change and write a richer event (e.g. `status_changed` with old/new values) automatically. Not blocking — semantic action routes handle the important mutations. Add after v1 is stable.

### L-3: Schema migration strategy for self-deployers
Once others deploy AgentBase, schema updates need a documented path. Future work: document `supabase db push` workflow, add a `schema_version` table, add a `/api/health` endpoint that reports schema version so deployed instances know when they're behind.

### L-4: Webhook / event broadcast system
The activity_log writes structured events for every mutation. Future work: add a `webhooks` table where users register URLs to receive event payloads. Makes the platform extensible without writing integrations into the core.

### L-5: Rich text format — revisit if needed
Currently storing Tiptap output as HTML (safe, renderable, DOMPurify sanitized). If markdown export, full-text search on content, or non-Tiptap rendering becomes important — revisit. Not a v1 concern.

### L-6: Push / email notifications
The `notifications` table is in the schema (stub only). No UI, no triggers. Build when there's a real use case.

### L-7: Shared grocery lists
Current design: grocery list is per-user + agent. Sharing between multiple human users requires a separate sharing model. Ticket when there's demand.

### L-8: Field-level validation on generic update route
The `PATCH /api/commands/update` route validates table name and protected fields (user_id, actor_id) but doesn't validate field values — Postgres CHECK constraints are the only guard. Future work: add optional per-table validation schemas (e.g. zod) that the generic route checks before writing. Not a v1 concern — CHECK constraints catch bad data at the DB level.
