# AgentBase — Technical Plan

> Multi-agent, multi-tenant Life OS platform.
> Replaces HAH Toolbox over time. Fully independent systems — HAH Toolbox stays live during the build.

---

## 1. Project Overview

AgentBase is a greenfield "Life OS" — a personal productivity platform where human users and AI agents (Lucy, Frank) collaborate on tasks, meetings, CRM, notes, diary, and grocery lists. Every mutation flows through a typed command bus, every change is recorded in a unified activity log, and every surface is multi-tenant with workspace-based isolation via RLS.

**Domain:** Configurable via `NEXT_PUBLIC_APP_DOMAIN` env var (default: `agentbase.hah.to`).
**Repo:** `git@github.com:extramoose/agentbase.git`
**Self-deployable:** Anyone clones, fills `.env.local`, deploys to Vercel.

---

## 2. Tech Stack & Rationale

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Next.js 16** (App Router) | Server components, API routes, middleware — all in one. Turbopack is stable and default in v16 (no flag needed). Minimum Node.js 20.9+, React 19, TypeScript 5.1+. |
| Database / Auth / Realtime | **Supabase** (Postgres + Auth + Realtime) | Proven in HAH Toolbox. RLS, realtime subscriptions, Google OAuth all built in. Self-hostable. |
| Styling | **Tailwind CSS v4** | Utility-first, consistent with HAH Toolbox. v4 for CSS-first config and improved performance. |
| Component library | **shadcn/ui** (used to its full extent) | Copy-paste components, fully customizable, Tailwind-native. No runtime dependency. |
| Language | **TypeScript strict** | `strict: true` in tsconfig. No `any` escape hatches. |
| Package manager | **pnpm** | Fast, disk-efficient, workspace-ready. Same as HAH Toolbox. |
| Rich text | **Tiptap** with markdown serialization | StarterKit + markdown input rules (type `**bold**` → renders bold). Output: Markdown string stored in `text` columns. Markdown is portable, diffable, renderable outside Tiptap, and friendly to agents writing content programmatically. |
| Drag & drop | **@dnd-kit** | Used in HAH Toolbox for task reordering. Accessible, composable. |

**What changes from HAH Toolbox and why:**

- **Command bus (new):** HAH Toolbox has ad-hoc Supabase client calls scattered across components. AgentBase routes all mutations through Next.js API routes so agents (external HTTP clients) and browsers use the same path.
- **Real agent auth (new):** HAH Toolbox uses `SET LOCAL app.current_actor` for agent attribution — fragile, service-role-dependent. AgentBase gives agents real Supabase Auth users with refresh-token-based sessions. `auth.uid()` resolves correctly in all triggers. RLS applies per agent. No JWT signing required.
- **Multi-tenancy (new):** HAH Toolbox is single-user. AgentBase scopes all data by `tenant_id` (workspace) via RLS from day one.
- **Componentized edit shelf (new):** HAH Toolbox's task shelf is a monolithic 900+ line component. AgentBase has a universal `<EditShelf>` with a pluggable content slot and a shared `<ActivityAndComments>` section.

### Environment Variables

#### Key Naming: Old vs Current Supabase Terminology

Supabase deprecated its original key naming in 2024. If you've used Supabase before, here's the mapping:

| Old name (deprecated) | Current name | What it does |
|----------------------|--------------|--------------|
| `anon key` | **publishable key** | Safe to expose in the browser. Used by the Supabase JS client for all authenticated + unauthenticated requests. RLS enforces access. |
| `service role key` | **secret key** | Bypasses ALL RLS. Full database access. Never expose in a browser or runtime environment. Scripts only. |

The env var name `NEXT_PUBLIC_SUPABASE_ANON_KEY` is what the Supabase JS SDK still expects (kept for SDK compatibility), but the key it holds is what the Supabase dashboard now labels **"publishable key"**. `SUPABASE_SECRET_KEY` is our env var name for what the dashboard calls the **"secret key"**.

**Runtime env vars** (in Vercel / `.env.local` for the Next.js app):
```
NEXT_PUBLIC_SUPABASE_URL        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase publishable key — safe to expose, RLS-enforced
NEXT_PUBLIC_APP_DOMAIN          # App domain (default: agentbase.hah.to)
DEAL_LABEL                      # Optional label override for "Deals" entity
```

