'use client'

import { useEffect, useState, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UnfurlData {
  title: string | null
  description: string | null
  image: string | null
  favicon: string | null
  domain: string | null
}

interface LinkPreviewProps {
  url: string
  onDismiss?: () => void
  className?: string
}

export function LinkPreview({ url, onDismiss, className }: LinkPreviewProps) {
  const [data, setData] = useState<UnfurlData | null>(null)
  const [loading, setLoading] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    setData(null)
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    fetch(`/api/unfurl?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((d: UnfurlData) => {
        if (!controller.signal.aborted) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setData(null)
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [url])

  if (loading) {
    return (
      <div className={cn('bg-zinc-800 border border-zinc-700 rounded-lg p-3 animate-pulse h-[68px]', className)} />
    )
  }

  // Nothing useful to show
  if (!data || (!data.title && !data.description && !data.domain)) {
    return null
  }

  const hasImage = data.image?.startsWith('https://')

  return (
    <div
      className={cn(
        'bg-zinc-800 border border-zinc-700 rounded-lg p-3 flex gap-3 items-start cursor-pointer',
        className
      )}
      onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
    >
      {/* Favicon + domain */}
      <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
        {data.favicon && (
          <img
            src={data.favicon}
            alt=""
            width={16}
            height={16}
            className="rounded-sm"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        {data.domain && (
          <span className="text-xs text-zinc-400 max-w-[80px] truncate">{data.domain}</span>
        )}
      </div>

      {/* Title + description */}
      <div className="flex-1 min-w-0">
        {data.title && (
          <p className="text-sm font-medium text-zinc-100 line-clamp-1">{data.title}</p>
        )}
        {data.description && (
          <p className="text-xs text-zinc-400 line-clamp-2">{data.description}</p>
        )}
      </div>

      {/* Thumbnail image */}
      {hasImage && (
        <img
          src={data.image!}
          alt=""
          className="w-16 h-12 object-cover rounded shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}

      {/* Dismiss button */}
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
          className="text-zinc-500 hover:text-zinc-300 shrink-0 p-0.5"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
