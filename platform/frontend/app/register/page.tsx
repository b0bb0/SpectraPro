'use client'

import { useState, FormEvent, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shield, Mail, Lock, AlertCircle, Loader2, User, Building2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import StarCanvas from '@/components/StarCanvas'

interface ParticleStyle {
  background: string;
  left: string;
  top: string;
  animation: string;
  animationDelay: string;
}

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [particles, setParticles] = useState<ParticleStyle[]>([])
  const { register } = useAuth()
  const router = useRouter()

  // Generate particles only on client side
  useEffect(() => {
    const generatedParticles = Array.from({ length: 10 }).map(() => ({
      background: 'rgba(240,184,64,0.15)',
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      animation: `drift ${5 + Math.random() * 10}s ease-in-out infinite`,
      animationDelay: `${Math.random() * 5}s`,
    }));
    setParticles(generatedParticles);
    setMounted(true);
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    // Validation
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    setIsLoading(true)

    try {
      await register({
        email,
        password,
        firstName,
        lastName,
        tenantName,
      })
      // AuthContext will handle redirect to /dashboard
    } catch (err: any) {
      setError(err.message || 'Registration failed')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center" style={{ background: '#02020d' }}>
      {/* Cosmic background */}
      <StarCanvas />
      <div className="aurora-1" />
      <div className="aurora-2" />
      {/* Placeholder to keep structure */}
      {mounted && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {particles.map((particle, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full"
              style={particle}
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-6 py-8">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in">
          <Link href="/" className="inline-flex items-center space-x-3 mb-2">
            <div className="w-12 h-12 bg-gradient-premium rounded-lg flex items-center justify-center shadow-glow-sm">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <span className="text-3xl font-bold gradient-text">SpectraPRO</span>
          </Link>
          <p className="text-text-secondary mt-2">
            Create your account
          </p>
        </div>

        {/* Register Card */}
        <div className="glass p-8 rounded-2xl shadow-card animate-scale-in">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error Message */}
            {error && (
              <div className="flex items-start space-x-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="firstName" className="block text-sm font-medium text-text-primary">
                  First Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-text-muted" />
                  </div>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    autoComplete="given-name"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="input-field pl-12"
                    placeholder="John"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="lastName" className="block text-sm font-medium text-text-primary">
                  Last Name
                </label>
                <div className="relative">
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    autoComplete="family-name"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="input-field"
                    placeholder="Doe"
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-text-primary">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-text-muted" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-12"
                  placeholder="john@example.com"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Organization Name */}
            <div className="space-y-2">
              <label htmlFor="tenantName" className="block text-sm font-medium text-text-primary">
                Organization Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Building2 className="h-5 w-5 text-text-muted" />
                </div>
                <input
                  id="tenantName"
                  name="tenantName"
                  type="text"
                  autoComplete="organization"
                  required
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  className="input-field pl-12"
                  placeholder="Acme Corp"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-text-primary">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-text-muted" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-12"
                  placeholder="••••••••"
                  disabled={isLoading}
                />
              </div>
              <p className="text-xs text-text-muted">
                Must be at least 8 characters long
              </p>
            </div>

            {/* Confirm Password Field */}
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-primary">
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-text-muted" />
                </div>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field pl-12"
                  placeholder="••••••••"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-premium py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <span>Create Account</span>
              )}
            </button>
          </form>

          {/* Sign In Link */}
          <div className="mt-6 text-center text-sm text-text-secondary">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:text-primary/80 font-semibold transition-colors">
              Sign in
            </Link>
          </div>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-text-muted hover:text-text-primary transition-colors inline-flex items-center space-x-1"
          >
            <span>← Back to home</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