> ⚠️ **`SUPABASE_SECRET_KEY` (the publishable key's dangerous sibling) must never be in the Next.js runtime environment.** It bypasses all RLS — if present in a deployed runtime, any server-side bug becomes a full database compromise. It belongs only in one-time admin scripts run locally. API routes and server components use the publishable key + the caller's session token. Admin operations use SECURITY DEFINER RPCs.
>
> Add a boot-time assertion in `lib/env.ts`:
> ```ts
> if (process.env.SUPABASE_SECRET_KEY && process.env.NODE_ENV === 'production') {
>   throw new Error('SUPABASE_SECRET_KEY must not be present in production runtime')
> }
> ```

**Scripts-only env vars** (local `.env.local` only — NOT in Vercel):
```
SUPABASE_SECRET_KEY   # Supabase secret key (old name: "service role key") — scripts only. NEVER in Vercel.
```

---

## 3. Architecture Overview

### 3.1 Command Bus

Every mutation goes through one of two paths — both are standard Next.js API routes (NOT server actions, because agents in Docker containers need to call them via HTTP).

#### Semantic Actions

Named mutations that emit typed history events. Each has its own API route handler.

```
POST /api/commands/{action}
Authorization: Bearer <jwt>
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

**Why idempotency matters for OpenClaw:** OpenClaw agents run in Docker containers and retry HTTP requests on network timeouts and flakes. Without idempotency, a timeout between the request leaving the agent and the server committing the transaction results in a duplicate entity (task, comment, meeting) when the agent retries. The `idempotency_key` field prevents this.

**Idempotency:** Agents are Docker containers hitting HTTP endpoints. Network retries will happen. All create commands accept an optional `idempotency_key` field (UUID or string, max 128 chars). The idempotency check runs **inside the SECURITY DEFINER RPC** (e.g. `rpc_create_task`) — not in the route handler. The RPC checks whether the key exists in `idempotency_keys`: if yes, it returns the stored response immediately without re-executing; if no, it performs the entity insert, writes to `activity_log`, and stores `(key, response)` in `idempotency_keys` — all in the same atomic transaction. The API route handler never touches `idempotency_keys` directly and does not need the secret key. A pg_cron job or Vercel cron purges entries older than 24 hours. Idempotency keys are optional — browser callers don't need them. Only agents should send them.

**Rate limiting:** All command handlers run behind per-actor rate limiting middleware (see Phase 1 in §10). Limit: 60 requests/minute per `actor_id`. This protects against runaway agents burning Vercel/Supabase quotas.

**Atomicity via Postgres RPC.** Every semantic command handler does two things: (1) resolve the actor, (2) call a Postgres RPC function. The RPC function does the entity mutation AND the activity_log INSERT inside a single PL/pgSQL function — one network round-trip, one database transaction, guaranteed atomicity. If the entity update fails, no activity event is written. If the activity insert fails, the entity update is rolled back. There is no failure mode where these get out of sync.

This is also what makes the platform transparent to agents. An agent calls `POST /api/commands/change-task-status` with a task ID and new status. It gets back a result. It never knows activity_log exists. The platform captures all context — who, what, when, old value, new value — automatically.

#### Generic Field Updates

Schema-agnostic patch for any entity. New fields on any entity just work without writing new API code.

```
PATCH /api/commands/update
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "table": "tasks",
  "id": "uuid",
  "fields": { "title": "New title", "body": "Updated body" }
}
```

- Validates `table` against an allowlist
- Validates `id` exists and belongs to the requesting user's workspace
- Calls `rpc_update_entity(table_name, entity_id, fields jsonb, actor_id uuid, tenant_id uuid)` — a Postgres function that runs `UPDATE {table} SET ... WHERE id = entity_id AND tenant_id = tenant_id` and `INSERT INTO activity_log (...)` in one transaction
- Returns `{ success: true, data: {...} }`

#### Auth Resolution in API Routes

**CSRF posture: Bearer-only on all mutation endpoints.** The command bus requires `Authorization: Bearer <jwt>` on ALL `/api/commands/*` routes — even for browser callers. Browsers get their Supabase session JWT via `supabase.auth.getSession()` and send it as a Bearer token. Session cookies are never used to authorize mutations. This eliminates CSRF entirely — cross-site requests cannot inject the Bearer token. `resolveActor()` only reads the `Authorization` header, never cookies, for command endpoints. (Cookies are still used for server-component data fetching via Supabase SSR — that is read-only and not a CSRF risk.)

Every API route handler:
1. Reads the `Authorization: Bearer <jwt>` header (required — no cookie fallback for command endpoints)
2. Verifies the JWT via the Supabase Auth API (`supabase.auth.getUser()`) — no local JWT secret needed at runtime
3. Creates a Supabase client authenticated as the caller
4. `auth.uid()` resolves correctly for RLS and trigger attribution

```typescript
// lib/api/auth.ts
import { createClient } from "@supabase/supabase-js";

export async function resolveActor(request: Request) {
  const authHeader = request.headers.get("authorization");

  // All command endpoints require Bearer token — no cookie fallback
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing Authorization: Bearer header");
  }

  const token = authHeader.slice(7);

  // Create a Supabase client authenticated with the caller's JWT
  // JWT is verified server-side by Supabase Auth (no local secret needed)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  // Verify the token and get the user
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");

  // Check if this is an agent (has an entry in agent_owners)
  const { data: agentMapping } = await supabase
    .from("agent_owners")
    .select("owner_id")
    .eq("agent_id", user.id)
    .single();

  // Resolve the actor's workspace (tenant_id) from tenant_members
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  return {
    supabase,
    actorId: user.id,
    actorType: agentMapping ? "agent" as const : "human" as const,
    ownerId: agentMapping?.owner_id ?? user.id,
    tenantId: membership?.tenant_id ?? null,
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
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  actor_id    uuid NOT NULL REFERENCES auth.users(id),
  actor_type  text NOT NULL CHECK (actor_type IN ('human', 'agent')),
  event_type  text NOT NULL,
  payload     jsonb,
  created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_activity_log_entity ON activity_log (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_activity_log_actor  ON activity_log (actor_id, created_at DESC);
CREATE INDEX idx_activity_log_tenant ON activity_log (tenant_id, created_at DESC);
CREATE INDEX idx_activity_log_time   ON activity_log (created_at DESC);
```

`actor_id` is NOT NULL and REFERENCES `auth.users(id)`. There is no null actor. If a mutation cannot be attributed to a real user (human or agent), the command is rejected at the API layer. DB triggers that fire without an auth context are not used for activity logging — all activity comes through the command bus RPC functions. The valid `actor_type` values are `'human'` and `'agent'` — there is no system/platform actor.

`tenant_id` is the workspace this event belongs to — all workspace members can read it. `actor_id` is who performed the action (attribution). The command bus resolves `tenant_id` from the actor's `tenant_members` row at write time.

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

**Key difference from HAH Toolbox:** The old `activity_log` used `author` as a text string (`"hunter"`, `"frank"`) and had no tenant scoping. AgentBase uses `actor_id` as a real FK to `auth.users` for attribution, and `tenant_id` for workspace-scoped visibility via RLS. Actor display names are resolved client-side from a profiles lookup.

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

**Workspace-based tenancy.** Every entity row belongs to a workspace (tenant), not to a user. RLS checks workspace membership: a user can read/write rows where `tenant_id` is a workspace they belong to.

Three distinct concepts — do not conflate them:
- **`tenant_id`** on entity rows = visibility scope ("who can see this")
- **`actor_id`** in `activity_log` on create/update events = attribution ("who did this")
- **`assignee`** on tasks = workflow ownership ("who is responsible")

Every entity table has:
```sql
tenant_id uuid NOT NULL REFERENCES tenants(id)
```

Every entity table has these RLS policies:
```sql
-- Workspace members can read tenant data
CREATE POLICY "Tenant members read" ON {table}
  FOR SELECT USING (is_tenant_member(tenant_id));

-- Workspace members can insert tenant data
CREATE POLICY "Tenant members insert" ON {table}
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));

-- Workspace members can update tenant data
CREATE POLICY "Tenant members update" ON {table}
  FOR UPDATE USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id));

-- Workspace members can delete tenant data
CREATE POLICY "Tenant members delete" ON {table}
  FOR DELETE USING (is_tenant_member(tenant_id));
```

**Helper function** (avoids repeating the membership subquery):
```sql
CREATE OR REPLACE FUNCTION is_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
  );
$$;
```

**v1 has one workspace.** There is a single row in `tenants` (HunterTenant). Hunter is a `superadmin` member. Lucy and Frank are `agent` members. All entities belong to this tenant. All members can see all entities.

**Adding more humans later** = insert a row into `tenant_members`. Their RLS membership check passes immediately. No schema changes. No data migrations. No RLS rewrites.

**All entities including Diary are workspace-scoped.** Diary is a shared workspace activity log — one entry per day capturing what everyone (humans and agents) did. Not a personal journal. Any team member or agent can contribute to the day's entry. Read/write access via tenant membership — same pattern as all other tables. Future vision: evolve into a calendar UI showing entity activity by day.

**Agent access:** Agents (Lucy, Frank) are real Supabase Auth users and members of the workspace with `role = 'agent'`. Their RLS access is identical to human members — workspace membership is all that's needed. The `agent_owners` table continues to map agent → owning human for delegation tracking.

**Agent writes and tenant_id:** When an agent creates a record, the command bus resolves `tenant_id` from the actor's `tenant_members` row — not from client input. Clients never supply `tenant_id` directly.

**Admin access:** Admin users can read all data (for the admin panel). Admin policies:
```sql
CREATE POLICY "Admins read all" ON {table}
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );
```

**Invite model:** Admin creates users. No self-signup. Admin panel has a "Users" section for managing invites.

### 3.5 Agent Service Accounts

> **Agents are fully customizable per deployment.** Lucy and Frank are the v1 agents for this installation — they are not hardcoded into the platform. Any deployer can create their own agents with their own names, avatars, and auth credentials. Agent management lives in the **Admin → Agents** settings page (superadmin only). The scripts below describe the underlying mechanics; the admin UI wraps them into a no-code flow.
>
> **Agent identity model:**
> - **Name** — display name shown in activity feeds, comments, and history (e.g. "Frank", "Lucy", "Aria")
> - **Avatar** — uploaded image or URL; shown as an avatar chip wherever the agent appears in the UI
> - **API key** — the auth credential the agent uses to call `/api/commands/*`. v1: Supabase refresh token (stored in agent config). Future: API key header, OAuth token, or other protocols as they emerge. The admin UI issues and revokes credentials per agent.
> - **Owner** — the human user responsible for the agent; recorded in `agent_owners` for delegation tracking
>
> The admin creates a new agent in the UI → the platform creates the Supabase Auth user behind the scenes (via a server-side API route using the secret key stored in scripts, not in runtime) → issues a refresh token → displays it once for the operator to copy into their agent's config. Revocation is one click.

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
  process.env.SUPABASE_SECRET_KEY!
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

// Add agents to the workspace as 'agent' members
// (Run after the tenant has been created — see seed data in §5)
const HUNTER_TENANT_ID = "..."; // HunterTenant's id from tenants table
await supabase.from("tenant_members").insert([
  { tenant_id: HUNTER_TENANT_ID, user_id: lucyId, role: "agent" },
  { tenant_id: HUNTER_TENANT_ID, user_id: frankId, role: "agent" },
]);
```

After creating agent users, insert them into `tenant_members` for HunterTenant. Agents' RLS access is now identical to human members — they can read/write all workspace entities. The `agent_owners` table continues to map agent → owning human for delegation tracking.

#### Step 2: Generate agent authentication tokens

> **Note: Legacy JWT secret is deprecated.** The old approach of hand-signing HS256 JWTs using a shared secret is no longer the Supabase pattern. AgentBase uses admin-generated refresh token sessions instead — no custom signing required.

**Chosen approach: Admin-generated sessions with refresh token storage**

1. Run `scripts/create-agent-users.ts` (uses secret key) — creates `frank@internal.hah.to` and `lucy@internal.hah.to` via `supabase.auth.admin.createUser()`
2. Run `scripts/generate-agent-sessions.ts` — calls `supabase.auth.admin.generateLink({ type: 'magiclink', email: 'frank@internal.hah.to' })`, exchanges the token for a real session, captures `refresh_token`
3. Store `refresh_token` in the agent's config (Frank → `openclaw.json`, Lucy → her workspace config)
4. At runtime, agent initializes: `supabase.auth.setSession({ access_token, refresh_token })` — the Supabase JS client auto-refreshes access tokens from that point. `auth.uid()` resolves to Frank's or Lucy's real user UUID in every DB call, every trigger, every RLS policy. No secret key at runtime. No JWT signing. No custom crypto.

```typescript
// Agent sessions: run scripts/create-agent-users.ts + scripts/generate-agent-sessions.ts
// Store refresh_token in agent config. At runtime: supabase.auth.setSession({ access_token, refresh_token })
// auth.uid() resolves automatically. No JWT signing needed.
```

Store agent refresh tokens as environment variables in the agent containers:
```
LUCY_REFRESH_TOKEN=<refresh_token>
FRANK_REFRESH_TOKEN=<refresh_token>
```

The Supabase JS client automatically handles access token rotation from the refresh token — no manual refresh script needed.

#### Token Revocation

**Token revocation:** To revoke an agent's access, call `supabase.auth.admin.signOut(agentUserId, { scope: 'global' })` from a script (using the secret key). This invalidates all active sessions for that agent. Then re-run `scripts/generate-agent-sessions.ts` to issue a new refresh token and update the agent's config. There is no `revoked_agent_tokens` table or JTI blocklist — Supabase session management handles revocation natively.

#### Step 3: RLS policies that work for agents

Because agents are real `authenticated` users and members of the workspace, `auth.uid()` resolves to their UUID. The RLS policies in §3.4 check `is_tenant_member(tenant_id)` — which passes for agents because they are in `tenant_members` with `role = 'agent'`. No special agent-specific policies needed.

**Policies that reference agent UUIDs directly (none needed):** Workspace membership handles all access control. No hardcoded UUIDs in policies.

**activity_log writes:** All writes go through SECURITY DEFINER RPC functions (e.g. `rpc_create_task`) — clients never insert into `activity_log` directly. The RPC sets `tenant_id` server-side from the actor's workspace membership, so clients cannot supply or tamper with `tenant_id`. There are no UPDATE or DELETE policies on `activity_log` — it is append-only and immutable.

---

## 4. Real-Time Strategy

### Where Realtime Is High-Value (Subscribe)

| Surface | Subscription | Why |
|---------|-------------|-----|
| **Tasks list** | `postgres_changes` on `tasks` filtered by `tenant_id` | Agents frequently create/update tasks. Humans need to see changes immediately. Core workflow surface. |
| **Task EditShelf → ActivityAndComments** | `postgres_changes` on `activity_log` filtered by `entity_type=task, entity_id=X` | Comments and status changes appear live while shelf is open. |
| **Meetings detail** | `postgres_changes` on `meetings` filtered by `id=X` | During live meetings, agent writes meeting_summary, proposed_tasks. Must appear without refresh. |
| **Meeting EditShelf → ActivityAndComments** | Same as task shelf | Same pattern. |
| **Global History page** | `postgres_changes` on `activity_log` filtered by `tenant_id` | The "everything" feed. New events stream in live. |
| **Grocery list** | `postgres_changes` on `grocery_items` filtered by `tenant_id` | Shared between user + agent. Checking items off should sync instantly. |

### Where Realtime Is Overkill (Don't Subscribe)

| Surface | Strategy | Why |
|---------|----------|-----|
| **Diary** | Fetch on mount. No subscription. | One shared entry per workspace per day. Low-frequency writes. No urgency. |
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
    filter: `tenant_id=eq.${tenantId}`,
  }, handler)
  .subscribe();
```

**Why per-table, not per-entity:** Supabase Realtime filters are applied server-side, so a `tenant_id=eq.X` filter means only events for that workspace's data are sent. This is both efficient and secure (no data leaks).

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

### Workspaces / Tenants

```sql
-- ============================================================
-- WORKSPACES / TENANTS
-- ============================================================

CREATE TABLE tenants (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: readable by all tenant members
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members can read their tenant"
  ON tenants FOR SELECT
  USING (id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- Seed: one tenant for v1
-- INSERT INTO tenants (name, slug) VALUES ('Hunter Workspace', 'hunter') ON CONFLICT DO NOTHING;


CREATE TABLE tenant_members (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('superadmin', 'admin', 'member', 'agent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
-- RLS: members can see who else is in their tenant
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can read tenant membership"
  ON tenant_members FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));
-- Superadmin can manage membership
CREATE POLICY "superadmin manages members"
  ON tenant_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members tm
      WHERE tm.tenant_id = tenant_members.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'superadmin'
    )
  );
```

### RLS Helper Function

```sql
-- Helper function for tenant membership checks (avoids repeating the subquery)
CREATE OR REPLACE FUNCTION is_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
  );
$$;
```

### Global Tags

```sql
CREATE TABLE tags (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)  -- tags are unique per workspace
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read tags" ON tags
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Tenant members insert tags" ON tags
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Tenant members update tags" ON tags
  FOR UPDATE USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Tenant members delete tags" ON tags
  FOR DELETE USING (is_tenant_member(tenant_id));
```

### Entity Tables

> **Scoping note:** All entity types use `tenant_id` for visibility scoping. All members of the workspace can see all entities. Attribution (who created or changed something) lives in `activity_log`, not on the entity row.

### Tasks

```sql
CREATE SEQUENCE tasks_ticket_id_seq;

CREATE TABLE tasks (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  title             text NOT NULL,
  body              text,                          -- stored as Markdown
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

CREATE INDEX idx_tasks_tenant_status ON tasks (tenant_id, status);
CREATE INDEX idx_tasks_tenant_priority ON tasks (tenant_id, priority);
CREATE INDEX idx_tasks_due_date ON tasks (tenant_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_tags ON tasks USING gin (tags);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tasks tenant members select" ON tasks
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Tasks tenant members insert" ON tasks
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Tasks tenant members update" ON tasks
  FOR UPDATE USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Tasks tenant members delete" ON tasks
  FOR DELETE USING (is_tenant_member(tenant_id));
CREATE POLICY "Admins read all tasks" ON tasks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );
```

### Meetings

```sql
CREATE TABLE meetings (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  title           text NOT NULL,
  date            date NOT NULL,
  meeting_time    text,
  status          text NOT NULL DEFAULT 'upcoming'
                    CHECK (status IN ('upcoming', 'in_meeting', 'ended', 'closed')),
  live_notes      text,                            -- stored as Markdown
  agent_notes     text,                            -- stored as Markdown
  transcript      text,
  proposed_tasks  jsonb DEFAULT '[]'::jsonb,
  tags            text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meetings_tenant_date ON meetings (tenant_id, date DESC);
CREATE INDEX idx_meetings_tenant_status ON meetings (tenant_id, status);
CREATE INDEX idx_meetings_tags ON meetings USING gin (tags);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Meetings tenant members select" ON meetings
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Meetings tenant members insert" ON meetings
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Meetings tenant members update" ON meetings
  FOR UPDATE USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Meetings tenant members delete" ON meetings
  FOR DELETE USING (is_tenant_member(tenant_id));
CREATE POLICY "Admins read all meetings" ON meetings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- Join table: meetings ↔ people (inherits workspace scope from parent via JOIN)
CREATE TABLE meetings_people (
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, person_id)
);

ALTER TABLE meetings_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Meetings_people via meeting tenant" ON meetings_people
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
      AND is_tenant_member(m.tenant_id)
    )
  );

-- Join table: meetings ↔ companies (inherits workspace scope from parent via JOIN)
CREATE TABLE meetings_companies (
  meeting_id  uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, company_id)
);

ALTER TABLE meetings_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Meetings_companies via meeting tenant" ON meetings_companies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
      AND is_tenant_member(m.tenant_id)
    )
  );
```

### Library Items

```sql
CREATE TABLE library_items (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  type         text NOT NULL CHECK (type IN ('note', 'idea', 'article', 'restaurant', 'favorite', 'flag')),
  title        text NOT NULL,
  description  text,                               -- stored as Markdown
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

CREATE INDEX idx_library_tenant_type ON library_items (tenant_id, type);
CREATE INDEX idx_library_tags ON library_items USING gin (tags);
CREATE INDEX idx_library_public ON library_items (is_public) WHERE is_public = true;

ALTER TABLE library_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Library tenant members select" ON library_items
  FOR SELECT USING (is_tenant_member(tenant_id) OR is_public = true);
CREATE POLICY "Library tenant members insert" ON library_items
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Library tenant members update" ON library_items
  FOR UPDATE USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Library tenant members delete" ON library_items
  FOR DELETE USING (is_tenant_member(tenant_id));
CREATE POLICY "Admins read all library items" ON library_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );
```

### Diary Entries

**Shared workspace log, not a personal journal.** One entry per day for the entire workspace. Humans and agents all contribute to the same day's entry — what got done, what happened, context for the day. Future: calendar UI showing entity activity by day. Do not design or build this as a private per-user feature.

```sql
CREATE TABLE diary_entries (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  date       date NOT NULL,
  summary    text,
  content    text,                               -- stored as Markdown
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, date)                       -- one entry per day per workspace
);

CREATE INDEX idx_diary_tenant_date ON diary_entries (tenant_id, date DESC);

ALTER TABLE diary_entries ENABLE ROW LEVEL SECURITY;

-- Diary is workspace-scoped like all other entities
CREATE POLICY "Diary tenant members select" ON diary_entries
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Diary tenant members insert" ON diary_entries
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Diary tenant members update" ON diary_entries
  FOR UPDATE USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Diary tenant members delete" ON diary_entries
  FOR DELETE USING (is_tenant_member(tenant_id));
CREATE POLICY "Admins read all diary" ON diary_entries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );
```

### Grocery Items

```sql
CREATE TABLE grocery_items (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  name       text NOT NULL,
  quantity   numeric,
  unit       text,
  category   text,
  is_checked boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_grocery_tenant ON grocery_items (tenant_id, sort_order);

ALTER TABLE grocery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Grocery tenant members select" ON grocery_items
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Grocery tenant members insert" ON grocery_items
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Grocery tenant members update" ON grocery_items
  FOR UPDATE USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Grocery tenant members delete" ON grocery_items
  FOR DELETE USING (is_tenant_member(tenant_id));
```

### CRM — Companies

```sql
CREATE TABLE companies (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  name        text NOT NULL,
  domain      text,
  description text,                              -- stored as Markdown
  tags        text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_tenant ON companies (tenant_id);
CREATE INDEX idx_companies_tags ON companies USING gin (tags);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies tenant members select" ON companies
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Companies tenant members insert" ON companies
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Companies tenant members update" ON companies
  FOR UPDATE USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Companies tenant members delete" ON companies
  FOR DELETE USING (is_tenant_member(tenant_id));
CREATE POLICY "Admins read all companies" ON companies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );
```

### CRM — People

```sql
CREATE TABLE people (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  name       text NOT NULL,
  email      text,
  role       text,
  notes      text,                               -- stored as Markdown
  tags       text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_people_tenant ON people (tenant_id);
CREATE INDEX idx_people_tags ON people USING gin (tags);

ALTER TABLE people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "People tenant members select" ON people
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "People tenant members insert" ON people
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "People tenant members update" ON people
  FOR UPDATE USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "People tenant members delete" ON people
  FOR DELETE USING (is_tenant_member(tenant_id));
CREATE POLICY "Admins read all people" ON people
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- Join table: people ↔ companies (inherits workspace scope from parent via JOIN)
CREATE TABLE people_companies (
  person_id  uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       text,
  PRIMARY KEY (person_id, company_id)
);

ALTER TABLE people_companies ENABLE ROW LEVEL SECURITY;

-- RLS via join to parent tables (person must belong to workspace)
CREATE POLICY "People_companies via person tenant" ON people_companies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE people.id = people_companies.person_id
      AND is_tenant_member(people.tenant_id)
    )
  );
```

### CRM — Deals

```sql
CREATE TABLE deals (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  title      text NOT NULL,
  status     text NOT NULL DEFAULT 'lead'
               CHECK (status IN ('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  value      numeric,
  notes      text,                               -- stored as Markdown
  tags       text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deals_tenant ON deals (tenant_id);
CREATE INDEX idx_deals_tenant_status ON deals (tenant_id, status);
CREATE INDEX idx_deals_tags ON deals USING gin (tags);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deals tenant members select" ON deals
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Deals tenant members insert" ON deals
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Deals tenant members update" ON deals
  FOR UPDATE USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "Deals tenant members delete" ON deals
  FOR DELETE USING (is_tenant_member(tenant_id));
CREATE POLICY "Admins read all deals" ON deals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- Join table: deals ↔ companies (inherits workspace scope from parent via JOIN)
CREATE TABLE deals_companies (
  deal_id    uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, company_id)
);

ALTER TABLE deals_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deals_companies via deal tenant" ON deals_companies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = deals_companies.deal_id
      AND is_tenant_member(deals.tenant_id)
    )
  );

-- Join table: deals ↔ people (inherits workspace scope from parent via JOIN)
CREATE TABLE deals_people (
  deal_id   uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, person_id)
);

ALTER TABLE deals_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deals_people via deal tenant" ON deals_people
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = deals_people.deal_id
      AND is_tenant_member(deals.tenant_id)
    )
  );
```

### Activity Log

```sql
CREATE TABLE activity_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  actor_id    uuid NOT NULL REFERENCES auth.users(id),
  actor_type  text NOT NULL CHECK (actor_type IN ('human', 'agent')),
  event_type  text NOT NULL,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_log_entity ON activity_log (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_activity_log_actor  ON activity_log (actor_id, created_at DESC);
CREATE INDEX idx_activity_log_tenant ON activity_log (tenant_id, created_at DESC);
CREATE INDEX idx_activity_log_time   ON activity_log (created_at DESC);

-- Composite index for realtime subscription filtering
-- (Supabase Realtime uses the filter to decide which rows to broadcast)
CREATE INDEX idx_activity_log_entity_pair ON activity_log (entity_type, entity_id);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- activity_log: append-only, tenant-scoped reads
CREATE POLICY "Tenant members read activity" ON activity_log
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY "Admins read all activity" ON activity_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- activity_log has NO UPDATE policy and NO DELETE policy — it is append-only.
-- Rows are immutable once written. Only SECURITY DEFINER RPCs insert into this table.
-- No INSERT policy needed — all inserts go through SECURITY DEFINER RPCs.
```

**activity_log is append-only and write-protected.** All inserts go through SECURITY DEFINER RPC functions — not from direct client calls. `activity_log.tenant_id` is always derived server-side from the entity being mutated or from the actor's workspace membership. Clients cannot supply `tenant_id` directly. The table has no UPDATE or DELETE policies — activity events are immutable once written.

```sql
-- RPC for paginated activity log (SECURITY DEFINER for reliable access)
CREATE OR REPLACE FUNCTION get_activity_log(
  p_tenant_id   uuid,
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
BEGIN
  -- Verify caller is a member of the requested workspace
  IF NOT is_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN QUERY
  SELECT al.*
  FROM activity_log al
  WHERE
    -- Scope to workspace data
    al.tenant_id = p_tenant_id
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
-- rpc_create_task(title, body, status, priority, assignee, due_date, tags, actor_id, tenant_id, idempotency_key)
-- rpc_change_task_status(task_id, new_status, actor_id, tenant_id)
-- rpc_create_meeting(title, date, meeting_time, tags, actor_id, tenant_id, idempotency_key)
-- rpc_change_meeting_status(meeting_id, new_status, actor_id, tenant_id)
-- rpc_accept_suggested_task(meeting_id, task_title, task_body, actor_id, tenant_id)
-- rpc_create_library_item(type, title, description, url, tags, is_public, actor_id, tenant_id, idempotency_key)
-- rpc_upsert_diary_entry(date, summary, content, actor_id, tenant_id)  -- diary is workspace-scoped
-- rpc_add_grocery_item(name, quantity, unit, category, actor_id, tenant_id, idempotency_key)
-- rpc_check_grocery_item(item_id, is_checked, actor_id, tenant_id)
-- rpc_create_company(name, domain, description, tags, actor_id, tenant_id, idempotency_key)
-- rpc_create_person(name, email, role, notes, tags, actor_id, tenant_id, idempotency_key)
-- rpc_create_deal(title, status, value, notes, tags, actor_id, tenant_id, idempotency_key)
-- rpc_change_deal_status(deal_id, new_status, actor_id, tenant_id)
-- rpc_add_comment(entity_type, entity_id, entity_label, comment_body, actor_id, tenant_id)
-- rpc_update_entity(table_name, entity_id, fields jsonb, actor_id, tenant_id)  -- generic
```

These RPCs are defined in the initial migration. Each is a SECURITY DEFINER function so it can bypass RLS internally while still running in the caller's transaction context. The API route validates identity and resolves `tenant_id` from the actor's `tenant_members` row before calling — the RPC trusts the actor_id and tenant_id it receives. Clients never supply `tenant_id` directly.

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

No RLS needed — this table is accessed exclusively from SECURITY DEFINER RPC functions (e.g. `rpc_create_task`). The idempotency check, entity insert, and `idempotency_keys` write all happen in the same atomic transaction inside the RPC. The API route handler calls `supabase.rpc(...)` using the publishable key + caller session — no secret key required at runtime.

### Agent Token Revocation

No `revoked_agent_tokens` table needed. Token revocation is handled natively by Supabase session management: `supabase.auth.admin.signOut(agentUserId, { scope: 'global' })`. This invalidates all active sessions for the agent immediately. Re-issue by re-running `scripts/generate-agent-sessions.ts` and updating the agent's config.

### Notifications (stub — no UI, no triggers in v1)

```sql
CREATE TABLE notifications (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text,
  entity_type text,
  entity_id   uuid,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own notifications" ON notifications FOR SELECT
  USING (user_id = auth.uid());
```

> Notifications are user-specific (routed to a specific person), so `user_id` scoping is correct here. The `tenant_id` is for organizational context. No triggers or UI in v1.

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
    const { supabase, actorId, tenantId } = await resolveActor(request);
    if (!tenantId) throw new Error("Actor is not a member of any workspace");

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
      p_tenant_id: tenantId,
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
    "tenant_id": "tenant-uuid",
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
    const { supabase, actorId, tenantId } = await resolveActor(request);
    if (!tenantId) throw new Error("Actor is not a member of any workspace");

    const body = await request.json();
    const { task_id, status } = schema.parse(body);

    // Single atomic RPC — updates status + writes activity_log (with old/new values) in one transaction
    const { data: task, error } = await supabase.rpc("rpc_change_task_status", {
      p_task_id: task_id,
      p_new_status: status,
      p_actor_id: actorId,
      p_tenant_id: tenantId,
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
    const { supabase, actorId, tenantId } = await resolveActor(request);
    if (!tenantId) throw new Error("Actor is not a member of any workspace");

    const body = await request.json();
    const { table, id, fields } = schema.parse(body);

    // Prevent updating protected fields
    const PROTECTED_FIELDS = ["id", "tenant_id", "created_at", "ticket_id"];
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
      p_tenant_id: tenantId,
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
Authorization: Bearer <jwt>

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

| Table | Workspace Members | Admin Read | Public Read | Notes |
|-------|------------------|-----------|-------------|-------|
| tenants | Read own tenant | — | — | Via `tenant_members` subquery |
| tenant_members | Read own tenant | — | — | Superadmin manages membership |
| profiles | Own row (read/write) | All rows | — | Not tenant-scoped |
| agent_owners | Own row (agent reads) | All (superadmin) | — | Not tenant-scoped |
| tags | Full CRUD | — | — | `is_tenant_member(tenant_id)` — shared within workspace |
| tasks | Full CRUD | All | — | `is_tenant_member(tenant_id)` |
| meetings | Full CRUD | All | — | `is_tenant_member(tenant_id)` |
| library_items | Full CRUD | All | `is_public=true` | `is_tenant_member(tenant_id)` |
| diary_entries | Full CRUD | All | — | `is_tenant_member(tenant_id)` |
| grocery_items | Full CRUD | — | — | `is_tenant_member(tenant_id)` |
| companies | Full CRUD | All | — | `is_tenant_member(tenant_id)` |
| people | Full CRUD | All | — | `is_tenant_member(tenant_id)` |
| deals | Full CRUD | All | — | `is_tenant_member(tenant_id)` |
| people_companies | Via parent tenant | — | — | JOIN to `people.tenant_id` |
| deals_companies | Via parent tenant | — | — | JOIN to `deals.tenant_id` |
| deals_people | Via parent tenant | — | — | JOIN to `deals.tenant_id` |
| meetings_people | Via parent tenant | — | — | JOIN to `meetings.tenant_id` |
| meetings_companies | Via parent tenant | — | — | JOIN to `meetings.tenant_id` |
| activity_log | Read (tenant-scoped) | All | — | Append-only. INSERT via SECURITY DEFINER RPCs only. |

### UPDATE Policies: USING + WITH CHECK

**UPDATE policies require both USING and WITH CHECK.** `USING` controls which rows a user can target. `WITH CHECK` controls what the row can look like after the update. Without `WITH CHECK`, a workspace member could change a row's `tenant_id`, moving it to another workspace — creating cross-tenant data injection. Every UPDATE policy in AgentBase sets both clauses to `is_tenant_member(tenant_id)`.

### The Tenant Membership Pattern (Used Everywhere)

Every entity RLS policy uses the `is_tenant_member()` helper:
```sql
USING (is_tenant_member(tenant_id))
WITH CHECK (is_tenant_member(tenant_id))
```

This calls the SECURITY DEFINER function that checks `tenant_members` for a matching `(tenant_id, user_id)` row. For performance, `tenant_members` has a composite PK on `(tenant_id, user_id)` — the check is a single index lookup.

**Performance note:** If membership checks become a bottleneck (unlikely with <100 users), we can memoize with `SET LOCAL` at the start of each request. But for the expected scale, this is fine.

**Semantic command RPCs and RLS:** Semantic command RPCs are SECURITY DEFINER functions. They bypass RLS internally to perform mutations — which is intentional, because the API route has already validated actor identity. RLS still applies to all direct table reads.

### RLS on Join Tables

Join tables (people_companies, deals_companies, deals_people, meetings_people, meetings_companies) don't have `tenant_id` directly. They inherit access from their parent entity:

```sql
-- Example: people_companies
CREATE POLICY "..." ON people_companies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE people.id = people_companies.person_id
      AND is_tenant_member(people.tenant_id)
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
  tenant_id: string;
  actor_id: string;
  actor_type: "human" | "agent";
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
}

// Wraps <ComboInput> with tag-specific behavior:
// - Fetches all tags for the current workspace (tenant). Tags created by any member are visible to all members.
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
  /** Markdown content */
  content: string;
  /** Called on content change (serialized to Markdown) */
  onChange: (markdown: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Minimal mode (no toolbar, just formatting shortcuts) */
  minimal?: boolean;
}

