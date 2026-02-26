'use client'

import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  if (!content?.trim()) return null
  return (
    <div className={cn('prose-content', className)}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}
