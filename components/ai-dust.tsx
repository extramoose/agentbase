'use client'

import { useEffect, useRef } from 'react'

interface AiDustProps {
  active: boolean
}

export function AiDust({ active }: AiDustProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!active || !containerRef.current) return

    function spawnParticle() {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) return

      const particle = document.createElement('div')
      particle.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: 9999;
        width: 2px;
        height: 2px;
        border-radius: 50%;
        background: white;
        box-shadow: 0 0 3px 1px rgba(255,255,255,0.5);
      `
      document.body.appendChild(particle)

      // Pick a random point along the card's perimeter
      const perimeter = 2 * (rect.width + rect.height)
      const p = Math.random() * perimeter
      let startX: number, startY: number

      if (p < rect.width) {
        // top edge
        startX = rect.left + p
        startY = rect.top
      } else if (p < rect.width + rect.height) {
        // right edge
        startX = rect.right
        startY = rect.top + (p - rect.width)
      } else if (p < 2 * rect.width + rect.height) {
        // bottom edge
        startX = rect.right - (p - rect.width - rect.height)
        startY = rect.bottom
      } else {
        // left edge
        startX = rect.left
        startY = rect.bottom - (p - 2 * rect.width - rect.height)
      }

      // Drift outward from the edge
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const dx = startX - centerX
      const dy = startY - centerY
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const driftDist = 15 + Math.random() * 25
      const endX = startX + (dx / dist) * driftDist + (Math.random() - 0.5) * 20
      const endY = startY + (dy / dist) * driftDist + (Math.random() - 0.5) * 20

      const duration = 1500 + Math.random() * 1500

      const animation = particle.animate(
        [
          {
            transform: `translate(${startX}px, ${startY}px) scale(1)`,
            opacity: 0,
          },
          {
            opacity: 0.8,
            offset: 0.15,
          },
          {
            transform: `translate(${endX}px, ${endY}px) scale(0)`,
            opacity: 0,
          },
        ],
        {
          duration,
          easing: 'ease-out',
        },
      )

      animation.onfinish = () => particle.remove()
    }

    // Spawn particles at staggered intervals
    intervalRef.current = setInterval(spawnParticle, 400 + Math.random() * 200)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [active])

  return <div ref={containerRef} className="absolute inset-0 pointer-events-none" />
}