// Wraps Tiptap with:
// - StarterKit (headings, bold, italic, lists, code blocks)
// - Markdown input rules (type **bold** → renders bold)
// - Serializes to Markdown on change (not HTML)
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
│   └── generate-agent-sessions.ts # One-time: generate agent refresh tokens via admin API; Supabase client handles rotation automatically
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

- [ ] Create agent users (Lucy, Frank) via `scripts/create-agent-users.ts`
- [ ] Initialize Next.js 16 with App Router, TypeScript strict, pnpm (`pnpm create next-app@latest` then upgrade to next@16)
- [ ] Install and configure Tailwind CSS v4 + shadcn/ui
- [ ] Set up Supabase project (or configure for existing)
- [ ] Create all Supabase client helpers (`lib/supabase/client.ts`, `server.ts`, `middleware.ts`)
- [ ] Write `middleware.ts` (auth session refresh + route protection)
- [ ] Write `lib/auth.ts` (getSession, getUserProfile, requireAuth, requireAdmin)
- [ ] Deploy initial migration (`00000000000000_initial.sql`) — all tables, RLS, triggers
- [ ] Set up Google OAuth in Supabase Auth
- [ ] Build auth pages (`/auth/login`, `/auth/callback`, `/auth/logout`)
- [ ] Create `.env.example` with all required env vars (see §2 Environment Variables — runtime vars only, no `SUPABASE_SECRET_KEY`)
- [ ] Generate agent sessions via `scripts/generate-agent-sessions.ts`, store refresh tokens in agent configs
- [ ] Ship empty `AppShell` with sidebar nav (all items, no content yet)
- [ ] Add per-actor rate limiting middleware on `/api/commands/*` — simple in-memory or Supabase-based counter. Limit: 60 requests/minute per `actor_id`. Protects against runaway agents burning Vercel/Supabase quotas.
- [ ] Verify: user can sign in, see empty shell, sign out

