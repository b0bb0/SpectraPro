'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

/* ── Types ─────────────────────────────────────────────────────────── */
interface Vulnerability {
  id: string
  title: string
  severity: string
  cvssScore: number
  cveId: string
}

interface EvidenceGraphProps {
  target: string
  vulnerabilities: Vulnerability[]
  onNodeClick?: (vulnId: string) => void
}

/* ── Severity → color map ──────────────────────────────────────────── */
const SEVERITY_COLORS: Record<string, string> = {
  critical: '#a855f7',   // purple
  high:     '#ef4444',   // red
  medium:   '#f97316',   // orange
  low:      '#3b82f6',   // blue
  informational: '#6b7280', // gray
  info:     '#6b7280',
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'informational', 'info']

const FILTER_COLORS: Record<string, string> = {
  ALL:      '#f0b840',
  CRITICAL: '#a855f7',
  HIGH:     '#ef4444',
  MEDIUM:   '#f97316',
  LOW:      '#3b82f6',
  INFO:     '#6b7280',
}

/* ── Helpers ───────────────────────────────────────────────────────── */
function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + '…' : s
}

function severityKey(s: string) {
  return s.toLowerCase().replace('informational', 'info')
}

/* ── Component ─────────────────────────────────────────────────────── */
export default function EvidenceGraph({ target, vulnerabilities, onNodeClick }: EvidenceGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<string>('ALL')
  const [hoveredNode, setHoveredNode] = useState<number | null>(null)
  const nodesRef = useRef<{ x: number; y: number; vuln: Vulnerability; radius: number }[]>([])
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

  const filtered = filter === 'ALL'
    ? vulnerabilities
    : vulnerabilities.filter(v => severityKey(v.severity) === filter.toLowerCase())

  /* ── Stats ─────────────────────────────────────────────────────── */
  const stats = {
    nodes: filtered.length + 1,
    edges: filtered.length,
    critical: vulnerabilities.filter(v => severityKey(v.severity) === 'critical').length,
    high: vulnerabilities.filter(v => severityKey(v.severity) === 'high').length,
  }

  /* ── Draw ───────────────────────────────────────────────────────── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const W = rect.width
    const H = 520
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    // Background
    ctx.fillStyle = '#0a0a2e'
    ctx.fillRect(0, 0, W, H)

    // Starfield
    for (let i = 0; i < 120; i++) {
      const sx = (Math.sin(i * 127.1 + i) * 0.5 + 0.5) * W
      const sy = (Math.cos(i * 311.7 + i) * 0.5 + 0.5) * H
      const sr = 0.3 + (i % 3) * 0.4
      ctx.beginPath()
      ctx.arc(sx, sy, sr, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${0.15 + (i % 4) * 0.1})`
      ctx.fill()
    }

    const cx = W / 2
    const cy = H / 2

    // Center node halo rings
    for (let r = 60; r >= 20; r -= 10) {
      const alpha = 0.03 + (60 - r) * 0.008
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(240, 184, 64, ${alpha})`
      ctx.fill()
    }

    // Layout satellite nodes in a circle
    const orbitRadius = Math.min(W, H) * 0.36
    const nodes: typeof nodesRef.current = []
    const count = filtered.length

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2
      const vuln = filtered[i]
      const sev = severityKey(vuln.severity)
      const nodeRadius = sev === 'critical' ? 9 : sev === 'high' ? 7 : 6
      const nx = cx + Math.cos(angle) * orbitRadius
      const ny = cy + Math.sin(angle) * orbitRadius
      nodes.push({ x: nx, y: ny, vuln, radius: nodeRadius })
    }
    nodesRef.current = nodes

    // Draw edges (golden gradient lines)
    nodes.forEach(node => {
      const grad = ctx.createLinearGradient(cx, cy, node.x, node.y)
      grad.addColorStop(0, 'rgba(240, 184, 64, 0.6)')
      grad.addColorStop(1, 'rgba(240, 184, 64, 0.08)')
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(node.x, node.y)
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.2
      ctx.stroke()
    })

    // Draw satellite nodes
    nodes.forEach((node, i) => {
      const sev = severityKey(node.vuln.severity)
      const color = SEVERITY_COLORS[sev] || SEVERITY_COLORS.info
      const isHovered = hoveredNode === i

      // Glow
      if (sev === 'critical' || isHovered) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2)
        ctx.fillStyle = `${color}30`
        ctx.fill()
      }

      // Node circle
      ctx.beginPath()
      ctx.arc(node.x, node.y, isHovered ? node.radius + 2 : node.radius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()

      // Label
      ctx.font = '11px ui-monospace, monospace'
      ctx.fillStyle = isHovered ? '#ffffff' : '#c0b8d8'
      ctx.textAlign = 'center'
      ctx.fillText(truncate(node.vuln.title, 16), node.x, node.y + node.radius + 16)
    })

    // Center node
    ctx.beginPath()
    ctx.arc(cx, cy, 16, 0, Math.PI * 2)
    const centerGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 16)
    centerGrad.addColorStop(0, '#fcd34d')
    centerGrad.addColorStop(1, '#f59e0b')
    ctx.fillStyle = centerGrad
    ctx.fill()

    // Center label
    ctx.font = 'bold 13px ui-monospace, monospace'
    ctx.fillStyle = '#f0b840'
    ctx.textAlign = 'center'
    ctx.fillText(truncate(target, 24), cx, cy + 34)
  }, [filtered, hoveredNode, target, dpr])

  /* ── Resize observer ───────────────────────────────────────────── */
  useEffect(() => {
    draw()
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver(() => draw())
    ro.observe(container)
    return () => ro.disconnect()
  }, [draw])

  /* ── Mouse interaction ─────────────────────────────────────────── */
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    let found = -1
    for (let i = 0; i < nodesRef.current.length; i++) {
      const n = nodesRef.current[i]
      const dx = mx - n.x
      const dy = my - n.y
      if (dx * dx + dy * dy < (n.radius + 8) ** 2) {
        found = i
        break
      }
    }

    setHoveredNode(found >= 0 ? found : null)
    canvas.style.cursor = found >= 0 ? 'pointer' : 'default'
  }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hoveredNode !== null && onNodeClick) {
      onNodeClick(nodesRef.current[hoveredNode].vuln.id)
    }
  }, [hoveredNode, onNodeClick])

  /* ── Filter buttons ────────────────────────────────────────────── */
  const filters = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const

  return (
    <div className="glass-panel overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#f0b840" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-7.07-2.83 2.83M9.76 14.24l-2.83 2.83m11.14 0-2.83-2.83M9.76 9.76 6.93 6.93" />
          </svg>
          Evidence Graph
        </h2>
        <div className="flex items-center gap-1.5">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
              style={{
                background: filter === f ? `${FILTER_COLORS[f]}25` : 'rgba(255,255,255,0.04)',
                color: filter === f ? FILTER_COLORS[f] : '#6b5f8a',
                border: `1px solid ${filter === f ? `${FILTER_COLORS[f]}40` : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="w-full">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          onMouseLeave={() => setHoveredNode(null)}
        />
      </div>

      {/* Stats bar */}
      <div
        className="px-6 py-3 flex items-center gap-6 text-xs font-mono"
        style={{ background: 'rgba(10,10,46,0.6)', borderTop: '1px solid rgba(240,184,64,0.1)' }}
      >
        <span style={{ color: '#f0b840' }}>
          <strong>{stats.nodes}</strong> NODES
        </span>
        <span style={{ color: '#f0b840' }}>
          <strong>{stats.edges}</strong> EDGES
        </span>
        {stats.critical > 0 && (
          <span style={{ color: '#a855f7' }}>
            <strong>{stats.critical}</strong> CRITICAL
          </span>
        )}
        {stats.high > 0 && (
          <span style={{ color: '#ef4444' }}>
            <strong>{stats.high}</strong> HIGH
          </span>
        )}
      </div>

      {/* Tooltip */}
      {hoveredNode !== null && nodesRef.current[hoveredNode] && (
        <div
          className="absolute z-50 px-3 py-2 rounded-lg text-xs pointer-events-none"
          style={{
            left: nodesRef.current[hoveredNode].x,
            top: nodesRef.current[hoveredNode].y - 50,
            background: 'rgba(10,10,46,0.95)',
            border: `1px solid ${SEVERITY_COLORS[severityKey(nodesRef.current[hoveredNode].vuln.severity)] || '#6b7280'}60`,
            color: '#e0d6f6',
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-semibold">{nodesRef.current[hoveredNode].vuln.title}</div>
          <div className="opacity-60">{nodesRef.current[hoveredNode].vuln.cveId} · CVSS {nodesRef.current[hoveredNode].vuln.cvssScore}</div>
        </div>
      )}
    </div>
  )
}
