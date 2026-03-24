'use client'

import { useEffect, useRef } from 'react'

// ---------- types ----------
interface TopoCluster {
  x: number
  y: number
  rings: number
  maxR: number
  opacity: number
}

interface Ping {
  x: number
  y: number
  birth: number
  life: number   // total frames to live
  maxR: number
}

// ---------- component ----------
export default function StarCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const C = ref.current
    if (!C) return
    const X = C.getContext('2d')
    if (!X) return

    // Respect reduced-motion preference and mobile viewport
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isMobile = window.matchMedia('(max-width: 768px)').matches

    let W = 0
    let H = 0
    let raf = 0
    let lastFrame = 0
    let frame = 0
    // Mobile: 8fps (grid still visible, radar/pings disabled below)
    const TARGET_FPS = prefersReduced ? 10 : isMobile ? 8 : 24
    const FRAME_INTERVAL = 1000 / TARGET_FPS

    // Radar state
    let radarAngle = 0
    const RADAR_SPEED = prefersReduced ? 0.005 : 0.012 // radians per frame

    // Topographic clusters (regenerated on resize)
    let topos: TopoCluster[] = []

    // Active pings
    let pings: Ping[] = []

    // Grid spacing
    const GRID_CELL = 60

    // ---- helpers ----
    const initTopos = () => {
      const count = Math.max(2, Math.floor((W * H) / 400000))
      topos = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        rings: Math.floor(Math.random() * 4) + 3,
        maxR: Math.random() * 120 + 60,
        opacity: Math.random() * 0.015 + 0.01,
      }))
    }

    const spawnPing = () => {
      if (pings.length >= 6) return // cap active pings
      pings.push({
        x: Math.random() * W,
        y: Math.random() * H,
        birth: frame,
        life: Math.floor(Math.random() * 80) + 60,
        maxR: Math.random() * 18 + 6,
      })
    }

    // ---- resize ----
    const resize = () => {
      W = C.width = window.innerWidth
      H = C.height = window.innerHeight
      initTopos()
      pings = []
    }

    // ---- draw functions ----

    const drawGrid = () => {
      X.strokeStyle = 'rgba(157, 95, 255, 0.025)'
      X.lineWidth = 1

      X.beginPath()
      // Vertical lines
      for (let x = 0; x <= W; x += GRID_CELL) {
        X.moveTo(x + 0.5, 0)
        X.lineTo(x + 0.5, H)
      }
      // Horizontal lines
      for (let y = 0; y <= H; y += GRID_CELL) {
        X.moveTo(0, y + 0.5)
        X.lineTo(W, y + 0.5)
      }
      X.stroke()
    }

    const drawRadarSweep = () => {
      const cx = W / 2
      const cy = H / 2
      const maxR = Math.sqrt(cx * cx + cy * cy) // reach corners

      // The sweep is a conical gradient simulated with an arc wedge
      const sweepAngle = Math.PI * 0.35 // width of the visible tail

      // Draw the fading sweep tail as layered arcs
      const steps = 12
      for (let i = 0; i < steps; i++) {
        const frac = i / steps // 0 = leading edge, 1 = trailing edge
        const alpha = 0.06 * (1 - frac)
        if (alpha < 0.002) continue

        const angle = radarAngle - frac * sweepAngle

        X.beginPath()
        X.moveTo(cx, cy)
        X.arc(cx, cy, maxR, angle - sweepAngle / steps, angle, false)
        X.closePath()
        X.fillStyle = `rgba(240, 184, 64, ${alpha})`
        X.fill()
      }

      // Leading line
      X.beginPath()
      X.moveTo(cx, cy)
      X.lineTo(cx + Math.cos(radarAngle) * maxR, cy + Math.sin(radarAngle) * maxR)
      X.strokeStyle = 'rgba(240, 184, 64, 0.08)'
      X.lineWidth = 1
      X.stroke()
    }

    const drawTopoCircles = () => {
      for (const t of topos) {
        const step = t.maxR / t.rings
        for (let i = 1; i <= t.rings; i++) {
          X.beginPath()
          X.arc(t.x, t.y, step * i, 0, Math.PI * 2)
          X.strokeStyle = `rgba(157, 95, 255, ${t.opacity})`
          X.lineWidth = 1
          X.stroke()
        }
      }
    }

    const drawPings = () => {
      const alive: Ping[] = []
      for (const p of pings) {
        const age = frame - p.birth
        if (age >= p.life) continue
        alive.push(p)

        const progress = age / p.life           // 0 → 1
        const r = p.maxR * progress
        const alpha = 0.4 * (1 - progress)

        // Outer expanding ring
        X.beginPath()
        X.arc(p.x, p.y, r, 0, Math.PI * 2)
        X.strokeStyle = `rgba(240, 184, 64, ${alpha})`
        X.lineWidth = 1.5
        X.stroke()

        // Center dot (fades faster)
        const dotAlpha = 0.6 * Math.max(0, 1 - progress * 2)
        if (dotAlpha > 0.01) {
          X.beginPath()
          X.arc(p.x, p.y, 2, 0, Math.PI * 2)
          X.fillStyle = `rgba(240, 184, 64, ${dotAlpha})`
          X.fill()
        }
      }
      pings = alive
    }

    // ---- main loop ----
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)

      // Throttle to target FPS
      if (now - lastFrame < FRAME_INTERVAL) return
      lastFrame = now

      X.clearRect(0, 0, W, H)

      drawGrid()

      if (!prefersReduced && !isMobile) {
        drawRadarSweep()
        radarAngle += RADAR_SPEED
        if (radarAngle > Math.PI * 2) radarAngle -= Math.PI * 2
      }

      drawTopoCircles()

      if (!prefersReduced && !isMobile) {
        drawPings()
        // Randomly spawn pings (roughly every 60–120 frames)
        if (Math.random() < 0.015) spawnPing()
      }

      frame++
    }

    // ---- visibility ----
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
      } else {
        lastFrame = 0
        raf = requestAnimationFrame(draw)
      }
    }

    // ---- init ----
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
      id="tactical-grid"
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