### Phase 2: Command Bus & Activity System

**Goal:** The full command bus infrastructure is working. Activity log writes and reads work. Toast system works.

- [ ] Build `resolveActor()` — auth resolution for API routes (reads `Authorization: Bearer <token>`, verifies via `supabase.auth.getUser()`, no local secret needed)
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
- [ ] Build diary page (calendar or date-list view, one shared entry per workspace per day)
- [ ] Build diary EditShelf content (summary, rich text content). Any team member or agent can write to it.
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
- [ ] Build Admin → Agents page (superadmin only: create agent with name + avatar, issue/revoke refresh token, assign owner; agents listed with status chip showing last seen; credentials displayed once on creation for operator to copy into agent config)
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

## 11. Resolved Questions

All questions have been resolved. No open questions remain.

1. ~~**Agent user_id in writes**~~ — **RESOLVED.** Entity rows use `tenant_id` (workspace), not creator identity. Attribution lives in `activity_log.actor_id` on the created event. There is no `created_by` column on entity tables.

2. ~~**Activity by non-users**~~ — **RESOLVED.** No anonymous/system events. Every activity event must have a real `actor_id` referencing `auth.users` (human or agent). The valid `actor_type` values are `'human' | 'agent'` — no platform/system actor. If a mutation has no authenticated actor, it is rejected at the API layer. DB triggers are not used for activity logging.

