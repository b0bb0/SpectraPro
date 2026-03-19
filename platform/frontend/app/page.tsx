'use client'

import Link from 'next/link'
import {
  ArrowRight,
  Shield,
  Sparkles,
  Workflow,
  Gauge,
  CloudLightning,
  CircuitBoard,
  Satellite,
  Layers,
  Crosshair,
  Radio,
  Zap,
  Lock,
  Eye,
} from 'lucide-react'
import StarCanvas from '@/components/StarCanvas'

const featureCards = [
  {
    title: 'Adaptive Recon',
    body: 'Domain-to-asset mapping with live host checks, screenshots, and signal health gates.',
    icon: Satellite,
  },
  {
    title: 'AI Exposure Triage',
    body: 'Shodan + Ollama condense noise, rank relevancy, and score risk in seconds.',
    icon: CloudLightning,
  },
  {
    title: 'Evidence Graph',
    body: 'Nuclei → entity graph with relationships, tags, and exportable evidence trails.',
    icon: CircuitBoard,
  },
  {
    title: 'Exec-Ready Intel',
    body: 'Narratives, metrics, and PDF/Markdown exports for leadership in one click.',
    icon: Gauge,
  },
]

const pipeline = [
  { step: 'Recon & Subdomain Map', icon: Radio },
  { step: 'Active Host & Screenshot', icon: Eye },
  { step: 'Shodan Enrichment', icon: Satellite },
  { step: 'Nuclei Deep Scan', icon: Crosshair },
  { step: 'LLM Risk Prioritization', icon: Zap },
  { step: 'Report & Export', icon: Gauge },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Cosmic background */}
      <StarCanvas />
      <div className="aurora-1" />
      <div className="aurora-2" />
      <div className="aurora-3" />
      <div className="shoot" />
      <div className="shoot" />
      <div className="shoot" />

      <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 pb-24">
        {/* Nav */}
        <header className="flex items-center justify-between py-6" style={{ animation: 'rise 0.4s ease-out both' }}>
          <div className="flex items-center gap-3">
            <div
              className="h-11 w-11 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #f0b840, #9d5fff)',
                boxShadow: '0 0 20px rgba(240, 184, 64, 0.3)',
              }}
            >
              <Shield className="w-5 h-5" style={{ color: '#02020d' }} />
            </div>
            <div>
              <p className="text-lg font-semibold" style={{ color: '#e0d6f6' }}>SpectraPRO</p>
              <p className="text-[10px] font-mono" style={{ color: '#8878a9' }}>Offensive Security Command</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ border: '1px solid rgba(157,95,255,0.2)', color: '#e0d6f6' }}
            >
              Sign In
            </Link>
            <Link href="/login" className="btn-premium inline-flex items-center gap-2 text-sm">
              Launch Platform <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch mt-6">
          {/* Main hero card */}
          <div
            className="lg:col-span-7 cosmic-panel p-8 sm:p-10 relative overflow-hidden"
            style={{ animation: 'rise 0.5s ease-out both' }}
          >
            {/* Glow accent */}
            <div
              className="absolute -right-16 -top-16 w-64 h-64 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(240,184,64,0.15), transparent 70%)',
                filter: 'blur(60px)',
                pointerEvents: 'none',
              }}
            />
            <div
              className="absolute -left-10 bottom-[-40px] w-48 h-48 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(157,95,255,0.12), transparent 70%)',
                filter: 'blur(50px)',
                pointerEvents: 'none',
              }}
            />

            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] tracking-[0.15em] uppercase font-mono"
              style={{
                background: 'rgba(240,184,64,0.08)',
                border: '1px solid rgba(240,184,64,0.2)',
                color: '#f0b840',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Security Operations Platform
            </div>

            <h1
              className="mt-7 text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.08] font-bold"
              style={{ color: '#e0d6f6' }}
            >
              Distinctive{' '}
              <span className="gradient-text">vulnerability management</span>{' '}
              for teams that ship fast.
            </h1>

            <p className="mt-6 text-lg max-w-2xl leading-relaxed" style={{ color: '#8878a9' }}>
              Orchestrated recon, deep scanning, AI triage, and executive-ready intelligence — all in one
              command surface. Built for programs iterating weekly, not yearly.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className="btn-premium inline-flex items-center gap-2">
                Enter Workspace <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                className="px-5 py-3 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: 'rgba(157, 95, 255, 0.08)',
                  border: '1px solid rgba(157, 95, 255, 0.2)',
                  color: '#e0d6f6',
                }}
              >
                View Architecture Deck
              </button>
            </div>

            {/* Stats */}
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              {[
                { label: 'Median scan cycle', value: '23 min', color: '#f0b840' },
                { label: 'Assets mapped', value: '1,200+', color: '#9d5fff' },
                { label: 'False-positive cut', value: '-38%', color: '#4ade80' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl px-4 py-4"
                  style={{
                    background: 'rgba(14,14,58,0.5)',
                    border: '1px solid rgba(157,95,255,0.1)',
                  }}
                >
                  <p className="text-[10px] uppercase tracking-[0.1em] font-mono" style={{ color: '#6b5f8a' }}>
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold font-mono" style={{ color: item.color }}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-5 space-y-5">
            {/* Live Risk Pulse */}
            <div
              className="cosmic-panel p-6"
              style={{ animation: 'rise 0.55s ease-out both' }}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] font-mono" style={{ color: '#f0b840' }}>
                    Live Risk Pulse
                  </p>
                  <p className="text-lg font-semibold" style={{ color: '#e0d6f6' }}>Executive snapshot</p>
                </div>
                <span
                  className="cosmic-pill"
                  style={{
                    background: 'rgba(74,222,128,0.12)',
                    color: '#4ade80',
                    border: '1px solid rgba(74,222,128,0.3)',
                  }}
                >
                  ● Live
                </span>
              </div>

              <div className="space-y-3">
                <PulseRow label="Critical Exposure" value="7" color="#ff6b6b" />
                <PulseRow label="Active Attack Surface" value="93 assets" color="#f0b840" />
                <PulseRow label="Remediation SLA" value="91%" color="#4ade80" />
              </div>

              <div
                className="mt-5 rounded-xl p-4"
                style={{ background: 'rgba(14,14,58,0.5)', border: '1px solid rgba(157,95,255,0.08)' }}
              >
                <p className="text-[10px] uppercase tracking-[0.1em] font-mono mb-2" style={{ color: '#6b5f8a' }}>
                  Current Focus
                </p>
                <p className="text-sm" style={{ color: '#c8a0ff' }}>
                  Authentication bypass and exposed admin surfaces across production web assets.
                </p>
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm" style={{ color: '#8878a9' }}>
                <Workflow className="w-4 h-4" style={{ color: '#9d5fff' }} />
                <span>Designed for analyst squads and exec stakeholders</span>
              </div>
            </div>

            {/* Orchestrated Flow */}
            <div
              className="cosmic-panel p-6"
              style={{ animation: 'rise 0.6s ease-out both' }}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] font-mono" style={{ color: '#f0b840' }}>
                    Orchestrated Flow
                  </p>
                  <p className="text-lg font-semibold" style={{ color: '#e0d6f6' }}>From signal to storyline</p>
                </div>
                <Layers className="w-5 h-5" style={{ color: '#9d5fff' }} />
              </div>

              <div className="space-y-2">
                {pipeline.map((item, idx) => (
                  <div
                    key={item.step}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all"
                    style={{
                      background: 'rgba(14,14,58,0.4)',
                      border: '1px solid rgba(157,95,255,0.08)',
                    }}
                  >
                    <span
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold font-mono flex-shrink-0"
                      style={{
                        background: 'linear-gradient(135deg, rgba(240,184,64,0.15), rgba(157,95,255,0.12))',
                        border: '1px solid rgba(240,184,64,0.25)',
                        color: '#f0b840',
                      }}
                    >
                      {idx + 1}
                    </span>
                    <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: '#8878a9' }} />
                    <p className="text-sm" style={{ color: '#e0d6f6' }}>{item.step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mt-16" style={{ animation: 'rise 0.65s ease-out both' }}>
          <div className="mb-8">
            <p className="text-[10px] uppercase tracking-[0.12em] font-mono mb-2" style={{ color: '#f0b840' }}>
              Capabilities
            </p>
            <h2 className="text-3xl font-bold" style={{ color: '#e0d6f6' }}>
              Built for <span className="gradient-text">velocity and clarity</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {featureCards.map((card, i) => (
              <div
                key={card.title}
                className="cosmic-panel p-6 group cursor-default"
                style={{ animation: `rise ${0.7 + i * 0.05}s ease-out both` }}
              >
                <div
                  className="h-11 w-11 rounded-xl flex items-center justify-center mb-4"
                  style={{
                    background: 'linear-gradient(135deg, rgba(240,184,64,0.2), rgba(157,95,255,0.15))',
                    border: '1px solid rgba(240,184,64,0.3)',
                    boxShadow: '0 0 12px rgba(240,184,64,0.1)',
                  }}
                >
                  <card.icon className="w-5 h-5" style={{ color: '#f0b840' }} />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: '#e0d6f6' }}>
                  {card.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: '#8878a9' }}>
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="mt-20 text-center" style={{ animation: 'rise 0.8s ease-out both' }}>
          <div
            className="cosmic-panel p-10 sm:p-14 relative overflow-hidden"
          >
            <div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(240,184,64,0.06), transparent 70%)',
                pointerEvents: 'none',
              }}
            />
            <div className="relative">
              <Lock className="w-8 h-8 mx-auto mb-4" style={{ color: '#f0b840' }} />
              <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: '#e0d6f6' }}>
                Ready to <span className="gradient-text">take command</span>?
              </h2>
              <p className="text-lg max-w-xl mx-auto mb-8" style={{ color: '#8878a9' }}>
                Deploy your offensive security operations in minutes, not months.
              </p>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <Link href="/login" className="btn-premium inline-flex items-center gap-2 text-base px-8 py-3.5">
                  Launch Platform <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/register"
                  className="px-6 py-3.5 rounded-lg text-base font-medium transition-all inline-flex items-center gap-2"
                  style={{
                    background: 'rgba(157, 95, 255, 0.08)',
                    border: '1px solid rgba(157, 95, 255, 0.2)',
                    color: '#e0d6f6',
                  }}
                >
                  Create Account
                </Link>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-10 flex items-center justify-center gap-2 text-sm" style={{ color: '#6b5f8a' }}>
            <Shield className="w-4 h-4" style={{ color: '#8878a9' }} />
            <span className="font-mono">SpectraPRO</span>
            <span>·</span>
            <span>Offensive Security Command Platform</span>
          </div>
        </section>
      </div>
    </div>
  )
}

function PulseRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl px-4 py-3"
      style={{
        background: 'rgba(14,14,58,0.4)',
        border: '1px solid rgba(157,95,255,0.08)',
      }}
    >
      <div>
        <p className="text-sm" style={{ color: '#8878a9' }}>{label}</p>
        <p className="text-base font-semibold font-mono" style={{ color }}>{value}</p>
      </div>
      <span
        className="px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold"
        style={{
          background: `${color}15`,
          color,
          border: `1px solid ${color}30`,
        }}
      >
        live
      </span>
    </div>
  )
}
