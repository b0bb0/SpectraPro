'use client'

import { useEffect, useRef } from 'react'

export default function StarCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const C = ref.current
    if (!C) return
    const X = C.getContext('2d')
    if (!X) return

    // Respect reduced-motion preference
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let W = 0, H = 0
    let stars: Array<{ x: number; y: number; r: number; a: number; s: number }> = []
    let nebulae: Array<{ x: number; y: number; r: number; h: number; a: number }> = []
    let t = 0, raf = 0
    let lastFrame = 0
    const TARGET_FPS = prefersReduced ? 10 : 24 // No need for 60fps on a background
    const FRAME_INTERVAL = 1000 / TARGET_FPS

    const resize = () => {
      W = C.width = window.innerWidth
      H = C.height = window.innerHeight
      init()
    }

    const init = () => {
      const count = Math.min(180, Math.floor((W * H) / 8000)) // Scale with viewport
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.5 + 0.3,
        a: Math.random(),
        s: Math.random() * 0.008 + 0.002,
      }))
      nebulae = Array.from({ length: 3 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 200 + 120,
        h: Math.random() > 0.5 ? 270 : 40,
        a: Math.random() * 0.04 + 0.02,
      }))
    }

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)

      // Throttle to target FPS
      if (now - lastFrame < FRAME_INTERVAL) return
      lastFrame = now

      X.clearRect(0, 0, W, H)

      // Nebulae
      for (const n of nebulae) {
        const g = X.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r)
        g.addColorStop(0, `hsla(${n.h},70%,50%,${n.a})`)
        g.addColorStop(1, 'transparent')
        X.fillStyle = g
        X.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2)
      }

      // Stars — batch into single path for performance
      X.beginPath()
      for (const s of stars) {
        const twinkle = prefersReduced
          ? 0.7
          : 0.4 + 0.6 * Math.sin(t * s.s * 6 + s.a * 100)
        X.moveTo(s.x + s.r, s.y)
        X.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      }
      X.fillStyle = 'rgba(230,220,255,0.55)'
      X.fill()

      t++
    }

    // Pause when tab is hidden
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
      } else {
        raf = requestAnimationFrame(draw)
      }
    }

    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', handleVisibility)
    resize()
    raf = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', handleVisibility)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      id="cosmos"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
