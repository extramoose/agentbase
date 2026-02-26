# AgentBase Scripts

One-time setup scripts for initializing the AgentBase workspace and agent accounts.

> ⚠️ All scripts use `SUPABASE_SECRET_KEY`. This key bypasses all RLS. **Never add it to Vercel or any runtime environment.**

## Prerequisites

```bash
# Install tsx for running TypeScript scripts directly
pnpm add -D tsx
```

## Run Order

### Step 1: Hunter signs in

Deploy the app (or run locally). Sign in with your Google account. This creates your `auth.users` row and triggers the `profiles` insert.

Find your user UUID from the Supabase dashboard → Auth → Users.

### Step 2: Seed the workspace

Creates HunterTenant and grants you superadmin role.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SECRET_KEY=<your-secret-key> \
HUNTER_USER_ID=<your-uuid-from-supabase-dashboard> \
npx tsx scripts/seed.ts
```

Copy the `TENANT_ID` from the output.

### Step 3: Create agent users

Creates `frank@internal.hah.to` and `lucy@internal.hah.to` as real Supabase Auth users with `role: agent` in the workspace.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SECRET_KEY=<your-secret-key> \
HUNTER_USER_ID=<your-uuid> \
TENANT_ID=<tenant-uuid-from-step-2> \
npx tsx scripts/create-agent-users.ts
```

### Step 4: Generate agent sessions

Generates refresh tokens for Frank and Lucy. The Supabase JS client uses these to auto-refresh — no manual maintenance needed.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SECRET_KEY=<your-secret-key> \
npx tsx scripts/generate-agent-sessions.ts
```

Copy each `AGENTBASE_REFRESH_TOKEN` into the respective agent config:
- **Frank** → `openclaw.json` env block
- **Lucy** → her workspace config

### Agent runtime usage

Agents initialize their Supabase client once at startup:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

await supabase.auth.setSession({
  access_token: '',  // empty — will be refreshed automatically
  refresh_token: process.env.AGENTBASE_REFRESH_TOKEN!,
})

// From here: auth.uid() resolves to the agent's UUID in all DB calls
```

### Revoking an agent session

```bash
# From a script using the secret key:
await supabase.auth.admin.signOut(agentUserId, { scope: 'global' })
# Then re-run generate-agent-sessions.ts to issue a new token
```
