'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { Shield, Mail, Lock, AlertCircle, Loader2, Sparkles } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import StarCanvas from '@/components/StarCanvas'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await login(email, password)
    } catch (err: any) {
      setError(err.message || 'Invalid email or password')
      setIsLoading(false)
    }
  }

  return (
    <main
      className="min-h-screen relative overflow-hidden flex items-center justify-center"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Cosmic background */}
      <StarCanvas />
      <div className="aurora-1" />
      <div className="aurora-2" />
      <div className="aurora-3" />
      <div className="shoot" />
      <div className="shoot" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-6 py-12">

        {/* Logo lockup — matches landing page header */}
        <div className="text-center mb-8" style={{ animation: 'rise 0.4s ease-out both' }}>
          <Link href="/" className="inline-flex items-center gap-3 mb-3">
            <div
              className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #f0b840, #9d5fff)',
                boxShadow: '0 0 20px rgba(240, 184, 64, 0.3)',
              }}
            >
              <Shield className="w-5 h-5" style={{ color: '#02020d' }} />
            </div>
            <div className="text-left">
              <p className="text-lg font-semibold leading-none" style={{ color: '#e0d6f6' }}>SpectraPRO</p>
              <p className="text-[10px] font-mono mt-0.5" style={{ color: '#8878a9' }}>Offensive Security Command</p>
            </div>
          </Link>

          {/* Badge — matches landing page pill style */}
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] tracking-[0.15em] uppercase font-mono mt-2"
            style={{
              background: 'rgba(240,184,64,0.08)',
              border: '1px solid rgba(240,184,64,0.2)',
              color: '#f0b840',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Secure Access
          </div>
        </div>

        {/* Login Card — cosmic-panel style */}
        <div
          className="cosmic-panel p-8 relative overflow-hidden"
          style={{ animation: 'rise 0.5s ease-out both' }}
        >
          {/* Glow accent — matches landing hero card */}
          <div
            className="absolute -right-16 -top-16 w-64 h-64 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(240,184,64,0.1), transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
          <div
            className="absolute -left-10 bottom-[-40px] w-48 h-48 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(157,95,255,0.08), transparent 70%)',
              filter: 'blur(50px)',
            }}
          />

          <div className="relative">
            {/* Section label */}
            <p
              className="text-[10px] uppercase tracking-[0.12em] font-mono mb-1"
              style={{ color: '#f0b840' }}
            >
              Authentication
            </p>
            <h1
              className="text-xl font-semibold mb-6"
              style={{ color: '#e0d6f6', fontSize: '1.2rem', lineHeight: '1.3' }}
            >
              Sign in to your account
            </h1>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Error Message */}
              {error && (
                <div
                  className="flex items-start gap-3 p-4 rounded-lg text-sm"
                  role="alert"
                  aria-live="polite"
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#fca5a5',
                  }}
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium"
                  style={{ color: '#e0d6f6' }}
                >
                  Email Address
                </label>
                <div className="relative">
                  <div
                    className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"
                    aria-hidden="true"
                  >
                    <Mail className="h-4 w-4" style={{ color: '#8878a9' }} />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field pl-11"
                    placeholder="admin@demo.com"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium"
                  style={{ color: '#e0d6f6' }}
                >
                  Password
                </label>
                <div className="relative">
                  <div
                    className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"
                    aria-hidden="true"
                  >
                    <Lock className="h-4 w-4" style={{ color: '#8878a9' }} />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pl-11"
                    placeholder="••••••••"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Remember & Forgot */}
              <div className="flex items-center justify-between text-sm">
                <label htmlFor="remember-me" className="flex items-center gap-2 cursor-pointer">
                  <input
                    id="remember-me"
                    type="checkbox"
                    className="w-4 h-4 rounded"
                    style={{
                      accentColor: '#f0b840',
                      background: 'rgba(14,14,58,0.4)',
                    }}
                  />
                  <span style={{ color: '#8878a9' }}>Remember me</span>
                </label>
                <a
                  href="#"
                  className="font-mono text-[11px] tracking-wide transition-colors"
                  style={{ color: '#f0b840' }}
                >
                  Forgot password?
                </a>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full btn-premium py-3 flex items-center justify-center gap-2"
                style={{ opacity: isLoading ? 0.7 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Authenticating…</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </form>

            {/* Demo Credentials */}
            {process.env.NODE_ENV === 'development' && (
              <div
                className="mt-5 p-4 rounded-xl"
                style={{
                  background: 'rgba(14,14,58,0.5)',
                  border: '1px solid rgba(240,184,64,0.12)',
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-[0.1em] font-mono mb-2"
                  style={{ color: '#f0b840' }}
                >
                  Demo Credentials
                </p>
                <div className="text-xs space-y-1 font-mono" style={{ color: '#8878a9' }}>
                  <p><span style={{ color: '#6b5f8a' }}>email</span>{'  '}admin@demo.com</p>
                  <p><span style={{ color: '#6b5f8a' }}>pass{'  '}</span>admin123</p>
                </div>
              </div>
            )}

            {/* Sign Up Link */}
            <div
              className="mt-6 text-center text-sm"
              style={{ color: '#8878a9' }}
            >
              Don't have an account?{' '}
              <Link
                href="/register"
                className="font-semibold transition-colors"
                style={{ color: '#9d5fff' }}
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>

        {/* Back to Home */}
        <div
          className="text-center mt-5"
          style={{ animation: 'rise 0.6s ease-out both' }}
        >
          <Link
            href="/"
            className="text-[11px] font-mono tracking-wide transition-colors inline-flex items-center gap-1"
            style={{ color: '#6b5f8a' }}
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  )
}
