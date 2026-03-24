"use client";
import { useRef, useEffect } from "react";

interface Node {
  l: string;
  x: number;
  y: number;
  r: number;
  c: string;
  t: string;
  ox: number;
  oy: number;
}

const COLORS = {
  gold: "#f0b840",
  purple: "#9d5fff",
  red: "#ff3d57",
  green: "#4ade80",
  purpleDim: "#7c3aed",
  bg: "#060611",
  text: "#e0d6f6",
  muted: "#8878a9",
};

const TYPE_COLORS: Record<string, string> = {
  core: COLORS.gold,
  recon: COLORS.green,
  svc: COLORS.purple,
  vuln: COLORS.red,
  infra: COLORS.purpleDim,
};

const TYPE_LABELS: Record<string, string> = {
  core: "Primary Target",
  recon: "Reconnaissance",
  svc: "Open Service",
  vuln: "Vulnerability",
  infra: "Infrastructure",
};

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export default function AttackSurfaceGraph() {
  const ctRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current!;
    const ct = ctRef.current!;
    const ctx = c.getContext("2d")!;
    c.width = ct.clientWidth * 2;
    c.height = ct.clientHeight * 2;
    ctx.scale(2, 2);
    const W = ct.clientWidth;
    const H = ct.clientHeight;

    const nodes: Node[] = [
      { l: "TARGET", x: W / 2, y: H / 2, r: 18, c: TYPE_COLORS.core, t: "core", ox: 0, oy: 0 },
      { l: "DNS", x: W * 0.2, y: H * 0.3, r: 12, c: TYPE_COLORS.recon, t: "recon", ox: 0, oy: 0 },
      { l: "SUBS", x: W * 0.15, y: H * 0.68, r: 11, c: TYPE_COLORS.recon, t: "recon", ox: 0, oy: 0 },
      { l: "443", x: W * 0.72, y: H * 0.25, r: 10, c: TYPE_COLORS.svc, t: "svc", ox: 0, oy: 0 },
      { l: "80", x: W * 0.82, y: H * 0.5, r: 10, c: TYPE_COLORS.svc, t: "svc", ox: 0, oy: 0 },
      { l: "API", x: W * 0.65, y: H * 0.72, r: 11, c: TYPE_COLORS.vuln, t: "vuln", ox: 0, oy: 0 },
      { l: "ADMIN", x: W * 0.35, y: H * 0.85, r: 10, c: TYPE_COLORS.vuln, t: "vuln", ox: 0, oy: 0 },
      { l: "CDN", x: W * 0.38, y: H * 0.22, r: 9, c: TYPE_COLORS.infra, t: "infra", ox: 0, oy: 0 },
      { l: "WAF", x: W * 0.6, y: H * 0.45, r: 9, c: TYPE_COLORS.infra, t: "infra", ox: 0, oy: 0 },
      { l: "MX", x: W * 0.25, y: H * 0.5, r: 9, c: TYPE_COLORS.recon, t: "recon", ox: 0, oy: 0 },
      { l: "SSH", x: W * 0.85, y: H * 0.75, r: 9, c: TYPE_COLORS.svc, t: "svc", ox: 0, oy: 0 },
      { l: "XSS", x: W * 0.5, y: H * 0.88, r: 8, c: TYPE_COLORS.vuln, t: "vuln", ox: 0, oy: 0 },
    ];
    nodes.forEach((n) => {
      n.ox = n.x;
      n.oy = n.y;
    });

    const edges = [
      [0, 1], [0, 3], [0, 4], [0, 8],
      [1, 2], [1, 7], [1, 9],
      [0, 5], [5, 10], [0, 6], [6, 11],
      [3, 8], [4, 10], [8, 5], [2, 9], [5, 11],
    ];

    let hov = -1;
    let drag = -1;
    let mx = 0;
    let my = 0;
    let pt = 0;
    let animId: number;
    let lastFrame = 0;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const FRAME_INTERVAL = 1000 / (isMobile ? 20 : 30); // 20fps mobile, 30fps desktop

    const onMouseMove = (e: MouseEvent) => {
      const r = ct.getBoundingClientRect();
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
      hov = -1;
      nodes.forEach((n, i) => {
        if (Math.hypot(n.x - mx, n.y - my) < n.r + 6) hov = i;
      });
      if (drag >= 0) {
        nodes[drag].x = mx;
        nodes[drag].y = my;
        nodes[drag].ox = mx;
        nodes[drag].oy = my;
      }
      ct.style.cursor = hov >= 0 ? "grab" : "default";
    };
    const onMouseDown = () => {
      if (hov >= 0) drag = hov;
    };
    const onMouseUp = () => {
      drag = -1;
    };
    const onMouseLeave = () => {
      hov = -1;
      drag = -1;
    };

    ct.addEventListener("mousemove", onMouseMove);
    ct.addEventListener("mousedown", onMouseDown);
    ct.addEventListener("mouseup", onMouseUp);
    ct.addEventListener("mouseleave", onMouseLeave);

    function drawCornerBrackets() {
      const bLen = 20;
      const pad = 8;
      ctx.strokeStyle = COLORS.gold + "44";
      ctx.lineWidth = 1.5;

      // Top-left
      ctx.beginPath();
      ctx.moveTo(pad, pad + bLen);
      ctx.lineTo(pad, pad);
      ctx.lineTo(pad + bLen, pad);
      ctx.stroke();

      // Top-right
      ctx.beginPath();
      ctx.moveTo(W - pad - bLen, pad);
      ctx.lineTo(W - pad, pad);
      ctx.lineTo(W - pad, pad + bLen);
      ctx.stroke();

      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(pad, H - pad - bLen);
      ctx.lineTo(pad, H - pad);
      ctx.lineTo(pad + bLen, H - pad);
      ctx.stroke();

      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(W - pad - bLen, H - pad);
      ctx.lineTo(W - pad, H - pad);
      ctx.lineTo(W - pad, H - pad - bLen);
      ctx.stroke();
    }

    function drawDotGrid() {
      const spacing = 40;
      ctx.fillStyle = COLORS.muted + "22";
      for (let x = 0; x < W; x += spacing) {
        for (let y = 0; y < H; y += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function drawRadarSweep() {
      const cx = W / 2;
      const cy = H / 2;
      const radius = Math.max(W, H);
      const angle = pt * 0.3;

      ctx.save();
      ctx.globalAlpha = 0.06;
      const grad = ctx.createConicGradient(angle, cx, cy);
      grad.addColorStop(0, COLORS.purple);
      grad.addColorStop(0.08, COLORS.purple + "00");
      grad.addColorStop(0.1, "transparent");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawLegend() {
      const entries = [
        { label: "CORE", color: COLORS.gold },
        { label: "RECON", color: COLORS.green },
        { label: "SVC", color: COLORS.purple },
        { label: "VULN", color: COLORS.red },
        { label: "INFRA", color: COLORS.purpleDim },
      ];
      const lx = W - 14;
      const ly = H - 14;
      const lineH = 14;
      const totalH = entries.length * lineH + 8;

      ctx.save();
      ctx.fillStyle = "rgba(6,6,17,0.8)";
      ctx.strokeStyle = COLORS.muted + "33";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(lx - 80, ly - totalH, 80, totalH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.font = "8px monospace";
      ctx.textAlign = "right";
      entries.forEach((e, i) => {
        const ey = ly - totalH + 12 + i * lineH;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(lx - 66, ey - 3, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.text + "aa";
        ctx.fillText(e.label, lx - 8, ey);
      });
      ctx.restore();
    }

    function draw(now: number = 0) {
      animId = requestAnimationFrame(draw);
      if (now - lastFrame < FRAME_INTERVAL) return;
      lastFrame = now;
      pt += 0.02;
      ctx.clearRect(0, 0, W, H);

      // Dot grid background
      drawDotGrid();

      // Radar sweep overlay
      drawRadarSweep();

      // Corner brackets HUD decoration
      drawCornerBrackets();

      // Float animation
      nodes.forEach((n, i) => {
        if (i !== drag) {
          n.x = n.ox + Math.sin(pt + i * 1.3) * 4;
          n.y = n.oy + Math.cos(pt + i * 0.9) * 3;
        }
      });

      // Edges — dashed lines + animated packets
      edges.forEach(([a, b]) => {
        const na = nodes[a], nb = nodes[b];
        const ih = hov === a || hov === b;

        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(nb.x, nb.y);
        ctx.strokeStyle = ih ? COLORS.purple + "88" : COLORS.purple + "1a";
        ctx.lineWidth = ih ? 1.5 : 1;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Animated packet
        const t = (pt * 0.5 + a * 0.3 + b * 0.2) % 1;
        const px = na.x + (nb.x - na.x) * t;
        const py = na.y + (nb.y - na.y) * t;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = ih ? COLORS.purple : COLORS.purple + "44";
        ctx.fill();
      });

      // Nodes — hexagons
      nodes.forEach((n, i) => {
        const ih = hov === i;

        // Hover glow
        if (ih) {
          ctx.save();
          const glowR = n.r + 12;
          const g = ctx.createRadialGradient(n.x, n.y, n.r * 0.5, n.x, n.y, glowR);
          g.addColorStop(0, n.c + "44");
          g.addColorStop(1, "transparent");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Pulse ring (hexagonal)
        const pr = n.r + 4 + Math.sin(pt * 2 + i) * 3;
        hexPath(ctx, n.x, n.y, pr);
        ctx.strokeStyle = n.c + "22";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Node hexagon
        hexPath(ctx, n.x, n.y, n.r);
        ctx.fillStyle = ih ? n.c + "dd" : n.c + "28";
        ctx.fill();
        ctx.strokeStyle = n.c;
        ctx.lineWidth = ih ? 2 : 1;
        ctx.stroke();

        // Label — uppercase, tight letter-spacing
        ctx.save();
        ctx.fillStyle = ih ? COLORS.text : COLORS.text + "99";
        ctx.font = (ih ? "bold " : "") + "9px monospace";
        ctx.textAlign = "center";
        // Simulate tight letter-spacing by drawing characters closer
        const label = n.l;
        const spacing = ih ? 4.5 : 4;
        const totalWidth = (label.length - 1) * spacing;
        let startX = n.x - totalWidth / 2;
        const labelY = n.y + n.r + 14;
        for (let ci = 0; ci < label.length; ci++) {
          ctx.fillText(label[ci], startX + ci * spacing, labelY);
        }
        ctx.restore();
      });

      // Tooltip on hover
      if (hov >= 0) {
        const n = nodes[hov];
        const txt = TYPE_LABELS[n.t] || n.t;
        ctx.save();
        ctx.fillStyle = "rgba(6,6,17,0.92)";
        ctx.strokeStyle = n.c + "66";
        ctx.lineWidth = 1;
        const tw = ctx.measureText(txt).width + 20;
        const tx = n.x - tw / 2;
        const ty = n.y - n.r - 32;
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, 22, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = n.c;
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(txt.toUpperCase(), n.x, ty + 15);
        ctx.restore();
      }

      // Legend
      drawLegend();

    }

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      ct.removeEventListener("mousemove", onMouseMove);
      ct.removeEventListener("mousedown", onMouseDown);
      ct.removeEventListener("mouseup", onMouseUp);
      ct.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return (
    <div
      ref={ctRef}
      className="w-full h-[400px] mt-6 rounded-2xl border border-[#9d5fff]/20 bg-[#060611] backdrop-blur-md relative overflow-hidden"
    >
      <div className="absolute top-3 left-4 text-[11px] tracking-[3px] uppercase text-[#f0b840] font-mono z-10">
        THREAT TOPOLOGY
      </div>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
