# AgentBase Frontend Refactor Plan
*Author: Frank | Created: 2026-02-27*

> **DO NOT MODIFY PLAN.md or README.md** — this document is separate from those.
> Claude Code agents: read this entire document before writing any code.

---

## 1. Why This Refactor

The platform has three main entity experiences — Tasks, Library, CRM — each built independently with bespoke client components, shelf implementations, filter logic, and activity wiring. Bug fixes land in one but not others. New features get reimplemented three times. The experience is inconsistent.

**Goal:** Every entity type shares the same UI foundation. Fix once, works everywhere. The Tasks page (as it stands today, post-PR #79) is the gold standard for how the experience should feel.

**Scope:** Rebuild `app/(shell)/tools/` only. The backend (API routes, DB schema, RPCs, auth, command bus) is solid and stays untouched.

---

## 2. Object Model & Terminology (LOCKED)

### Platform definition
AgentBase is an **object management platform** for humans and agents. Everything trackable is an **Entity**.

### Entity types
| Type | Table | Description |
|------|-------|-------------|
| `task` | `tasks` | Work item with status, priority, assignee, due date, type |
| `library_item` | `library_items` | Captured knowledge/content with subtypes |
| `person` | `people` | CRM contact |
| `company` | `companies` | CRM organization |
| `deal` | `deals` | CRM opportunity, links to people + companies |

### Library item subtypes
One table, all fields, UI filters by subtype. Required fields per subtype:
- `favorite` → title + url
- `flag` → title
- `restaurant` → title + location
- `note` → title + body
- `idea` → title + body

### Shared fields on every entity
```ts
id: string           // UUID, primary key
seq_id: number       // Integer, used in URLs
tenant_id: string    // Tenant isolation
title: string        // Display name (tasks/library use "title"; CRM uses "name" mapped to title)
tags: string[]       // Free-form tags
assignee_id: string | null
assignee_type: 'human' | 'agent' | null
created_at: string
updated_at: string
deleted_at: string | null  // Soft delete (migration 029, coming soon)
```

### Locked vocabulary
- **Shelf** — right-side detail panel. Not "drawer", "modal", or "panel".
- **ActivityFeed** — the activity + comments block. Same component in shelves AND the History page. Not "timeline", not "history block".
- **EntityClient** — the shared React component powering each entity list + shelf.
- **SearchFilterBar** — the shared top bar with search input + filter chips.
- **History page** — the global cross-entity ActivityFeed, not filtered to one entity.
- **Entity** — generic term. Use specific type name (Task, Deal, etc.) when being specific.

---

## 3. Shared UI Behavior (Every Entity)

Every entity view MUST have:

### List view
- Grid + table toggle (persists in `?view=grid|table` URL param)
- SearchFilterBar at top (shared component, same props interface)
- Rows/cards are clickable → opens Shelf
- Empty state with CTA
- Optimistic updates on create/update/delete

### Shelf
- Opens from the right (`w-[480px]`)
- URL-synced: opening shelf pushes `?id=[seq_id]` to URL via `pushState`; closing pops it
- `popstate` listener restores shelf state on browser back/forward
- Fully editable inline (no separate edit mode)
- ActivityFeed at the bottom (always visible, `noCollapse`)
- Backdrop + Escape key closes

### SearchFilterBar
Shared component. Accepts:
- `?q=` — text search
- `?assignee=` — assignee UUID
- `?tag=` — tag filter
- `?type=` — entity subtype (library only)
- Entity-specific filters passed as props (e.g. `?status=` for tasks, `?priority=`)
- All params update URL via `history.replaceState` (no full reload)

### ActivityFeed
- Same `ActivityAndComments` component used in shelves and History page
- `noCollapse` always true in shelves
- Reads from `activity_log` table via entity type + entity id
- Comments POSTed via `/api/commands/add-comment`

### Real-time
- Supabase `channel` subscription on mount, unsubscribe on unmount
- Handles INSERT / UPDATE / DELETE events
- Updates local state directly — NEVER calls `router.refresh()`

### Mutations
- All writes go through the API routes (`/api/commands/*` or entity-specific routes)
- Optimistic update: apply change to local state immediately, rollback on error
- Toast on error
- Actor attribution maintained (Frank = agent path, Hunter = human path via UI)

---

## 4. EntityClient Component Contract

```ts
// The shared interface every entity view implements
interface EntityClientProps<T extends BaseEntity> {
  // Data
  initialEntities: T[]
  initialSelectedId?: number | null  // seq_id from URL

  // Entity config
  entityType: EntityType
  entityLabel: string               // 'task' | 'library item' | 'company' etc
  entityLabelPlural: string

  // Render
  renderGridCard: (entity: T, onClick: () => void) => React.ReactNode
  renderTableRow: (entity: T, onClick: () => void) => React.ReactNode
  renderShelfContent: (entity: T, onChange: (updated: T) => void) => React.ReactNode

  // Filters (entity-specific, rendered inside SearchFilterBar)
  renderFilterChips?: () => React.ReactNode

  // Actions
  onCreateEntity: (data: Partial<T>) => Promise<T>
}

type EntityType = 'task' | 'library_item' | 'person' | 'company' | 'deal'

interface BaseEntity {
  id: string
  seq_id: number | null
  tenant_id: string
  tags: string[]
  assignee_id: string | null
  assignee_type: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}
```

### Shared components to build (Session 1)
```
components/
  entity-client/
    entity-client.tsx          # The shared wrapper (list + shelf + realtime)
    entity-shelf.tsx           # Shared shelf frame (URL sync, backdrop, escape)
    entity-grid.tsx            # Shared grid container
    entity-table.tsx           # Shared table container
    search-filter-bar.tsx      # Already exists — audit + extend if needed
    activity-feed.tsx          # Thin wrapper around ActivityAndComments
    view-toggle.tsx            # Grid/table toggle button
```

---

## 5. URL Patterns (LOCKED)

```
/tools/tasks                    → task list, default tab=todo
/tools/tasks?id=42              → task list + task #42 shelf open
/tools/tasks?status=in_progress → filtered list
/tools/library                  → library list, grid view
/tools/library?id=7             → library list + item #7 shelf open
/tools/library?type=note        → filtered by subtype
/tools/crm/companies            → companies list
/tools/crm/companies?id=3       → companies list + company #3 shelf
/tools/crm/people               → people list
/tools/crm/people?id=5          → people list + person #5 shelf
/tools/crm/deals                → deals list (DEFAULT crm tab)
/tools/crm/deals?id=2           → deals list + deal #2 shelf
```

Shelf open/close uses `pushState`/`popstate` — NOT intercepting routes (broken in Next.js 16 for numeric IDs).

---

## 6. Nav Structure (Post-Refactor)

```
Tasks
Library
CRM
  └ Deals (default)
  └ Companies
  └ People
History
─────
Admin
```

**Grocery: removed from nav during refactor.** DB and API stay. UI removed. Will be revisited later.

---

## 7. Tasks Page — The Gold Standard

The current tasks page (post-PR #79) is the reference implementation. The refactored version must preserve:

- Tab bar: **To Do | In Progress | Done | ···** (overflow: Backlog, Blocked, Cancelled)
- URL state for all filters: `?status=`, `?type=`, `?q=`, `?assignee=`
- Face pile assignee filter (left of type chips, per ticket #163)
- Drag-to-reorder within priority groups
- Optimistic create inline (add task at bottom of priority group)
- ActivityFeed in shelf, `noCollapse`
- Batch edit (checkbox multi-select)
- Real-time subscriptions (INSERT/UPDATE/DELETE)

The refactor should ADD to tasks:
- Grid view (cards, matching library card style)
- Tag filter chip in SearchFilterBar

---

## 8. CRM Structure

CRM nav order: **Deals | Companies | People** (Deals first — it's the primary commercial object).

Deals page gets a simple funnel/pipeline visualization at the top (stage counts, visual bar). This is built during Session 4.

All three CRM entities get the full EntityClient treatment: list (grid + table), shelf, SearchFilterBar, ActivityFeed, real-time.

---

## 9. History Page

The History page is a **global ActivityFeed** — same `ActivityAndComments` component, not filtered to one entity.

Requirements:
- Shows all activity_log entries across all entities, newest first
- Actor chip (human/agent avatar + name)
- Entity type chip (what kind of object was affected)
- Clickable entity reference → opens that entity's shelf in context (ticket #156)
- Pagination (load more)

During Session 5, audit all entity mutations to ensure they write to activity_log. Missing entries get added.

---

## 10. What Tickets Are Absorbed Into This Refactor

The following open tickets are resolved by this refactor — do not build them separately:

| Ticket | How resolved |
|--------|-------------|
| #155 shelf flicker | New shelf implementation eliminates the cause |
| #156 shelf doesn't open from History | New URL-sync shelf pattern + entity linking |
| #162 CRM header alignment | Built correctly from scratch |
| #163 face pile refinement | Built into SearchFilterBar spec |
| #170 real-time for library + CRM | Baked into EntityClient |
| #171 activity logging audit | Done in Session 5 |
| #175 tags filter | Built into SearchFilterBar + EntityClient |

Close these tickets when their session completes.

---

## 11. Execution Sessions

### Pre-refactor (do before starting sessions)
- [ ] Fix #157 — filter params leaking into entity URLs (10 min, surgical)
- [ ] Verify #165 — OpenRouter key wired correctly
- [ ] Fix #163 — face pile to left of type chips (surgical, 20 min)
- [ ] Fix #161 — CRM nav deals first (surgical, 10 min)
- [ ] Fix #159 — task number pill in activity feed (surgical, 20 min)

---

### Session 1 — Shared Foundation
**Ticket:** #176 (to be filed)
**Branch:** `refactor/session-1-foundation`
**Delivers:**
- `components/entity-client/entity-client.tsx` — shared wrapper with list + shelf + realtime logic
- `components/entity-client/entity-shelf.tsx` — shelf frame, URL sync (pushState/popstate), backdrop, Escape
- `components/entity-client/entity-grid.tsx` — shared grid container
- `components/entity-client/entity-table.tsx` — shared table container with sortable columns
- `components/entity-client/view-toggle.tsx` — grid/table toggle, URL-persisted
- `components/entity-client/search-filter-bar.tsx` — audit existing SearchFilterBar; extend with tag filter, view toggle
- TypeScript interfaces: `BaseEntity`, `EntityClientProps<T>` in `types/entities.ts`
- No entity-specific code in this session — foundation only
- `npx tsc --noEmit` must pass

**Claude Code instructions:** Read this document fully. Read existing `components/search-filter-bar.tsx`, `components/right-shelf.tsx`, `components/activity-and-comments.tsx`, `lib/format-activity.tsx`. Build the shared foundation components as specified. Do not touch any page-level files.

---

### Session 2 — Tasks on Foundation
**Ticket:** #177 (to be filed)
**Branch:** `refactor/session-2-tasks`
**Delivers:**
- `app/(shell)/tools/tasks/tasks-client.tsx` rebuilt on `EntityClient<Task>`
- Preserves ALL current behavior (tab bar, overflow menu, drag-reorder, batch edit, face pile, real-time, URL state)
- ADDS: grid view (card layout matching Library card style)
- ADDS: tag filter chip in SearchFilterBar
- Grocery removed from nav (delete nav link only — leave DB/API)
- All #tasks-related tickets in the absorbed list closed
- `npx tsc --noEmit` must pass

**Claude Code instructions:** Read this document. Read the current `tasks-client.tsx` in full before writing anything. The refactored version must match all existing behavior exactly — do not remove features. Use `EntityClient<Task>` as the wrapper. Reference the Session 1 components. Tasks is the gold standard.

---

### Session 3 — Library on Foundation
**Ticket:** #178 (to be filed)
**Branch:** `refactor/session-3-library`
**Delivers:**
- `app/(shell)/tools/library/library-client.tsx` rebuilt on `EntityClient<LibraryItem>`
- Grid view (already exists — port to EntityClient grid)
- Table view (new — columns: title, type, url, tags, created_at)
- Shelf: shows correct fields by subtype (all fields exist, UI filters by type)
- SearchFilterBar with: `?q=`, `?type=` (subtype filter), `?tag=`, `?assignee=`
- Real-time subscriptions (INSERT/UPDATE/DELETE)
- ActivityFeed in shelf
- URL-sync shelf (`?id=[seq_id]`)
- `npx tsc --noEmit` must pass

**Claude Code instructions:** Read this document. Read current `library-client.tsx` and `library/[id]/page.tsx`. Port the existing grid to EntityClient. Add table view. One shelf component handles all library subtypes — use conditional rendering for required fields, not separate components.

---

### Session 4 — CRM on Foundation
**Ticket:** #179 (to be filed)
**Branch:** `refactor/session-4-crm`
**Delivers:**
- `app/(shell)/tools/crm/crm-client.tsx` rebuilt on `EntityClient`
- Three entity types (Deal, Company, Person) each get full EntityClient treatment
- Nav order: Deals (default) | Companies | People
- Deals page: simple funnel visualization at top (stage counts as horizontal bar — no external chart library)
- Each entity: grid + table, shelf, SearchFilterBar, ActivityFeed, real-time, URL-sync shelf
- Cross-entity links (deals → companies, deals → people) remain functional
- `npx tsc --noEmit` must pass

**Claude Code instructions:** Read this document. Read current `crm-client.tsx` and all CRM page files. Three entity types, one session — keep each entity's shelf focused on its specific fields. Deals funnel: count deals by stage (lead/qualified/proposal/closed_won/closed_lost), render as a simple colored horizontal bar with counts. No recharts or new packages.

---

### Session 5 — History + Activity Audit
**Ticket:** #180 (to be filed)
**Branch:** `refactor/session-5-history`
**Delivers:**
- History page rebuilt: global ActivityFeed, paginated, actor chips, entity type chips
- Clicking any entity reference in History opens the entity's shelf in context (resolves #156)
- Audit all entity API routes — every mutation must write to activity_log:
  - Tasks: ✅ known good
  - Library items: verify create/update/delete/comment all log
  - Companies, People, Deals: verify create/update/delete/comment all log
  - Grocery: verify (even though not in nav)
- Any gaps get fixed in the API routes
- Closes ticket #171 (activity audit)
- `npx tsc --noEmit` must pass

**Claude Code instructions:** Read this document. Read `app/(shell)/tools/history/` and all entity API routes. Check every route for activity_log writes. Fix missing ones. Rebuild History page on the shared ActivityFeed component. Entity reference chips should be clickable — navigate to `/tools/[type]?id=[seq_id]`.

---

### Post-refactor (after all sessions merged)
These tickets are then straightforward to execute:
- **#169** Soft deletes (migration + thin UI layer on top of EntityClient)
- **#160** Global entity linking (combobox in EntityShelf, adjacent to tags)
- **#166** Test infrastructure
- **#158** pgvector semantic search
- **#172** Error boundaries
- **#174** Cursor audit

---

## 12. Rules for Claude Code Agents Executing This Plan

1. **Read this document in full before writing any code**
2. **Read all files you will modify before modifying them**
3. **Do not modify `PLAN.md` or `README.md`**
4. **`npx tsc --noEmit` must pass before declaring done**
5. **Do not install new packages** — use existing shadcn components and existing dependencies
6. **Do not call `router.refresh()`** in real-time handlers
7. **Do not use intercepting routes** (`@modal/` folders) — use URL-sync shelf pattern
8. **Preserve all existing behavior in Tasks** — it is the gold standard
9. **One session = one branch = one PR** — do not combine sessions
10. **If something in this document conflicts with the existing codebase in a way that blocks you, stop and output a clear description of the conflict. Do not guess.**

---

## 13. Tickets to File for Sessions

Sessions 1–5 each need a ticket filed before starting. Frank files these after this document is committed. Each ticket body links back to this document and the specific session section.

| Session | Ticket | Title |
|---------|--------|-------|
| 1 | #176 | Refactor S1: shared EntityClient foundation components |
| 2 | #177 | Refactor S2: Tasks rebuilt on EntityClient |
| 3 | #178 | Refactor S3: Library rebuilt on EntityClient |
| 4 | #179 | Refactor S4: CRM rebuilt on EntityClient |
| 5 | #180 | Refactor S5: History page + activity audit |
