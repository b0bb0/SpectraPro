"use client";
import { useRef, useEffect, useState, useCallback } from "react";
const SEV_COLORS: Record<string, { fill: string; glow: string; light: string }> = {
  critical: { fill: "#a855f7", glow: "rgba(168,85,247,", light: "#d8b4fe" },
  high:     { fill: "#ef4444", glow: "rgba(239,68,68,",  light: "#fca5a5" },
  medium:   { fill: "#f59e0b", glow: "rgba(245,158,11,", light: "#fcd34d" },
  low:      { fill: "#3b82f6", glow: "rgba(59,130,246,", light: "#93c5fd" },
  info:     { fill: "#9ca3af", glow: "rgba(156,163,175,", light: "#d1d5db" },
};
const FINDINGS = [
  { label: "SPF Record — Detection",         severity: "info" },
  { label: "Nginx version detect",           severity: "low" },
  { label: "DNS TXT Record Detected",        severity: "info" },
  { label: "Nginx End-of-Life — Detect",     severity: "critical" },
  { label: "NS Record Detection",            severity: "info" },
  { label: "Email Service Detector",         severity: "info" },
  { label: "RDAP WHOIS",                     severity: "info" },
  { label: "MX Record Detection",            severity: "low" },
  { label: "WAF Detection",                  severity: "medium" },
  { label: "CAA Record",                     severity: "info" },
  { label: "Wappalyzer Technology Detect...", severity: "medium" },
  { label: "HTTP Missing Security Header...", severity: "high" },
];
const SEVERITIES = [
  { label: "ALL", color: "" },
  { label: "CRITICAL", color: "#a855f7" },
  { label: "HIGH", color: "#ef4444" },
  { label: "MEDIUM", color: "#f59e0b" },
  { label: "LOW", color: "#3b82f6" },
  { label: "INFO", color: "#9ca3af" },
];
const STATS = [
  { value: "13", label: "NODES" },
  { value: "12", label: "EDGES" },
  { value: "1", label: "CRITICAL" },
  { value: "2", label: "HIGH" },
];
interface Node {
  label: string;
  severity: string;
  x: number;
  y: number;
  bx: number;
  by: number;
  r: number;
}
export default function EvidenceGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const nodesRef = useRef<Node[]>([]);
  const hoveredRef = useRef<Node | null>(null);
  const draggingRef = useRef<Node | null>(null);
  const timeRef = useRef(0);
  const rafRef = useRef<number>(0);
  const filterRef = useRef("ALL");
  useEffect(() => {
    filterRef.current = activeFilter;
  }, [activeFilter]);
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 2;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const CX = W / 2;
    const CY = H / 2;
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
      const orbitR = Math.min(W, H) * 0.38;
      nodesRef.current = FINDINGS.map((f, i) => {
        const angle = (i / FINDINGS.length) * Math.PI * 2 - Math.PI / 2;
        return {
          ...f,
          x: CX + Math.cos(angle) * orbitR,
          y: CY + Math.sin(angle) * orbitR,
          bx: CX + Math.cos(angle) * orbitR,
          by: CY + Math.sin(angle) * orbitR,
          r: 10,
        };
      });
    }
    timeRef.current += 0.008;
    const t = timeRef.current;
    const nodes = nodesRef.current;
    const hovered = hoveredRef.current;
    const filter = filterRef.current;
    ctx.clearRect(0, 0, W, H);
    // Grid dots
    ctx.fillStyle = "rgba(139,92,246,0.04)";
    for (let x = 20; x < W; x += 50)
      for (let y = 20; y < H; y += 50) {
        ctx.beginPath();
        ctx.arc(x, y, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    // Edges with severity color
    nodes.forEach((n) => {
      const sc = SEV_COLORS[n.severity];
      const isH = hovered === n;
      const isFiltered = filter !== "ALL" && filter.toLowerCase() !== n.severity;
      const alpha = isFiltered ? 0.08 : isH ? 0.7 : 0.35;
      const alphaEnd = isFiltered ? 0.02 : isH ? 0.3 : 0.08;
      const grad = ctx.createLinearGradient(CX, CY, n.x, n.y);
      grad.addColorStop(0, sc.glow + alpha + ")");
      grad.addColorStop(1, sc.glow + alphaEnd + ")");
      ctx.beginPath();
      ctx.strokeStyle = grad;
      ctx.lineWidth = isH ? 2.5 : isFiltered ? 0.5 : 1.2;
      ctx.moveTo(CX, CY);
      ctx.lineTo(n.x, n.y);
      ctx.stroke();
    });
    // Central node
    const pulse = 30 + Math.sin(t * 2.5) * 3;
    for (let i = 3; i >= 1; i--) {
      const glow = ctx.createRadialGradient(CX, CY, 0, CX, CY, pulse * i);
      glow.addColorStop(0, `rgba(245,158,11,${0.15 / i})`);
      glow.addColorStop(1, "rgba(245,158,11,0)");
      ctx.beginPath();
      ctx.fillStyle = glow;
      ctx.arc(CX, CY, pulse * i, 0, Math.PI * 2);
      ctx.fill();
    }
    const cg = ctx.createRadialGradient(CX - 4, CY - 4, 0, CX, CY, pulse * 0.55);
    cg.addColorStop(0, "#fcd34d");
    cg.addColorStop(0.6, "#f59e0b");
    cg.addColorStop(1, "#d97706");
    ctx.beginPath();
    ctx.fillStyle = cg;
    ctx.arc(CX, CY, pulse * 0.55, 0, Math.PI * 2);
    ctx.fill();
    // Sun rays
    ctx.save();
    ctx.translate(CX, CY);
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(245,158,11,${0.15 + Math.sin(t * 3 + i) * 0.1})`;
      ctx.lineWidth = 1.5;
      ctx.moveTo(0, pulse * 0.5);
      ctx.lineTo(0, pulse * 0.75);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.textAlign = "center";
    ctx.fillText("vulnweb.com", CX, CY + pulse * 0.55 + 20);
    // Outer nodes with severity colors
    nodes.forEach((n, i) => {
      if (draggingRef.current !== n) {
        n.x = n.bx + Math.sin(t * 0.8 + i * 0.5) * 2;
        n.y = n.by + Math.cos(t * 0.6 + i * 0.7) * 2;
      }
      const sc = SEV_COLORS[n.severity];
      const isH = hovered === n;
      const isFiltered = filter !== "ALL" && filter.toLowerCase() !== n.severity;
      const r = isH ? 14 : 10;
      ctx.globalAlpha = isFiltered ? 0.2 : 1;
      if (isH || (n.severity !== "info" && !isFiltered)) {
        const hg = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * (isH ? 3.5 : 2.5));
        hg.addColorStop(0, sc.glow + (isH ? "0.35)" : "0.2)"));
        hg.addColorStop(1, sc.glow + "0)");
        ctx.beginPath();
        ctx.fillStyle = hg;
        ctx.arc(n.x, n.y, r * (isH ? 3.5 : 2.5), 0, Math.PI * 2);
        ctx.fill();
      }
      const ng = ctx.createRadialGradient(n.x - 2, n.y - 2, 0, n.x, n.y, r);
      ng.addColorStop(0, sc.light);
      ng.addColorStop(1, sc.fill);
      ctx.beginPath();
      ctx.fillStyle = ng;
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isH ? "rgba(255,255,255,0.6)" : sc.glow + "0.3)";
      ctx.lineWidth = isH ? 2 : 1;
      ctx.stroke();
      ctx.fillStyle = isH ? "#fff" : isFiltered ? "#555" : "#aaa";
      ctx.font = `${isH ? 600 : 400} ${isH ? 12 : 11}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.fillText(n.label, n.x, n.y + r + 16);
      ctx.globalAlpha = 1;
    });
    rafRef.current = requestAnimationFrame(draw);
  }, []);
  useEffect(() => {
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const CX = canvas.offsetWidth / 2;
    const CY = canvas.offsetHeight / 2;
    function getPos(e: MouseEvent) {
      const r = canvas!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function hitTest(mx: number, my: number) {
      for (const n of nodesRef.current) {
        const dx = mx - n.x, dy = my - n.y;
        if (Math.sqrt(dx * dx + dy * dy) < 22) return n;
      }
      const dx = mx - CX, dy = my - CY;
      if (Math.sqrt(dx * dx + dy * dy) < 40) return "center" as const;
      return null;
    }
    const onMove = (e: MouseEvent) => {
      const p = getPos(e);
      if (draggingRef.current) {
        draggingRef.current.x = p.x;
        draggingRef.current.y = p.y;
        draggingRef.current.bx = p.x;
        draggingRef.current.by = p.y;
        canvas!.style.cursor = "grabbing";
        return;
      }
      const hit = hitTest(p.x, p.y);
      hoveredRef.current = hit && hit !== "center" ? hit : null;
      canvas!.style.cursor = hit ? "pointer" : "grab";
    };
    const onDown = (e: MouseEvent) => {
      const p = getPos(e);
      const hit = hitTest(p.x, p.y);
      if (hit && hit !== "center") {
        draggingRef.current = hit;
        canvas!.style.cursor = "grabbing";
      }
    };
    const onUp = () => { draggingRef.current = null; };
    const onLeave = () => { hoveredRef.current = null; draggingRef.current = null; };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mouseup", onUp);
    canvas.addEventListener("mouseleave", onLeave);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, []);
  return (
    <section className="py-20 sm:py-24">
      <div className="text-center mb-10">
        <p className="text-[10px] uppercase tracking-[0.15em] text-purple-400 font-mono mb-3">
          Evidence Graph
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-purple-50">
          Interactive{" "}
          <span className="bg-gradient-to-r from-amber-500 to-purple-400 bg-clip-text text-transparent">
            attack surface
          </span>{" "}
          mapping
        </h2>
        <p className="mt-4 text-sm font-mono text-purple-300/40 max-w-md mx-auto">
          Explore vulnerability relationships in real-time. Drag nodes to
          rearrange the graph.
        </p>
      </div>
      <div
        className="rounded-2xl border border-purple-500/15 overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(10,10,26,0.9) 0%, rgba(17,17,40,0.9) 50%, rgba(10,10,26,0.9) 100%)",
        }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-purple-500/10">
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="text-zinc-600">Graph</span>
            <span className="text-zinc-700">›</span>
            <span className="text-purple-400">vulnweb.com</span>
          </div>
          <span className="font-mono text-xs text-purple-400 bg-purple-500/[0.08] px-3.5 py-1.5 rounded-md border border-purple-500/15">
            vulnweb.com (DOMAIN) — 12 vulns
          </span>
          <span className="font-mono text-[11px] text-zinc-500 px-2.5 py-1 rounded-md border border-purple-500/20">
            ⊙ Graph
          </span>
        </div>
        {/* Severity filters */}
        <div className="flex items-center gap-2 px-5 py-3">
          {SEVERITIES.map((s) => (
            <button
              key={s.label}
              onClick={() => setActiveFilter(s.label)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-mono text-[11px] tracking-wide border transition-all ${
                activeFilter === s.label
                  ? "bg-purple-500/15 border-purple-500/35 text-purple-100"
                  : "bg-transparent border-white/[0.06] text-zinc-600 hover:border-purple-500/20"
              }`}
            >
              {s.color && (
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ background: s.color }}
                />
              )}
              {s.label}
            </button>
          ))}
        </div>
        <canvas
          ref={canvasRef}
          className="w-full block"
          style={{ height: 520, cursor: "grab" }}
        />
        {/* Stats bar */}
        <div className="flex justify-center py-3.5 border-t border-purple-500/10">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className={`text-center px-7 ${
                i < STATS.length - 1 ? "border-r border-purple-500/10" : ""
              }`}
            >
              <div className="font-mono text-[22px] font-bold text-purple-400">
                {s.value}
              </div>
              <div className="font-mono text-[10px] tracking-[2px] text-zinc-600 mt-0.5">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
