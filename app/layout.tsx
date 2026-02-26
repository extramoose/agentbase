import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { assertEnv } from '@/lib/env'
import { ToastProvider } from '@/components/toast-provider'

assertEnv()

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AgentBase',
  description: 'Multi-agent Life OS',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        {children}
        <ToastProvider />
      </body>
    </html>
  )
}
