// Boot-time assertion: throws if required env vars are missing.
// This runs at module import time — fail fast, not at request time.
// Note: SUPABASE_SECRET_KEY is intentionally NOT checked here (scripts-only).

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_APP_DOMAIN',
]

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
}

// Optional but warn if missing (non-fatal)
const optional = ['OPENROUTER_API_KEY']
for (const key of optional) {
  if (!process.env[key]) {
    console.warn(`[env] Optional env var not set: ${key} — some features will be disabled`)
  }
}

// Guard: SUPABASE_SECRET_KEY must not be in production runtime
if (process.env.SUPABASE_SECRET_KEY && process.env.NODE_ENV === 'production') {
  throw new Error(
    'SUPABASE_SECRET_KEY must not be present in the production runtime environment. ' +
    'It belongs only in local scripts. Remove it from Vercel env vars immediately.'
  )
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  appDomain: process.env.NEXT_PUBLIC_APP_DOMAIN!,
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
} as const
