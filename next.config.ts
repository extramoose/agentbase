import type { NextConfig } from 'next'
import path from 'path'

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  webpack(config) {
    // Force tailwindcss to resolve from this project's node_modules.
    // Without this, enhanced-resolve walks up and finds ~/Projects/package.json
    // which has no node_modules, causing "Can't resolve 'tailwindcss'" errors.
    config.resolve.alias = {
      ...config.resolve.alias,
      tailwindcss: path.resolve(__dirname, 'node_modules/tailwindcss'),
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
