export function assertEnv() {
  if (
    process.env.SUPABASE_SECRET_KEY &&
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error(
      'SUPABASE_SECRET_KEY must not be present in the production runtime environment. ' +
      'It belongs only in local scripts. Remove it from Vercel env vars immediately.'
    )
  }
}
