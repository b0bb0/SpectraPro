'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { graphAPI } from '@/lib/api';

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */
interface TargetAsset {
  id: string;
  name: string;
  type: string;
  vulnCount: number;
  criticalCount: number;
  highCount: number;
}
interface GNode {
  id: string;
  label: string;
  type: string;
  group: string;
  value: number;
  color: string;
  metadata: any;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned?: boolean;
  connections: number;
}
interface GEdge {
  src: GNode;
  tgt: GNode;
  rel: string;
  color: string;
  width: number;
}

/* ═══════════════════════════════════════════════════════
   NODE TYPE CONFIG
   ═══════════════════════════════════════════════════════ */
const NODE_CFG: Record<string, { color: string; glow: string; label: string; r: number }> = {
  asset:    { color: '#f97316', glow: 'rgba(249,115,22,0.55)', label: 'Target Asset', r: 20 },
  critical: { color: '#a855f7', glow: 'rgba(168,85,247,0.45)', label: 'Critical', r: 12 },
  high:     { color: '#ef4444', glow: 'rgba(239,68,68,0.45)', label: 'High', r: 11 },
  medium:   { color: '#eab308', glow: 'rgba(234,179,8,0.45)', label: 'Medium', r: 10 },
  low:      { color: '#3b82f6', glow: 'rgba(59,130,246,0.45)', label: 'Low', r: 9 },
  info:     { color: '#6b7280', glow: 'rgba(107,114,128,0.35)', label: 'Info', r: 8 },
};

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const REL_COLORS: Record<string, string> = {
  'affects':          'rgba(168,85,247,0.32)',
  'exploits':         'rgba(239,68,68,0.32)',
  'targets':          'rgba(249,115,22,0.32)',
  'vulnerability-of': 'rgba(234,179,8,0.32)',
  'related-to':       'rgba(157,95,255,0.25)',
};

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function AttackSurfacePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<GNode[]>([]);
  const edgesRef = useRef<GEdge[]>([]);
  const camRef = useRef({ x: 0, y: 0, z: 1 });
  const frameRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dragRef = useRef<{ panning: boolean; node: GNode | null }>({ panning: false, node: null });
  const hoverRef = useRef<GNode | null>(null);
  const selRef = useRef<GNode | null>(null);

  const [targets, setTargets] = useState<TargetAsset[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'graph' | 'overview'>('graph');
  const [filter, setFilter] = useState('all');
  const [hoverNode, setHoverNode] = useState<GNode | null>(null);
  const [selNode, setSelNode] = useState<GNode | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState({ nodes: 0, edges: 0, criticals: 0, riskScore: 0 });
  const [graphData, setGraphData] = useState<any>(null);

  /* ─── Fetch targets ─── */
  useEffect(() => {
    (async () => {
      try {
        const data = await graphAPI.getTargetAssets();
        setTargets(data);
        if (data.length > 0) {
          const t = data.find((d: TargetAsset) => d.vulnCount > 0) || data[0];
          setSelectedTarget(t.id);
        }
      } catch (e) { console.error(e); }
    })();
  }, []);

  /* ─── Fetch graph data ─── */
  useEffect(() => {
    if (!selectedTarget) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await graphAPI.getRadialGraph(selectedTarget);
        if (cancelled) return;
        setGraphData(data);
        buildGraph(data);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
    const iv = setInterval(async () => {
      try {
        const data = await graphAPI.getRadialGraph(selectedTarget);
        if (!cancelled) { setGraphData(data); buildGraph(data); }
      } catch (_) {}
    }, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [selectedTarget]);

  /* ─── Build graph from API data ─── */
  const buildGraph = useCallback((data: any) => {
    if (!data?.nodes) return;
    const W = sizeRef.current.w || 900;
    const H = sizeRef.current.h || 600;
    const nodes: GNode[] = [];
    const edges: GEdge[] = [];
    const nodeMap: Record<string, GNode> = {};

    data.nodes.forEach((n: any, i: number) => {
      const sevKey = n.type === 'asset' ? 'asset' : (n.group || 'info').toLowerCase();
      const cfg = NODE_CFG[sevKey] || NODE_CFG.info;
      const angle = i === 0 ? 0 : ((i - 1) / (data.nodes.length - 1)) * Math.PI * 2;
      const dist = n.type === 'asset' ? 0 : 180 + Math.random() * 120;
      const gn: GNode = {
        id: n.id, label: n.label, type: n.type,
        group: sevKey, value: n.value, color: cfg.color,
        metadata: n.metadata,
        x: W / 2 + Math.cos(angle) * dist,
        y: H / 2 + Math.sin(angle) * dist,
        vx: 0, vy: 0,
        pinned: n.type === 'asset',
        connections: 0,
      };
      nodes.push(gn);
      nodeMap[gn.id] = gn;
    });

    data.edges.forEach((e: any) => {
      const src = nodeMap[typeof e.source === 'string' ? e.source : e.source.id];
      const tgt = nodeMap[typeof e.target === 'string' ? e.target : e.target.id];
      if (src && tgt) {
        edges.push({ src, tgt, rel: e.label || 'affects', color: e.color || 'rgba(157,95,255,0.3)', width: e.width || 1 });
        src.connections++;
        tgt.connections++;
      }
    });

    nodesRef.current = nodes;
    edgesRef.current = edges;
    setStats({
      nodes: nodes.length,
      edges: edges.length,
      criticals: data.stats?.criticalPaths || nodes.filter((n: GNode) => n.group === 'critical').length,
      riskScore: data.stats?.riskScore || 0,
    });
    camRef.current = { x: 0, y: 0, z: 1 };
  }, []);

  /* ─── Physics simulation ─── */
  const simulate = useCallback(() => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const W = sizeRef.current.w || 900;
    const H = sizeRef.current.h || 600;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = 6000 / (d * d);
        const fx = f * dx / d, fy = f * dy / d;
        if (!a.pinned) { a.vx -= fx; a.vy -= fy; }
        if (!b.pinned) { b.vx += fx; b.vy += fy; }
      }
    }
    edges.forEach(e => {
      const dx = e.tgt.x - e.src.x, dy = e.tgt.y - e.src.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = 0.035 * (d - 140);
      const fx = f * dx / d, fy = f * dy / d;
      if (!e.src.pinned) { e.src.vx += fx; e.src.vy += fy; }
      if (!e.tgt.pinned) { e.tgt.vx -= fx; e.tgt.vy -= fy; }
    });
    nodes.forEach(n => {
      if (n.pinned) return;
      n.vx += (W / 2 - n.x) * 0.002;
      n.vy += (H / 2 - n.y) * 0.002;
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.max(30, Math.min(W - 30, n.x));
      n.y = Math.max(30, Math.min(H - 30, n.y));
    });
  }, []);

  /* ─── Camera helpers ─── */
  const toWorld = (cx: number, cy: number) => {
    const c = camRef.current;
    return { x: (cx - c.x) / c.z, y: (cy - c.y) / c.z };
  };
  const toScreen = (wx: number, wy: number) => {
    const c = camRef.current;
    return { x: wx * c.z + c.x, y: wy * c.z + c.y };
  };
  const getNodeAt = (cx: number, cy: number): GNode | null => {
    const w = toWorld(cx, cy);
    let best: GNode | null = null, bestD = Infinity;
    nodesRef.current.forEach(n => {
      const dx = n.x - w.x, dy = n.y - w.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const cfg = NODE_CFG[n.group] || NODE_CFG.info;
      if (d < cfg.r + 12 && d < bestD) { best = n; bestD = d; }
    });
    return best;
  };

  /* ─── Canvas render loop ─── */
  const render = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const W = sizeRef.current.w;
    const H = sizeRef.current.h;
    const cam = camRef.current;
    const frame = ++frameRef.current;

    ctx.clearRect(0, 0, W, H);

    // BG gradient
    const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.85);
    bg.addColorStop(0, '#07051e'); bg.addColorStop(0.6, '#03020e'); bg.addColorStop(1, '#01010a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(157,95,255,0.035)'; ctx.lineWidth = 1;
    const gs = 55 * cam.z, ox = cam.x % gs, oy = cam.y % gs;
    for (let x = ox; x < W; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = oy; y < H; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    simulate();

    // Draw edges
    edgesRef.current.forEach(e => {
      const faded = filter !== 'all' && e.src.group !== filter && e.tgt.group !== filter;
      const a = toScreen(e.src.x, e.src.y), b = toScreen(e.tgt.x, e.tgt.y);
      const hl = (hoverRef.current && (e.src === hoverRef.current || e.tgt === hoverRef.current)) ||
                 (selRef.current && (e.src === selRef.current || e.tgt === selRef.current));
      const col = REL_COLORS[e.rel] || e.color || 'rgba(157,95,255,0.2)';
      const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.08;
      const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.08;

      ctx.save();
      ctx.globalAlpha = faded ? 0.08 : 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.strokeStyle = hl ? col.replace(/[\d.]+\)$/, '0.82)') : col;
      ctx.lineWidth = hl ? 1.8 : 0.7;
      if (hl) { ctx.shadowColor = col.replace(/[\d.]+\)$/, '0.5)'); ctx.shadowBlur = 7; }
      ctx.stroke();

      // Arrow
      const ang = Math.atan2(b.y - my, b.x - mx);
      const as = 5.5 * cam.z;
      ctx.beginPath(); ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - as * Math.cos(ang - 0.38), b.y - as * Math.sin(ang - 0.38));
      ctx.lineTo(b.x - as * Math.cos(ang + 0.38), b.y - as * Math.sin(ang + 0.38));
      ctx.closePath();
      ctx.fillStyle = hl ? col.replace(/[\d.]+\)$/, '0.82)') : col;
      ctx.fill();
      ctx.restore();
    });

    // Draw nodes
    nodesRef.current.forEach(n => {
      const cfg = NODE_CFG[n.group] || NODE_CFG.info;
      const faded = filter !== 'all' && n.group !== 'asset' && n.group !== filter;
      const s = toScreen(n.x, n.y);
      const r = cfg.r * cam.z;
      const hl = n === hoverRef.current;
      const sel = n === selRef.current;

      ctx.save();
      ctx.globalAlpha = faded ? 0.12 : 1;

      // Selection ring
      if (sel) {
        const p = 1 + 0.28 * Math.sin(frame * 0.07);
        ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.85 * p, 0, Math.PI * 2);
        ctx.strokeStyle = cfg.color + '77'; ctx.lineWidth = 1.4; ctx.stroke();
      }

      // Glow
      const gr = (hl || sel) ? r * 2.6 : r * 1.9;
      const grd = ctx.createRadialGradient(s.x, s.y, r * 0.2, s.x, s.y, gr);
      grd.addColorStop(0, cfg.glow); grd.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(s.x, s.y, gr, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();

      // Node body
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      const nbg = ctx.createRadialGradient(s.x - r * 0.3, s.y - r * 0.3, 0, s.x, s.y, r);
      nbg.addColorStop(0, 'rgba(255,255,255,0.18)'); nbg.addColorStop(1, cfg.color);
      ctx.fillStyle = nbg; ctx.fill();
      ctx.strokeStyle = (hl || sel) ? '#fff' : cfg.color + 'bb';
      ctx.lineWidth = (hl || sel) ? 2 : 1; ctx.stroke();

      // Central rings
      if (n.type === 'asset') {
        ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.32 + Math.sin(frame * 0.045) * 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(249,115,22,0.28)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.65 + Math.cos(frame * 0.028) * 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(249,115,22,0.13)'; ctx.lineWidth = 1; ctx.stroke();
      }

      // Labels
      if (cam.z > 0.45 || hl || sel || n.type === 'asset') {
        const fs = n.type === 'asset' ? Math.max(8, 11 * cam.z) : Math.max(7, 9 * cam.z);
        ctx.font = n.type === 'asset' ? `700 ${fs}px 'Space Grotesk',sans-serif` : `600 ${fs}px 'Space Mono',monospace`;
        ctx.textAlign = 'center'; ctx.fillStyle = (hl || sel) ? '#fff' : '#e2d8ff';
        ctx.shadowColor = '#02020d'; ctx.shadowBlur = 4;
        const maxLen = cam.z > 0.8 ? 28 : 18;
        const lbl = n.label.length > maxLen ? n.label.substring(0, maxLen) + '…' : n.label;
        ctx.fillText(lbl, s.x, s.y + r + 10 * cam.z);
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    });

    animRef.current = requestAnimationFrame(render);
  }, [filter, simulate, toScreen, toWorld]);

  /* ─── Canvas setup & events ─── */
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const parent = cvs.parentElement;
    if (!parent) return;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: rect.width, h: rect.height };
      cvs.width = rect.width * dpr;
      cvs.height = rect.height * dpr;
      cvs.style.width = rect.width + 'px';
      cvs.style.height = rect.height + 'px';
      const ctx = cvs.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    // Mouse events
    const onMove = (e: MouseEvent) => {
      const rect = cvs.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      if (dragRef.current.panning && !dragRef.current.node) {
        camRef.current.x += e.movementX;
        camRef.current.y += e.movementY;
        return;
      }
      if (dragRef.current.node) {
        const w = toWorld(cx, cy);
        dragRef.current.node.x = w.x;
        dragRef.current.node.y = w.y;
        return;
      }
      const h = getNodeAt(cx, cy);
      hoverRef.current = h;
      setHoverNode(h);
      cvs.style.cursor = h ? 'pointer' : 'grab';
    };
    const onDown = (e: MouseEvent) => {
      const rect = cvs.getBoundingClientRect();
      const n = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (n) { dragRef.current = { panning: false, node: n }; cvs.style.cursor = 'grabbing'; }
      else { dragRef.current = { panning: true, node: null }; cvs.style.cursor = 'grabbing'; }
    };
    const onUp = () => {
      dragRef.current = { panning: false, node: null };
      cvs.style.cursor = hoverRef.current ? 'pointer' : 'grab';
    };
    const onClick = (e: MouseEvent) => {
      const rect = cvs.getBoundingClientRect();
      const n = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (n) {
        const wasSelected = selRef.current === n;
        selRef.current = wasSelected ? null : n;
        setSelNode(wasSelected ? null : n);
        setShowInfo(!wasSelected);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = cvs.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const dz = e.deltaY < 0 ? 1.1 : 0.9;
      const c = camRef.current;
      c.x = mx + (c.x - mx) * dz;
      c.y = my + (c.y - my) * dz;
      c.z = Math.max(0.2, Math.min(4, c.z * dz));
    };

    cvs.addEventListener('mousemove', onMove);
    cvs.addEventListener('mousedown', onDown);
    cvs.addEventListener('mouseup', onUp);
    cvs.addEventListener('click', onClick);
    cvs.addEventListener('wheel', onWheel, { passive: false });

    // Start render loop
    animRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      cvs.removeEventListener('mousemove', onMove);
      cvs.removeEventListener('mousedown', onDown);
      cvs.removeEventListener('mouseup', onUp);
      cvs.removeEventListener('click', onClick);
      cvs.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(animRef.current);
    };
  }, [render, toWorld, getNodeAt]);

  const currentTarget = targets.find(t => t.id === selectedTarget);

  /* ─── RENDER ─── */
  return (
    <div className="overflow-hidden flex flex-col" style={{ background: '#02020d', margin: '-0px -2rem -2.5rem -2rem', height: 'calc(100vh - 3.5rem)', position: 'relative' }}>
      {/* ══ TOPBAR ══ */}
      <div className="h-[52px] flex-shrink-0 flex items-center px-5 gap-3.5 border-b"
        style={{ background: 'rgba(4,2,18,0.95)', borderColor: 'rgba(157,95,255,0.13)', backdropFilter: 'blur(20px)' }}>
        {/* Live dot */}
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
          background: '#4ade80', boxShadow: '0 0 8px #4ade80',
          animation: 'pulse 2s ease-in-out infinite',
        }} />
        {/* Breadcrumb */}
        <span className="flex-1" style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 1, color: '#4a3d6a' }}>
          Attack Surface › Graph › <em className="not-italic" style={{ color: '#c8a0ff' }}>{currentTarget?.name || 'Select Target'}</em>
        </span>
        {/* Target selector */}
        <select
          value={selectedTarget || ''}
          onChange={e => setSelectedTarget(e.target.value)}
          className="appearance-none cursor-pointer"
          style={{
            fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 1,
            padding: '4px 12px', borderRadius: 100,
            border: '1px solid rgba(240,184,64,0.3)', background: 'rgba(240,184,64,0.07)',
            color: '#f0b840',
          }}
        >
          {targets.map(t => (
            <option key={t.id} value={t.id} style={{ background: '#08052a', color: '#e2d8ff' }}>
              {t.name} ({t.type}) — {t.vulnCount} vulns
            </option>
          ))}
        </select>
        {/* View pills */}
        <div className="flex gap-2 items-center">
          {(['graph', 'overview'] as const).map(v => (
            <button key={v} onClick={() => setActiveView(v)}
              className="transition-all duration-200"
              style={{
                fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 1,
                padding: '4px 12px', borderRadius: 100,
                border: `1px solid ${activeView === v ? 'rgba(157,95,255,0.35)' : 'rgba(157,95,255,0.13)'}`,
                background: activeView === v ? 'rgba(91,33,182,0.2)' : 'transparent',
                color: activeView === v ? '#c8a0ff' : '#4a3d6a',
                cursor: 'pointer',
              }}
            >
              {v === 'graph' ? '⬡ Graph' : '◈ Analysis'}
            </button>
          ))}
        </div>
      </div>

      {/* ══ CONTENT ══ */}
      <div className="flex-1 overflow-hidden relative">

        {/* ── GRAPH VIEW ── */}
        {activeView === 'graph' && (
          <div className="absolute inset-0">
            <canvas ref={canvasRef} className="absolute inset-0 block" />

            {/* HUD Overlays */}
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>

              {/* Filter pills */}
              <div className="absolute top-3.5 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-auto">
                {[
                  { key: 'all', label: 'ALL', icon: '' },
                  { key: 'critical', label: 'CRITICAL', icon: '🟣' },
                  { key: 'high', label: 'HIGH', icon: '🔴' },
                  { key: 'medium', label: 'MEDIUM', icon: '🟡' },
                  { key: 'low', label: 'LOW', icon: '🔵' },
                  { key: 'info', label: 'INFO', icon: '⚪' },
                ].map(f => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className="transition-all duration-200"
                    style={{
                      fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 1,
                      padding: '5px 13px', borderRadius: 100,
                      border: `1px solid ${filter === f.key ? 'rgba(157,95,255,0.45)' : 'rgba(255,255,255,0.07)'}`,
                      background: filter === f.key ? 'rgba(91,33,182,0.25)' : 'rgba(4,2,18,0.8)',
                      color: filter === f.key ? '#c8a0ff' : '#4a3d6a',
                      cursor: 'pointer', backdropFilter: 'blur(12px)',
                    }}
                  >
                    {f.icon} {f.label}
                  </button>
                ))}
              </div>

              {/* Legend */}
              <div className="absolute bottom-3.5 left-3.5 pointer-events-auto"
                style={{
                  background: 'rgba(4,2,18,0.88)', border: '1px solid rgba(157,95,255,0.13)',
                  borderRadius: 14, padding: '14px 16px', backdropFilter: 'blur(20px)',
                }}>
                <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, color: '#4a3d6a', textTransform: 'uppercase', marginBottom: 10 }}>
                  Entity Types
                </div>
                {Object.entries(NODE_CFG).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-2.5 mb-1.5" style={{ fontSize: 12, color: '#c8a0ff' }}>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cfg.color, boxShadow: `0 0 7px ${cfg.color}` }} />
                    {cfg.label}
                  </div>
                ))}
              </div>

              {/* Stats bar */}
              <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 flex pointer-events-auto"
                style={{
                  background: 'rgba(4,2,18,0.88)', border: '1px solid rgba(157,95,255,0.13)',
                  borderRadius: 12, overflow: 'hidden', backdropFilter: 'blur(16px)', gap: 1,
                }}>
                {[
                  { v: stats.nodes, k: 'Nodes' },
                  { v: stats.edges, k: 'Edges' },
                  { v: stats.criticals, k: 'Critical' },
                  { v: stats.riskScore, k: 'Risk' },
                ].map((s, i) => (
                  <div key={i} className="text-center" style={{ padding: '9px 16px', borderRight: i < 3 ? '1px solid rgba(157,95,255,0.13)' : 'none' }}>
                    <span className="block" style={{ fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 700, color: '#f0b840', lineHeight: 1 }}>{s.v}</span>
                    <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4, display: 'block' }}>{s.k}</span>
                  </div>
                ))}
              </div>

              {/* Zoom controls */}
              <div className="absolute bottom-3.5 right-3.5 flex flex-col gap-1.5 pointer-events-auto">
                {[
                  { label: '＋', fn: () => { camRef.current.z = Math.min(4, camRef.current.z * 1.25); } },
                  { label: '－', fn: () => { camRef.current.z = Math.max(0.2, camRef.current.z * 0.8); } },
                  { label: '⊡', fn: () => { camRef.current = { x: 0, y: 0, z: 1 }; } },
                  { label: '↺', fn: () => { if (graphData) { buildGraph(graphData); } } },
                ].map((btn, i) => (
                  <button key={i} onClick={btn.fn}
                    className="flex items-center justify-center transition-all duration-200"
                    style={{
                      width: 34, height: 34, borderRadius: 9,
                      background: 'rgba(4,2,18,0.88)', border: '1px solid rgba(157,95,255,0.13)',
                      color: '#c8a0ff', fontSize: 16, cursor: 'pointer',
                      backdropFilter: 'blur(12px)',
                    }}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              {/* Tooltip */}
              {hoverNode && (
                <div className="absolute pointer-events-none" style={{
                  zIndex: 50,
                  background: 'rgba(4,2,18,0.97)', border: '1px solid rgba(157,95,255,0.35)',
                  borderRadius: 12, padding: '13px 15px', backdropFilter: 'blur(24px)',
                  maxWidth: 260, boxShadow: '0 8px 40px rgba(0,0,0,0.6),0 0 24px rgba(157,95,255,0.1)',
                  top: 80, right: 20,
                }}>
                  <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: (NODE_CFG[hoverNode.group] || NODE_CFG.info).color, marginBottom: 5 }}>
                    {(NODE_CFG[hoverNode.group] || NODE_CFG.info).label}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f0ecff', marginBottom: 7, lineHeight: 1.3 }}>
                    {hoverNode.label}
                  </div>
                  {hoverNode.metadata?.cveId && (
                    <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#f0b840' }}>
                      {hoverNode.metadata.cveId}
                    </div>
                  )}
                  {hoverNode.metadata?.cvssScore && (
                    <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#4a3d6a' }}>
                      CVSS: <span style={{ color: '#c8a0ff' }}>{hoverNode.metadata.cvssScore}</span>
                    </div>
                  )}
                  <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: '#4a3d6a', marginTop: 4 }}>
                    Connections: <span style={{ color: '#c8a0ff' }}>{hoverNode.connections}</span>
                  </div>
                </div>
              )}

              {/* Info Panel (slide-in on select) */}
              <div className="absolute top-3.5 right-3.5 pointer-events-auto transition-all duration-300"
                style={{
                  width: 260, background: 'rgba(4,2,18,0.95)', border: '1px solid rgba(157,95,255,0.13)',
                  borderRadius: 14, padding: 16, backdropFilter: 'blur(24px)',
                  transform: showInfo && selNode ? 'translateX(0)' : 'translateX(300px)',
                  opacity: showInfo && selNode ? 1 : 0, zIndex: 10,
                }}>
                <button onClick={() => { setShowInfo(false); selRef.current = null; setSelNode(null); }}
                  className="absolute top-2.5 right-3 bg-transparent border-none cursor-pointer transition-colors"
                  style={{ color: '#4a3d6a', fontSize: 14 }}
                >✕</button>
                {selNode && (() => {
                  const cfg = NODE_CFG[selNode.group] || NODE_CFG.info;
                  const rows = [
                    ['Type', cfg.label],
                    ['Severity', selNode.metadata?.severity || selNode.group],
                    ['Connections', String(selNode.connections)],
                    ['CVE', selNode.metadata?.cveId || 'N/A'],
                    ['CVSS', selNode.metadata?.cvssScore || 'N/A'],
                    ['Status', selNode.metadata?.status || 'Open'],
                  ];
                  return (
                    <>
                      <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: cfg.color, marginBottom: 5 }}>
                        {cfg.label}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#f0ecff', marginBottom: 14, lineHeight: 1.3 }}>
                        {selNode.label}
                      </div>
                      {rows.map(([k, v], i) => (
                        <div key={i} className="flex justify-between items-center" style={{ padding: '6px 0', borderBottom: i < rows.length - 1 ? '1px solid rgba(157,95,255,0.07)' : 'none', fontSize: 11 }}>
                          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 1, color: '#4a3d6a' }}>{k}</span>
                          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#c8a0ff' }}>{v}</span>
                        </div>
                      ))}
                      {selNode.metadata?.description && (
                        <p style={{ fontSize: 11, color: 'rgba(226,216,255,0.6)', lineHeight: 1.6, marginTop: 12 }}>
                          {selNode.metadata.description.substring(0, 180)}…
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>

            </div>{/* end HUD */}

            {/* Loading overlay */}
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(2,2,13,0.8)', zIndex: 20 }}>
                <div style={{ width: 24, height: 24, border: '2px solid rgba(157,95,255,0.15)', borderTopColor: '#f0b840', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            )}
          </div>
        )}

        {/* ── OVERVIEW VIEW ── */}
        {activeView === 'overview' && (
          <div className="absolute inset-0 overflow-y-auto" style={{ padding: 24 }}>
            {/* Stat strip */}
            <div className="grid grid-cols-4 gap-px mb-5 overflow-hidden" style={{ background: 'rgba(157,95,255,0.13)', borderRadius: 14 }}>
              {[
                { v: stats.nodes, l: 'Entities', grad: true },
                { v: stats.edges, l: 'Relations', grad: false },
                { v: stats.criticals, l: 'Critical Issues', grad: true },
                { v: stats.riskScore + '/100', l: 'Risk Score', grad: false },
              ].map((s, i) => (
                <div key={i} className="text-center py-5 px-4 transition-colors cursor-default" style={{ background: '#0d0920' }}>
                  <span className="block text-[28px] font-bold leading-none mb-1.5" style={
                    s.grad
                      ? { background: 'linear-gradient(135deg,#f0b840,#ffe08a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
                      : { background: 'linear-gradient(135deg,#9d5fff,#c8a0ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
                  }>
                    {s.v}
                  </span>
                  <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a', letterSpacing: 2, textTransform: 'uppercase' }}>{s.l}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Severity Distribution */}
              <div style={{ background: 'rgba(8,5,28,0.9)', border: '1px solid rgba(157,95,255,0.13)', borderRadius: 16, padding: 20, backdropFilter: 'blur(16px)' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#f0ecff', marginBottom: 4 }}>Severity Distribution</div>
                <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a', letterSpacing: 1.5, marginBottom: 18 }}>VULNERABILITY BREAKDOWN</div>
                <div className="flex flex-col gap-3">
                  {[
                    { sev: 'CRITICAL', count: graphData?.nodes?.filter((n: any) => (n.group || '').toUpperCase() === 'CRITICAL').length || 0, color: '#a855f7', pct: 0 },
                    { sev: 'HIGH', count: graphData?.nodes?.filter((n: any) => (n.group || '').toUpperCase() === 'HIGH').length || 0, color: '#ef4444', pct: 0 },
                    { sev: 'MEDIUM', count: graphData?.nodes?.filter((n: any) => (n.group || '').toUpperCase() === 'MEDIUM').length || 0, color: '#eab308', pct: 0 },
                    { sev: 'LOW', count: graphData?.nodes?.filter((n: any) => (n.group || '').toUpperCase() === 'LOW').length || 0, color: '#3b82f6', pct: 0 },
                    { sev: 'INFO', count: graphData?.nodes?.filter((n: any) => (n.group || '').toUpperCase() === 'INFO').length || 0, color: '#6b7280', pct: 0 },
                  ].map(s => {
                    const total = graphData?.stats?.totalVulnerabilities || 1;
                    s.pct = Math.round((s.count / total) * 100);
                    return s;
                  }).map((s, i) => (
                    <div key={i} className="grid items-center gap-2.5" style={{ gridTemplateColumns: '90px 1fr 36px' }}>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a', letterSpacing: 1, textTransform: 'uppercase' }}>{s.sev}</span>
                      <div style={{ height: 5, background: 'rgba(255,255,255,0.04)', borderRadius: 100, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ height: '100%', width: `${s.pct}%`, borderRadius: 100, background: `linear-gradient(to right, ${s.color}55, ${s.color})`, boxShadow: `2px 0 12px ${s.color}88`, transition: 'width 1.2s cubic-bezier(.4,0,.2,1)' }} />
                      </div>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, fontWeight: 700, color: s.color, textAlign: 'right' }}>{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk Assessment */}
              <div style={{ background: 'rgba(8,5,28,0.9)', border: '1px solid rgba(240,184,64,0.18)', borderRadius: 16, padding: 20, backdropFilter: 'blur(16px)' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#f0ecff', marginBottom: 4 }}>Risk Assessment</div>
                <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a', letterSpacing: 1.5, marginBottom: 18 }}>OVERALL POSTURE</div>
                <div className="flex items-center gap-5 mb-4">
                  {/* Score ring SVG */}
                  <div className="relative flex-shrink-0" style={{ width: 100, height: 100 }}>
                    <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                      <defs>
                        <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#f0b840" />
                          <stop offset="100%" stopColor="#9d5fff" />
                        </linearGradient>
                        <filter id="ring-glow">
                          <feGaussianBlur stdDeviation="2.5" result="blur" />
                          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                      </defs>
                      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="7" />
                      <circle cx="50" cy="50" r="42" fill="none" stroke="url(#ring-grad)" strokeWidth="7"
                        strokeDasharray="264" strokeDashoffset={264 - (264 * (stats.riskScore / 100))}
                        strokeLinecap="round" filter="url(#ring-glow)" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-bold leading-none" style={{ fontSize: 26, background: 'linear-gradient(135deg,#f0b840,#c8a0ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        {stats.riskScore}
                      </span>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a' }}>/100</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.75, color: 'rgba(226,216,255,0.78)' }}>
                    <strong style={{ color: '#ffe08a' }}>{currentTarget?.name || 'Target'}</strong> has{' '}
                    <em style={{ color: '#c8a0ff', fontStyle: 'normal' }}>{stats.criticals} critical</em> vulnerabilities
                    across <strong style={{ color: '#ffe08a' }}>{stats.nodes}</strong> tracked entities.
                  </div>
                </div>

                {/* Findings */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { type: 'pos', icon: '✦', title: 'Strengths', text: `${currentTarget?.vulnCount ? 'Active monitoring enabled' : 'No known vulnerabilities'}. Continuous scanning operational.`, border: 'rgba(74,222,128,0.18)', bg: 'rgba(4,18,8,0.85)', titleColor: '#4ade80' },
                    { type: 'neg', icon: '⚠', title: 'Risks', text: `${stats.criticals} critical issues require immediate remediation. ${stats.edges} attack paths identified.`, border: 'rgba(248,113,113,0.18)', bg: 'rgba(18,4,8,0.85)', titleColor: '#f87171' },
                    { type: 'neu', icon: '◈', title: 'Actions', text: 'Prioritize critical CVEs. Segment exposed services. Schedule deep scan.', border: 'rgba(240,184,64,0.18)', bg: 'rgba(16,11,2,0.85)', titleColor: '#f0b840' },
                  ].map((f, i) => (
                    <div key={i} className="rounded-[14px] p-4 transition-transform duration-300 hover:-translate-y-0.5"
                      style={{ background: f.bg, border: `1px solid ${f.border}` }}>
                      <span className="block text-xl mb-2.5">{f.icon}</span>
                      <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 3, textTransform: 'uppercase', color: f.titleColor, marginBottom: 8 }}>{f.title}</div>
                      <div style={{ fontSize: 12, color: 'rgba(226,216,255,0.62)', lineHeight: 1.7 }}>{f.text}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vulnerability List (full width) */}
              <div className="col-span-2" style={{ background: 'rgba(8,5,28,0.9)', border: '1px solid rgba(157,95,255,0.13)', borderRadius: 16, padding: 20, backdropFilter: 'blur(16px)' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#f0ecff', marginBottom: 4 }}>All Entities</div>
                <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#4a3d6a', letterSpacing: 1.5, marginBottom: 14 }}>KNOWLEDGE GRAPH ENTITIES</div>
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Entity', 'Type', 'Severity', 'CVE', 'CVSS', 'Status'].map(h => (
                          <th key={h} className="text-left" style={{
                            fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 2,
                            textTransform: 'uppercase', color: '#f0b840', fontWeight: 600,
                            padding: '10px 12px', borderBottom: '1px solid rgba(157,95,255,0.15)',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(graphData?.nodes || []).slice(0, 30).map((n: any, i: number) => {
                        const cfg = NODE_CFG[(n.group || 'info').toLowerCase()] || NODE_CFG.info;
                        return (
                          <tr key={i} className="transition-colors hover:bg-[rgba(157,95,255,0.04)]">
                            <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(157,95,255,0.08)', color: '#e2d8ff', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</td>
                            <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(157,95,255,0.08)' }}>
                              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, padding: '2px 8px', borderRadius: 100, border: `1px solid ${cfg.color}44`, color: cfg.color, background: `${cfg.color}15` }}>{n.type}</span>
                            </td>
                            <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(157,95,255,0.08)', color: cfg.color, fontWeight: 600 }}>{n.group || '—'}</td>
                            <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(157,95,255,0.08)', fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#f0b840' }}>{n.metadata?.cveId || '—'}</td>
                            <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(157,95,255,0.08)', fontFamily: "'Space Mono',monospace", fontSize: 11, color: '#c8a0ff' }}>{n.metadata?.cvssScore || '—'}</td>
                            <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(157,95,255,0.08)', color: '#4a3d6a' }}>{n.metadata?.status || 'Open'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Keyframe animations */}
      <style jsx>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.3 } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}
