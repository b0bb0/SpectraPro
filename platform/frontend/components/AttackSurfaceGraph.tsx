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
      { l: "Target", x: W / 2, y: H / 2, r: 18, c: "#a78bfa", t: "core", ox: 0, oy: 0 },
      { l: "DNS", x: W * 0.2, y: H * 0.3, r: 12, c: "#6ee7b7", t: "recon", ox: 0, oy: 0 },
      { l: "Subs", x: W * 0.15, y: H * 0.68, r: 11, c: "#6ee7b7", t: "recon", ox: 0, oy: 0 },
      { l: "443", x: W * 0.72, y: H * 0.25, r: 10, c: "#fbbf24", t: "svc", ox: 0, oy: 0 },
      { l: "80", x: W * 0.82, y: H * 0.5, r: 10, c: "#fbbf24", t: "svc", ox: 0, oy: 0 },
      { l: "API", x: W * 0.65, y: H * 0.72, r: 11, c: "#f87171", t: "vuln", ox: 0, oy: 0 },
      { l: "Admin", x: W * 0.35, y: H * 0.85, r: 10, c: "#f87171", t: "vuln", ox: 0, oy: 0 },
      { l: "CDN", x: W * 0.38, y: H * 0.22, r: 9, c: "#38bdf8", t: "infra", ox: 0, oy: 0 },
      { l: "WAF", x: W * 0.6, y: H * 0.45, r: 9, c: "#38bdf8", t: "infra", ox: 0, oy: 0 },
      { l: "MX", x: W * 0.25, y: H * 0.5, r: 9, c: "#6ee7b7", t: "recon", ox: 0, oy: 0 },
      { l: "SSH", x: W * 0.85, y: H * 0.75, r: 9, c: "#fbbf24", t: "svc", ox: 0, oy: 0 },
      { l: "XSS", x: W * 0.5, y: H * 0.88, r: 8, c: "#f87171", t: "vuln", ox: 0, oy: 0 },
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

    function draw() {
      pt += 0.02;
      ctx.clearRect(0, 0, W, H);

      // Subtle grid
      ctx.strokeStyle = "rgba(139,92,246,0.04)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Float animation
      nodes.forEach((n, i) => {
        if (i !== drag) {
          n.x = n.ox + Math.sin(pt + i * 1.3) * 4;
          n.y = n.oy + Math.cos(pt + i * 0.9) * 3;
        }
      });

      // Edges + animated packets
      edges.forEach(([a, b]) => {
        const na = nodes[a], nb = nodes[b];
        ctx.beginPath();
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(nb.x, nb.y);
        const ih = hov === a || hov === b;
        ctx.strokeStyle = ih ? "rgba(167,139,250,0.6)" : "rgba(167,139,250,0.15)";
        ctx.lineWidth = ih ? 2 : 1;
        ctx.stroke();

        const t = (pt * 0.5 + a * 0.3 + b * 0.2) % 1;
        const px = na.x + (nb.x - na.x) * t;
        const py = na.y + (nb.y - na.y) * t;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = ih ? "#a78bfa" : "rgba(167,139,250,0.3)";
        ctx.fill();
      });

      // Nodes
      nodes.forEach((n, i) => {
        const ih = hov === i;

        // Hover glow
        if (ih) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 10, 0, Math.PI * 2);
          const g = ctx.createRadialGradient(n.x, n.y, n.r, n.x, n.y, n.r + 10);
          g.addColorStop(0, n.c + "44");
          g.addColorStop(1, "transparent");
          ctx.fillStyle = g;
          ctx.fill();
        }

        // Pulse ring
        const pr = n.r + 4 + Math.sin(pt * 2 + i) * 3;
        ctx.beginPath();
        ctx.arc(n.x, n.y, pr, 0, Math.PI * 2);
        ctx.strokeStyle = n.c + "22";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = ih ? n.c : n.c + "33";
        ctx.fill();
        ctx.strokeStyle = n.c;
        ctx.lineWidth = ih ? 2 : 1;
        ctx.stroke();

        // Label
        ctx.fillStyle = ih ? "#fff" : "rgba(255,255,255,0.7)";
        ctx.font = (ih ? "bold " : "") + "10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(n.l, n.x, n.y + n.r + 14);
      });

      // Tooltip on hover
      if (hov >= 0) {
        const n = nodes[hov];
        const types: Record<string, string> = {
          core: "Primary Target",
          recon: "Reconnaissance",
          svc: "Open Service",
          vuln: "Vulnerability",
          infra: "Infrastructure",
        };
        const txt = types[n.t] || n.t;
        ctx.fillStyle = "rgba(15,10,30,0.9)";
        ctx.strokeStyle = n.c + "66";
        ctx.lineWidth = 1;
        const tw = ctx.measureText(txt).width + 16;
        ctx.beginPath();
        ctx.roundRect(n.x - tw / 2, n.y - n.r - 30, tw, 20, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = n.c;
        ctx.font = "10px monospace";
        ctx.fillText(txt, n.x, n.y - n.r - 16);
      }

      animId = requestAnimationFrame(draw);
    }

    draw();

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
      className="w-full h-[320px] mt-6 rounded-2xl border border-violet-500/25 bg-[rgba(15,10,30,0.7)] backdrop-blur-md relative overflow-hidden"
    >
      <div className="absolute top-3 left-4 text-[11px] tracking-[2px] uppercase text-violet-400 font-mono z-10">
        Live Attack Surface Graph
      </div>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