3. ~~**Rich text storage format**~~ — **RESOLVED.** Markdown everywhere. Tiptap configured with markdown input rules, serializes to Markdown on save. All `text` content columns store Markdown. Portable, diffable, agent-friendly.

4. ~~**Meeting lifecycle**~~ — **RESOLVED.** `ended` = same as `wrapping_up` (post-meeting, notes/tasks being wrapped up). Final state is `closed` (fully processed). Lifecycle: `upcoming → in_meeting → ended → closed`.

5. ~~**Grocery and Diary shared workspace resources**~~ — **RESOLVED.** One global grocery list per workspace. One global diary per workspace per day. Both are tenant-scoped like all other entities. Everyone sees the same list and diary entries. No per-user scoping on diary.

6. ~~**Tag scope**~~ — **RESOLVED.** Tags are shared within a workspace (tenant-scoped). All members see and can reuse each other's tags. `UNIQUE (tenant_id, name)`.

7. ~~**Deal statuses**~~ — **RESOLVED.** Use `lead | qualified | proposal | negotiation | won | lost`.

8. ~~**Comments**~~ — **RESOLVED.** Comments live only in `activity_log` with `event_type = 'commented'` and `payload: { comment_body: "..." }`. No separate comments table.

9. ~~**Notifications table**~~ — **RESOLVED.** Notifications table stub included in the initial migration (see §5). No UI, no triggers in v1. Notifications are user-specific (`user_id` scoping) with `tenant_id` for organizational context.

