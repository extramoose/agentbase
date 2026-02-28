# AgentBase

A multi-tenant workspace app where both humans and AI agents operate through the same API. Tasks, CRM, and library — all accessed through unified HTTP endpoints that don't care whether the caller is a browser or a bot.

Built as a personal productivity system with first-class agent support. The core idea: agents shouldn't need special SDKs or separate APIs. They get API keys, call the same REST endpoints browsers use, and every action they take is logged in the same activity feed as human actions.

## Tech stack

- **Next.js 16** App Router — all routes under `app/`, no pages directory
- **Supabase** — Postgres + Auth (Google OAuth) + Realtime subscriptions
- **TypeScript** strict mode — `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`
- **Tailwind v4** CSS-first config (no `tailwind.config.js`) — zinc palette, dark theme
- **shadcn/ui** (New York style) — base component primitives
- **Tiptap** — rich text editor with Markdown input/output
- **dnd-kit** — drag-and-drop task reordering
- **pnpm** — package manager
- **Zod** — runtime schema validation on all API inputs

## Architecture at a glance

**Command bus pattern.** All mutations flow through API routes (`/api/commands/update`, `/api/commands/add-comment`, `/api/commands/batch-update`, or entity-specific `POST`/`DELETE` routes). No server actions. Agents and browsers hit the same endpoints.

**SECURITY DEFINER RPCs.** Every create/update/delete calls a Postgres function that performs the entity mutation + activity log insert in one transaction. If either fails, both roll back. No partial writes.

**Dual auth via `resolveActorUnified`.** Bearer token in the `Authorization` header = agent (custom API key, SHA-256 hashed lookup). No Bearer header = human (cookie-based Supabase session). Both resolve to the same `ResolvedActor` type with `actorId`, `actorType`, and `tenantId`.

**RLS multi-tenancy.** Every table has a `tenant_id` column. Row Level Security policies use an `is_tenant_member()` helper to scope all reads and writes to the current user's workspace. SECURITY DEFINER RPCs bypass RLS internally (needed because agent API key clients don't have a Supabase JWT, so `auth.uid()` is null for them).

**Activity log.** Append-only `activity_log` table tracks every mutation across all entity types and actors. Powers the History page and per-entity activity feeds. `actor_type` is `'human' | 'agent'`. No FK constraint on `actor_id` — agents aren't in `auth.users`.

## Agent auth system

This is the most unusual part of the architecture.

Agents don't use Supabase Auth. They use custom API keys:

1. **Admin creates an agent** in the Admin UI (`/admin/agents`)
2. **Server generates a 32-byte random key**, stores the SHA-256 hash in the `agents` table, returns the plaintext key exactly once
3. **Agent stores the key** and sends it as `Authorization: Bearer <key>` on every API call
4. **`resolveActor()`** hashes the incoming token, looks up the hash via the `resolve_agent_by_key` RPC (SECURITY DEFINER, callable by anon role), returns agent metadata
5. **Revocation** = set `revoked_at` timestamp. The lookup RPC filters out revoked agents
6. **Permanent deletion** = superadmin only, only after revocation

## Getting started

### Prerequisites

- Node.js 20.9+
- pnpm 9+
- A Supabase project

### Local development

```bash
git clone <repo-url>
cd agentbase
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
pnpm install
pnpm dev
```

For database setup (creating your workspace and initial user), see [`scripts/README.md`](scripts/README.md).

### Environment variables

```
NEXT_PUBLIC_SUPABASE_URL      — Your Supabase project URL (required)
NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase publishable/anon key (required)
OPENROUTER_API_KEY            — For AI features (optional)
```

### Deployment

Deploy to Vercel. Set env vars from `.env.example`. Never expose `SUPABASE_SECRET_KEY` in runtime — it's for one-time setup scripts only.

## Folder structure

```
app/                      Next.js App Router pages and API routes
  (shell)/                Authenticated layout (sidebar, nav)
    tools/                Main apps: tasks, crm, library
    admin/                Agent management, user management, workspace settings
    history/              Global activity log with filters and infinite scroll
  api/                    REST API endpoints
    commands/             Command bus: create-*, update, batch-update, add-comment, delete-*, entity links
    tasks/                Task list (GET)
    crm/                  Companies, people, deals list (GET)
    library/              Library items list (GET)
    search/               Cross-entity search
    entities/             Recent entities
    entity-links/         Entity link queries
    admin/                Agent, user, and settings management
    unfurl/               URL metadata extraction for link previews
components/               React components
  ui/                     shadcn/ui primitives (button, input, badge, etc.)
  entity-client/          Shared EntityClient framework (grid, table, shelf)
  edit-shelf.tsx          Universal right-side edit panel
  activity-and-comments   Per-entity activity feed + comment box with Realtime
  rich-text-editor.tsx    Tiptap Markdown editor
  cmd-k.tsx               Command palette
  search-filter-bar.tsx   Search and filter controls
hooks/                    Custom React hooks (toast)
lib/
  api/                    resolve-actor (dual auth), rate-limit, error handling
  supabase/               Browser and server Supabase clients
  ai.ts                   OpenRouter chat completion wrapper
  auth.ts                 Session helpers, role guards (requireAuth, requireAdmin)
  format-activity.tsx     Activity log entry formatting
supabase/migrations/      Postgres migrations (schema, RPCs, RLS policies)
scripts/                  One-time setup: workspace seed
```

## Further reading

- [ARCHITECTURE.md](ARCHITECTURE.md) — deep dive into the command bus, auth system, RPCs, Realtime, and activity log
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to add new entity types, mutation rules, branch conventions
- [API.md](API.md) — API endpoint reference
- [scripts/README.md](scripts/README.md) — database setup and agent provisioning
