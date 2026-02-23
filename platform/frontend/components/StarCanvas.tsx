'use client'

import { useEffect, useRef } from 'react'

export default function StarCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    // Respect reduced motion preferences
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motionQuery.matches) return

    const C = ref.current
    if (!C) return
    const X = C.getContext('2d')
    if (!X) return

    let W = 0, H = 0
    let stars: Array<{ x: number; y: number; r: number; a: number; s: number }> = []
    let nebulae: Array<{ x: number; y: number; r: number; h: number; a: number }> = []
    let t = 0, raf = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = window.innerWidth
      H = window.innerHeight
      C.width = W * dpr
      C.height = H * dpr
      C.style.width = `${W}px`
      C.style.height = `${H}px`
      X.scale(dpr, dpr)
      init()
    }

    const init = () => {
      // Scale star count to viewport — fewer on mobile
      const area = W * H
      const count = Math.min(Math.floor(area / 6000), 250)

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
        a: Math.random() * 0.035 + 0.015,
      }))
    }

    const draw = () => {
      X.clearRect(0, 0, W, H)

      // Nebulae
      for (const n of nebulae) {
        const g = X.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r)
        g.addColorStop(0, `hsla(${n.h},70%,50%,${n.a})`)
        g.addColorStop(1, 'transparent')
        X.fillStyle = g
        X.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2)
      }

      // Stars
      for (const s of stars) {
        const twinkle = 0.4 + 0.6 * Math.sin(t * s.s * 6 + s.a * 100)
        X.beginPath()
        X.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        X.fillStyle = `rgba(230,220,255,${twinkle * 0.8})`
        X.fill()
      }

      t++
      raf = requestAnimationFrame(draw)
    }

    window.addEventListener('resize', resize)
    resize()
    draw()

    return () => {
      window.removeEventListener('resize', resize)
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