---

## 12. Key Differences from HAH Toolbox (and Why)

| Area | HAH Toolbox | AgentBase | Why |
|------|-------------|-----------|-----|
| **Multi-tenancy** | Single-user app — no workspace concept. All data implicitly belongs to one user. | All entity tables (`tasks`, `meetings`, `library_items`, etc.) have `tenant_id` as the scoping field. `user_id` does **not** appear on entity tables — it exists only in `tenant_members` (maps users into workspaces), `agent_owners` (maps agents to owners), and `notifications` (per-person routing). Attribution is separate: `activity_log.actor_id`. | Correct separation of visibility (workspace) vs. attribution (who did it). Adding a teammate = one row in `tenant_members`, no schema changes. |
| **Agent auth** | Service role key + `SET LOCAL app.current_actor` | Real Supabase Auth users with refresh token sessions. `auth.uid()` resolves natively in all triggers and RLS policies. No JWT signing, no custom crypto. See §3.5. | Eliminates the fragile `SET LOCAL` pattern. Proper audit trail. RLS works naturally. |
| **Mutation path** | Direct Supabase client calls from components | All mutations go through API routes (command bus) | Agents (external HTTP clients) need the same endpoints as the browser. Server actions can't be called by Docker containers. |
| **Activity log** | `author` as text (`"hunter"`, `"frank"`). No tenant scope. | `actor_id` as UUID FK to `auth.users`. `tenant_id` for workspace-scoped visibility. | Multi-tenant safe. Proper FK relationships. Actors resolved client-side. |
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
| **Grocery schema** | `item` (text), `checked` (bool), no scoping | `name`, `quantity`, `unit`, `category`, `is_checked`, `sort_order`, `tenant_id` | Multi-tenant. Richer data model for better UX (categories, quantities). |
| **Tags** | Global (one namespace) | Per-workspace (scoped by `tenant_id`) | Multi-tenant isolation. Tags shared within a workspace. |
| **Migration strategy** | 35+ incremental migrations (organic growth) | Single initial migration with complete schema | Greenfield advantage. Clean start. |
| **Atomicity** | Two separate Supabase calls (entity update, then activity insert) — can get out of sync | Single Postgres RPC call — entity mutation + activity_log insert in one transaction | Guaranteed consistency. No orphaned events. |

