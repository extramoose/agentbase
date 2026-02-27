import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import '@/lib/env' // Boot-time env validation
import { ToastProvider } from '@/components/toast-provider'
import { PostHogProvider } from '@/providers/posthog'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AgentBase',
  description: 'Multi-agent Life OS for async-native teams',
  robots: 'noindex, nofollow', // Private app — don't index
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <PostHogProvider>
          {children}
          <ToastProvider />
        </PostHogProvider>
      </body>
    </html>
  )
}
