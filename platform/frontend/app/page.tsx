'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, useInView, useReducedMotion } from 'framer-motion'
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
  Menu,
  X,
  CheckCircle2,
  Quote,
  ExternalLink,
  Github,
  Twitter,
  Linkedin,
  Mail,
  ChevronRight,
  ShieldCheck,
  Award,
  Globe,
} from 'lucide-react'
import StarCanvas from '@/components/StarCanvas'
import EvidenceGraph from '@/components/EvidenceGraph'

/* ─────────────────────────────────────────────
   Animation helpers
   ───────────────────────────────────────────── */
function FadeInSection({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 32 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/* ─────────────────────────────────────────────
   Data
   ───────────────────────────────────────────── */
const featureCards = [
  {
    title: 'Adaptive Recon',
    body: 'Domain-to-asset mapping with live host checks, screenshots, and signal health gates.',
    icon: Satellite,
    accent: '#f0b840',
  },
  {
    title: 'AI Exposure Triage',
    body: 'Shodan + Ollama condense noise, rank relevancy, and score risk in seconds.',
    icon: CloudLightning,
    accent: '#9d5fff',
  },
  {
    title: 'Evidence Graph',
    body: 'Nuclei to entity graph with relationships, tags, and exportable evidence trails.',
    icon: CircuitBoard,
    accent: '#4ade80',
  },
  {
    title: 'Exec-Ready Intel',
    body: 'Narratives, metrics, and PDF/Markdown exports for leadership in one click.',
    icon: Gauge,
    accent: '#60a5fa',
  },
]

const pipeline = [
  { step: 'Recon & Subdomain Map', icon: Radio, desc: 'Enumerate targets and map the full attack surface' },
  { step: 'Active Host & Screenshot', icon: Eye, desc: 'Validate live hosts with visual proof' },
  { step: 'Shodan Enrichment', icon: Satellite, desc: 'Layer in external exposure intelligence' },
  { step: 'Nuclei Deep Scan', icon: Crosshair, desc: 'Run targeted vulnerability templates' },
  { step: 'LLM Risk Prioritization', icon: Zap, desc: 'AI ranks and triages findings by impact' },
  { step: 'Report & Export', icon: Gauge, desc: 'Generate executive-ready deliverables' },
]

const stats = [
  { label: 'Median scan cycle', value: '23 min', color: '#f0b840' },
  { label: 'Assets mapped', value: '1,200+', color: '#9d5fff' },
  { label: 'False-positive cut', value: '-38%', color: '#4ade80' },
]

const trustLogos = [
  'SOC 2 Type II',
  'ISO 27001',
  'OWASP Top 10',
  'NIST CSF',
  'PCI DSS',
]

const testimonials = [
  {
    quote: 'SpectraPRO cut our vulnerability triage time by 60%. The AI prioritization actually works — our analysts spend time on real issues now.',
    author: 'Sarah Chen',
    role: 'Head of Security Engineering',
    company: 'Series B Fintech',
  },
  {
    quote: 'Finally, a pentest platform that gives me exec-ready reports without spending two days formatting. The orchestrated flow is brilliant.',
    author: 'Marcus Rivera',
    role: 'VP of Information Security',
    company: 'Healthcare SaaS',
  },
]

const footerLinks = {
  Product: ['Features', 'Pricing', 'Integrations', 'Changelog', 'Roadmap'],
  Resources: ['Documentation', 'API Reference', 'Blog', 'Community', 'Status'],
  Company: ['About', 'Careers', 'Contact', 'Partners', 'Press'],
  Legal: ['Privacy Policy', 'Terms of Service', 'Security', 'Compliance', 'DPA'],
}

/* ─────────────────────────────────────────────
   Landing Page
   ───────────────────────────────────────────── */
export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileMenuOpen])

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Skip to content — a11y */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-gold focus:text-black focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* Cosmic background */}
      <StarCanvas />
      <div className="aurora-1" aria-hidden="true" />
      <div className="aurora-2" aria-hidden="true" />
      <div className="aurora-3" aria-hidden="true" />
      <div className="shoot" aria-hidden="true" />
      <div className="shoot" aria-hidden="true" />
      <div className="shoot" aria-hidden="true" />

      <div className="relative z-10">
        {/* ─── Navigation ─── */}
        <header className="sticky top-0 z-50 backdrop-blur-xl border-b border-transparent" style={{ background: 'rgba(2,2,13,0.7)', borderColor: 'rgba(157,95,255,0.08)' }}>
          <nav className="max-w-7xl mx-auto px-5 sm:px-8 flex items-center justify-between h-16" role="navigation" aria-label="Main navigation">
            <Link href="/" className="flex items-center gap-3 group" aria-label="SpectraPRO home">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center transition-shadow group-hover:shadow-glow-sm"
                style={{
                  background: 'linear-gradient(135deg, #f0b840, #9d5fff)',
                }}
              >
                <Shield className="w-5 h-5" style={{ color: '#02020d' }} />
              </div>
              <div>
                <p className="text-base font-semibold leading-tight" style={{ color: '#e0d6f6' }}>SpectraPRO</p>
                <p className="text-[10px] font-mono leading-tight" style={{ color: '#8878a9' }}>Offensive Security Command</p>
              </div>
            </Link>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-6">
              {['Features', 'Workflow', 'Testimonials'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  className="text-sm font-medium transition-colors hover:text-gold"
                  style={{ color: '#8878a9' }}
                >
                  {item}
                </a>
              ))}
            </div>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-3">
              <Link
                href="/login"
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-white/5"
                style={{ border: '1px solid rgba(157,95,255,0.2)', color: '#e0d6f6' }}
              >
                Sign In
              </Link>
              <Link href="/login" className="btn-premium inline-flex items-center gap-2 text-sm">
                Launch Platform <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-lg transition-colors hover:bg-white/5"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" style={{ color: '#e0d6f6' }} />
              ) : (
                <Menu className="w-6 h-6" style={{ color: '#e0d6f6' }} />
              )}
            </button>
          </nav>

          {/* Mobile menu overlay */}
          {mobileMenuOpen && (
            <motion.div
              id="mobile-menu"
              className="md:hidden fixed inset-0 top-16 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ background: 'rgba(2,2,13,0.95)', backdropFilter: 'blur(24px)' }}
            >
              <div className="flex flex-col gap-2 p-6">
                {['Features', 'Workflow', 'Testimonials'].map((item) => (
                  <a
                    key={item}
                    href={`#${item.toLowerCase()}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-lg font-medium py-3 px-4 rounded-lg transition-colors hover:bg-white/5"
                    style={{ color: '#e0d6f6' }}
                  >
                    {item}
                  </a>
                ))}
                <div className="border-t my-4" style={{ borderColor: 'rgba(157,95,255,0.12)' }} />
                <Link
                  href="/login"
                  className="text-lg font-medium py-3 px-4 rounded-lg text-center transition-colors"
                  style={{ border: '1px solid rgba(157,95,255,0.2)', color: '#e0d6f6' }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  href="/login"
                  className="btn-premium text-center text-lg py-3"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Launch Platform
                </Link>
              </div>
            </motion.div>
          )}
        </header>

        {/* ─── Main Content ─── */}
        <main id="main-content" className="max-w-7xl mx-auto px-5 sm:px-8">

          {/* ─── Hero Section ─── */}
          <section className="pt-12 sm:pt-16 lg:pt-20 pb-16" aria-labelledby="hero-heading">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
              {/* Main hero card */}
              <motion.div
                className="lg:col-span-7 cosmic-panel p-8 sm:p-10 relative overflow-hidden"
                initial={prefersReducedMotion ? {} : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Glow accents */}
                <div
                  className="absolute -right-16 -top-16 w-64 h-64 rounded-full"
                  style={{
                    background: 'radial-gradient(circle, rgba(240,184,64,0.15), transparent 70%)',
                    filter: 'blur(60px)',
                    pointerEvents: 'none',
                  }}
                  aria-hidden="true"
                />
                <div
                  className="absolute -left-10 bottom-[-40px] w-48 h-48 rounded-full"
                  style={{
                    background: 'radial-gradient(circle, rgba(157,95,255,0.12), transparent 70%)',
                    filter: 'blur(50px)',
                    pointerEvents: 'none',
                  }}
                  aria-hidden="true"
                />

                <div
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] tracking-[0.15em] uppercase font-mono"
                  style={{
                    background: 'rgba(240,184,64,0.08)',
                    border: '1px solid rgba(240,184,64,0.2)',
                    color: '#f0b840',
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  Security Operations Platform
                </div>

                <h1
                  id="hero-heading"
                  className="mt-7 text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.08] font-bold tracking-tight"
                  style={{ color: '#e0d6f6' }}
                >
                  Distinctive{' '}
                  <span className="gradient-text">vulnerability management</span>{' '}
                  for teams that ship fast.
                </h1>

                <p className="mt-6 text-base sm:text-lg max-w-2xl leading-relaxed" style={{ color: '#8878a9' }}>
                  Orchestrated recon, deep scanning, AI triage, and executive-ready intelligence — all in one
                  command surface. Built for programs iterating weekly, not yearly.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link href="/register" className="btn-premium inline-flex items-center gap-2">
                    Get Started Free <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="#workflow"
                    className="px-5 py-3 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-2 hover:bg-white/5"
                    style={{
                      background: 'rgba(157, 95, 255, 0.08)',
                      border: '1px solid rgba(157, 95, 255, 0.2)',
                      color: '#e0d6f6',
                    }}
                  >
                    See How It Works
                  </Link>
                </div>

                {/* Stats */}
                <div className="mt-10 grid grid-cols-3 gap-3 text-sm">
                  {stats.map((item) => (
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
                      <p className="mt-2 text-xl sm:text-2xl font-bold font-mono" style={{ color: item.color }}>
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Right column */}
              <div className="lg:col-span-5 space-y-5">
                {/* Live Risk Pulse */}
                <motion.div
                  className="cosmic-panel p-6"
                  initial={prefersReducedMotion ? {} : { opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
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
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse" />
                      Live
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
                    <Workflow className="w-4 h-4 flex-shrink-0" style={{ color: '#9d5fff' }} />
                    <span>Designed for analyst squads and exec stakeholders</span>
                  </div>
                </motion.div>

                {/* Orchestrated Flow */}
                <motion.div
                  className="cosmic-panel p-6"
                  initial={prefersReducedMotion ? {} : { opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] font-mono" style={{ color: '#f0b840' }}>
                        Orchestrated Flow
                      </p>
                      <p className="text-lg font-semibold" style={{ color: '#e0d6f6' }}>From signal to storyline</p>
                    </div>
                    <Layers className="w-5 h-5" style={{ color: '#9d5fff' }} aria-hidden="true" />
                  </div>

                  <div className="space-y-2">
                    {pipeline.slice(0, 6).map((item, idx) => (
                      <div
                        key={item.step}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all hover:bg-white/[0.02]"
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
                        <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: '#8878a9' }} aria-hidden="true" />
                        <p className="text-sm" style={{ color: '#e0d6f6' }}>{item.step}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
            </div>
          </section>

          {/* ─── Evidence Graph ─── */}
          <FadeInSection>
            <EvidenceGraph />
          </FadeInSection>

          {/* ─── Trust Bar ─── */}
          <FadeInSection>
            <section className="py-10 border-y" style={{ borderColor: 'rgba(157,95,255,0.08)' }} aria-label="Security compliance">
              <p className="text-center text-[10px] uppercase tracking-[0.2em] font-mono mb-6" style={{ color: '#6b5f8a' }}>
                Built to meet enterprise security standards
              </p>
              <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
                {trustLogos.map((logo) => (
                  <div
                    key={logo}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg"
                    style={{
                      background: 'rgba(14,14,58,0.3)',
                      border: '1px solid rgba(157,95,255,0.08)',
                    }}
                  >
                    <ShieldCheck className="w-4 h-4 flex-shrink-0" style={{ color: '#4ade80' }} aria-hidden="true" />
                    <span className="text-xs font-mono font-medium" style={{ color: '#8878a9' }}>{logo}</span>
                  </div>
                ))}
              </div>
            </section>
          </FadeInSection>

          {/* ─── How It Works (Workflow) ─── */}
          <FadeInSection>
            <section id="workflow" className="py-20 sm:py-24" aria-labelledby="workflow-heading">
              <div className="text-center mb-14">
                <p className="text-[10px] uppercase tracking-[0.15em] font-mono mb-3" style={{ color: '#f0b840' }}>
                  How It Works
                </p>
                <h2 id="workflow-heading" className="text-3xl sm:text-4xl font-bold" style={{ color: '#e0d6f6' }}>
                  From recon to <span className="gradient-text">executive report</span> in minutes
                </h2>
                <p className="mt-4 text-base max-w-2xl mx-auto" style={{ color: '#8878a9' }}>
                  Six automated phases turn raw attack surface data into prioritized, actionable intelligence.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {pipeline.map((item, idx) => (
                  <FadeInSection key={item.step} delay={idx * 0.08}>
                    <div
                      className="cosmic-panel p-6 h-full group relative overflow-hidden"
                    >
                      {/* Step number watermark */}
                      <span
                        className="absolute top-3 right-4 text-5xl font-bold font-mono opacity-[0.06] select-none"
                        style={{ color: '#f0b840' }}
                        aria-hidden="true"
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </span>

                      <div className="flex items-center gap-3 mb-4">
                        <div
                          className="h-10 w-10 rounded-xl flex items-center justify-center transition-all group-hover:shadow-glow-sm"
                          style={{
                            background: 'linear-gradient(135deg, rgba(240,184,64,0.15), rgba(157,95,255,0.12))',
                            border: '1px solid rgba(240,184,64,0.25)',
                          }}
                        >
                          <item.icon className="w-5 h-5" style={{ color: '#f0b840' }} aria-hidden="true" />
                        </div>
                        <span className="text-xs font-mono font-bold" style={{ color: '#f0b840' }}>
                          Step {idx + 1}
                        </span>
                      </div>

                      <h3 className="text-base font-semibold mb-2" style={{ color: '#e0d6f6' }}>
                        {item.step}
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: '#8878a9' }}>
                        {item.desc}
                      </p>
                    </div>
                  </FadeInSection>
                ))}
              </div>
            </section>
          </FadeInSection>

          {/* ─── Features ─── */}
          <FadeInSection>
            <section id="features" className="pb-20 sm:pb-24" aria-labelledby="features-heading">
              <div className="mb-10">
                <p className="text-[10px] uppercase tracking-[0.12em] font-mono mb-3" style={{ color: '#f0b840' }}>
                  Capabilities
                </p>
                <h2 id="features-heading" className="text-3xl sm:text-4xl font-bold" style={{ color: '#e0d6f6' }}>
                  Built for <span className="gradient-text">velocity and clarity</span>
                </h2>
                <p className="mt-4 text-base max-w-2xl" style={{ color: '#8878a9' }}>
                  Every capability is designed to reduce noise and accelerate time-to-remediation.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {featureCards.map((card, i) => (
                  <FadeInSection key={card.title} delay={i * 0.08}>
                    <div className="cosmic-panel p-6 h-full group cursor-default relative overflow-hidden">
                      {/* Hover glow */}
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                        style={{
                          background: `radial-gradient(circle at 50% 0%, ${card.accent}10, transparent 70%)`,
                        }}
                        aria-hidden="true"
                      />

                      <div
                        className="h-12 w-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-110"
                        style={{
                          background: `linear-gradient(135deg, ${card.accent}25, rgba(157,95,255,0.15))`,
                          border: `1px solid ${card.accent}40`,
                          boxShadow: `0 0 12px ${card.accent}15`,
                        }}
                      >
                        <card.icon className="w-5 h-5" style={{ color: card.accent }} aria-hidden="true" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2 relative" style={{ color: '#e0d6f6' }}>
                        {card.title}
                      </h3>
                      <p className="text-sm leading-relaxed relative" style={{ color: '#8878a9' }}>
                        {card.body}
                      </p>
                    </div>
                  </FadeInSection>
                ))}
              </div>
            </section>
          </FadeInSection>

          {/* ─── Testimonials ─── */}
          <FadeInSection>
            <section id="testimonials" className="pb-20 sm:pb-24" aria-labelledby="testimonials-heading">
              <div className="text-center mb-12">
                <p className="text-[10px] uppercase tracking-[0.12em] font-mono mb-3" style={{ color: '#f0b840' }}>
                  Trusted By Security Teams
                </p>
                <h2 id="testimonials-heading" className="text-3xl sm:text-4xl font-bold" style={{ color: '#e0d6f6' }}>
                  What practitioners <span className="gradient-text">are saying</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {testimonials.map((t, i) => (
                  <FadeInSection key={i} delay={i * 0.1}>
                    <figure className="cosmic-panel p-8 h-full relative">
                      <Quote
                        className="w-8 h-8 mb-4 opacity-30"
                        style={{ color: '#f0b840' }}
                        aria-hidden="true"
                      />
                      <blockquote className="text-base sm:text-lg leading-relaxed mb-6" style={{ color: '#c8a0ff' }}>
                        &ldquo;{t.quote}&rdquo;
                      </blockquote>
                      <figcaption className="flex items-center gap-3">
                        <div
                          className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold font-mono flex-shrink-0"
                          style={{
                            background: 'linear-gradient(135deg, rgba(240,184,64,0.2), rgba(157,95,255,0.2))',
                            border: '1px solid rgba(240,184,64,0.3)',
                            color: '#f0b840',
                          }}
                        >
                          {t.author.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: '#e0d6f6' }}>{t.author}</p>
                          <p className="text-xs" style={{ color: '#8878a9' }}>{t.role}, {t.company}</p>
                        </div>
                      </figcaption>
                    </figure>
                  </FadeInSection>
                ))}
              </div>
            </section>
          </FadeInSection>

          {/* ─── Bottom CTA ─── */}
          <FadeInSection>
            <section className="pb-20 sm:pb-24" aria-labelledby="cta-heading">
              <div className="cosmic-panel p-10 sm:p-16 relative overflow-hidden text-center">
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'radial-gradient(ellipse at center, rgba(240,184,64,0.06), transparent 70%)',
                    pointerEvents: 'none',
                  }}
                  aria-hidden="true"
                />
                <div className="relative">
                  <Lock className="w-10 h-10 mx-auto mb-5" style={{ color: '#f0b840' }} aria-hidden="true" />
                  <h2 id="cta-heading" className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4" style={{ color: '#e0d6f6' }}>
                    Ready to <span className="gradient-text">take command</span>?
                  </h2>
                  <p className="text-base sm:text-lg max-w-xl mx-auto mb-10" style={{ color: '#8878a9' }}>
                    Deploy your offensive security operations in minutes, not months.
                    Start with a free workspace — no credit card required.
                  </p>
                  <div className="flex items-center justify-center gap-4 flex-wrap">
                    <Link href="/register" className="btn-premium inline-flex items-center gap-2 text-base px-8 py-3.5">
                      Get Started Free <ArrowRight className="w-5 h-5" />
                    </Link>
                    <Link
                      href="/login"
                      className="px-6 py-3.5 rounded-lg text-base font-medium transition-all inline-flex items-center gap-2 hover:bg-white/5"
                      style={{
                        background: 'rgba(157, 95, 255, 0.08)',
                        border: '1px solid rgba(157, 95, 255, 0.2)',
                        color: '#e0d6f6',
                      }}
                    >
                      Sign In
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          </FadeInSection>
        </main>

        {/* ─── Footer ─── */}
        <footer className="border-t" style={{ borderColor: 'rgba(157,95,255,0.08)', background: 'rgba(2,2,13,0.5)' }} role="contentinfo">
          <div className="max-w-7xl mx-auto px-5 sm:px-8 py-14">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-6">
              {/* Brand column */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-2 mb-4 lg:mb-0">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #f0b840, #9d5fff)' }}
                  >
                    <Shield className="w-4 h-4" style={{ color: '#02020d' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#e0d6f6' }}>SpectraPRO</p>
                    <p className="text-[9px] font-mono" style={{ color: '#6b5f8a' }}>Offensive Security Command</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed mb-5 max-w-xs" style={{ color: '#8878a9' }}>
                  AI-powered vulnerability management for security teams that demand speed and precision.
                </p>
                <div className="flex items-center gap-3">
                  {[
                    { icon: Github, label: 'GitHub' },
                    { icon: Twitter, label: 'Twitter' },
                    { icon: Linkedin, label: 'LinkedIn' },
                  ].map((social) => (
                    <a
                      key={social.label}
                      href="#"
                      aria-label={social.label}
                      className="h-9 w-9 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
                      style={{ border: '1px solid rgba(157,95,255,0.12)' }}
                    >
                      <social.icon className="w-4 h-4" style={{ color: '#8878a9' }} />
                    </a>
                  ))}
                </div>
              </div>

              {/* Link columns */}
              {Object.entries(footerLinks).map(([title, links]) => (
                <div key={title}>
                  <p className="text-[10px] uppercase tracking-[0.12em] font-mono font-semibold mb-4" style={{ color: '#f0b840' }}>
                    {title}
                  </p>
                  <ul className="space-y-2.5">
                    {links.map((link) => (
                      <li key={link}>
                        <a
                          href="#"
                          className="text-sm transition-colors hover:text-gold"
                          style={{ color: '#8878a9' }}
                        >
                          {link}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Bottom bar */}
            <div
              className="mt-12 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4"
              style={{ borderColor: 'rgba(157,95,255,0.08)' }}
            >
              <p className="text-xs font-mono" style={{ color: '#6b5f8a' }}>
                &copy; {new Date().getFullYear()} SpectraPRO. All rights reserved.
              </p>
              <div className="flex items-center gap-4 text-xs" style={{ color: '#6b5f8a' }}>
                <a href="#" className="hover:text-gold transition-colors">Privacy</a>
                <span>·</span>
                <a href="#" className="hover:text-gold transition-colors">Terms</a>
                <span>·</span>
                <a href="#" className="hover:text-gold transition-colors">Security</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   Sub-components
   ───────────────────────────────────────────── */
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