---

## Later / Low Priority

These are real concerns but deliberately out of scope for v1. Ticket them when the core is stable.

### L-1: Agent session health monitoring
Agents use Supabase refresh token sessions — the Supabase JS client handles access token rotation automatically. Future work: add a lightweight `/api/agent/ping` endpoint that agents call periodically; if the session has expired or been revoked, the ping returns 401 and the agent alerts its operator. The Admin → Agents page could surface a "last seen" timestamp based on this. Also consider: PKCE-based agent auth flow for tighter security without storing long-lived refresh tokens.

### L-2: Smart event detection on generic update route
The `PATCH /api/commands/update` route writes `event_type: "updated"` for all field changes. For known semantic fields (status, priority, assignee), it could detect the change and write a richer event (e.g. `status_changed` with old/new values) automatically. Not blocking — semantic action routes handle the important mutations. Add after v1 is stable.

### L-3: Schema migration strategy for self-deployers
Once others deploy AgentBase, schema updates need a documented path. Future work: document `supabase db push` workflow, add a `schema_version` table, add a `/api/health` endpoint that reports schema version so deployed instances know when they're behind.

### L-4: Webhook / event broadcast system
The activity_log writes structured events for every mutation. Future work: add a `webhooks` table where users register URLs to receive event payloads. Makes the platform extensible without writing integrations into the core.

