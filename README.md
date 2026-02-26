# agentbase
Refer to PLAN.md

## Getting Started

### Prerequisites
- Node.js 20.9+
- pnpm 9+
- Supabase project (URL + anon key)

### Local development

1. Clone the repo
2. Copy `.env.example` to `.env.local` and fill in your values
3. Install deps: `pnpm install`
4. Run dev server: `pnpm dev`
5. For DB setup, see `scripts/README.md`

### Scripts (one-time setup)
See `scripts/README.md` for the full setup sequence:
seed → create-agent-users → generate-agent-sessions

### Deployment
Deploy to Vercel. Set env vars from `.env.example` (never `SUPABASE_SECRET_KEY`).