### L-5: Rich text format — RESOLVED
Markdown everywhere. Tiptap configured with markdown input rules and serializes to Markdown on save. All `text` content columns store Markdown. Portable, diffable, agent-friendly.

### L-6: Push / email notifications
The `notifications` table is in the schema (stub only). No UI, no triggers. Build when there's a real use case.

### L-7: Grocery and Diary sharing — RESOLVED
Both grocery and diary are workspace-scoped (tenant_id). One shared grocery list and one shared diary per workspace. All tenant members (humans and agents) can read and write.

### L-8: Field-level validation on generic update route
The `PATCH /api/commands/update` route validates table name and protected fields (tenant_id, actor_id) but doesn't validate field values — Postgres CHECK constraints are the only guard. Future work: add optional per-table validation schemas (e.g. zod) that the generic route checks before writing. Not a v1 concern — CHECK constraints catch bad data at the DB level.

### L-9: Artifacts table for OpenClaw tool traces
OpenClaw agents generate tool outputs — screenshots, DOM dumps, search results, file reads. Currently, `activity_log.payload` can hold small JSON blobs, but large binary or text artifacts would bloat the log. Future work: add an `artifacts` table with object storage pointers (Supabase Storage or S3-compatible), and allow `activity_log.payload` to reference artifact IDs instead of embedding content inline. Design the schema now if agents start generating large outputs.

### L-10: MCP transport layer for the command bus
The command bus is already a stable, typed HTTP interface (`/api/commands/*`). MCP (Model Context Protocol) is just another transport on top of it. Future work: expose AgentBase commands as MCP tools so any MCP-compatible agent (Claude, OpenClaw, third-party) can call `createTask`, `addComment`, `changeMeetingStatus`, etc. natively without custom skill code or HTTP wiring. The command bus design makes this straightforward — each semantic action maps 1:1 to an MCP tool definition. Worth doing as the ecosystem matures.
