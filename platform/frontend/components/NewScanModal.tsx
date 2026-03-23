'use client'

import { useState } from 'react'
import { X, Target, Zap, Shield, Flame, Check, Loader2, AlertCircle } from 'lucide-react'
import { scansAPI } from '@/lib/api'

interface NewScanModalProps {
  isOpen: boolean
  onClose: () => void
  onScanStarted?: (scanId: string) => void
}

type ScanLevel = 'light' | 'normal' | 'extreme'
type ScanProfile = 'FAST' | 'BALANCED' | 'DEEP'

interface ScanLevelOption {
  id: ScanLevel
  profile: ScanProfile
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  features: string[]
  duration: string
}

const scanLevels: ScanLevelOption[] = [
  {
    id: 'light',
    profile: 'FAST',
    name: 'Fast Scan',
    description: 'Rapid assessment of critical exposures',
    icon: Zap,
    color: 'blue',
    duration: '~45 seconds',
    features: [
      'Critical & High vulnerabilities only',
      'Ultra-fast execution',
      'Essential security checks',
      'Perfect for continuous monitoring',
    ],
  },
  {
    id: 'normal',
    profile: 'BALANCED',
    name: 'Balanced Scan',
    description: 'Comprehensive security assessment (Recommended)',
    icon: Shield,
    color: 'purple',
    duration: '~75 seconds',
    features: [
      'Context-driven template selection',
      'All severity levels',
      'Intelligent targeting',
      'Best for regular security scans',
    ],
  },
  {
    id: 'extreme',
    profile: 'DEEP',
    name: 'Deep Scan',
    description: 'Exhaustive security analysis',
    icon: Flame,
    color: 'orange',
    duration: '~4 minutes',
    features: [
      'Complete vulnerability coverage',
      'Fuzzing & headless checks',
      'Maximum thoroughness',
      'Ideal for critical assets',
    ],
  },
]

export default function NewScanModal({ isOpen, onClose, onScanStarted }: NewScanModalProps) {
  const [target, setTarget] = useState('')
  const [selectedLevel, setSelectedLevel] = useState<ScanLevel>('normal')
  const [deepScanAuthorized, setDeepScanAuthorized] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // Validate target
      if (!target.trim()) {
        throw new Error('Please enter a target URL, domain, or IP address')
      }

      // Get selected profile
      const selectedProfile = scanLevels.find(l => l.id === selectedLevel)?.profile || 'BALANCED'

      // Start scan with enterprise orchestration
      const result = await scansAPI.start({
        target: target.trim(),
        scanLevel: selectedLevel,
      } as any)

      setSuccess(true)
      setTimeout(() => {
        onScanStarted?.(result.scanId)
        handleClose()
      }, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to start scan')
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setTarget('')
    setSelectedLevel('normal')
    setDeepScanAuthorized(false)
    setError('')
    setSuccess(false)
    setIsLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="glass rounded-2xl p-8 shadow-card animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-premium rounded-lg flex items-center justify-center shadow-glow-sm">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-text-primary">New Scan</h2>
                <p className="text-sm text-text-secondary">
                  Configure and launch a vulnerability scan
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Success Message */}
            {success && (
              <div className="flex items-start space-x-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400">
                <Check className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Scan started successfully!</p>
                  <p className="text-sm text-green-400/80 mt-1">
                    Your scan is now running in the background.
                  </p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex items-start space-x-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Target Input */}
            <div className="space-y-2">
              <label htmlFor="target" className="block text-sm font-medium text-text-primary">
                Target
              </label>
              <input
                id="target"
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="https://example.com or 192.168.1.1"
                className="block w-full px-4 py-3 bg-background-elevated border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                disabled={isLoading || success}
                required
              />
              <p className="text-xs text-text-muted">
                Enter a URL, domain name, or IP address to scan
              </p>
            </div>

            {/* Scan Profile Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-text-primary">
                Scan Profile
              </label>
              <p className="text-xs text-text-muted -mt-1 mb-2">
                Enterprise-grade multi-phase scanning with intelligent targeting
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {scanLevels.map((level) => {
                  const isSelected = selectedLevel === level.id
                  const Icon = level.icon
                  return (
                    <button
                      key={level.id}
                      type="button"
                      onClick={() => setSelectedLevel(level.id)}
                      disabled={isLoading || success}
                      className={`
                        relative p-4 rounded-lg border-2 transition-all text-left
                        ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50 bg-background-elevated'
                        }
                        ${isLoading || success ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                      {/* Selection Indicator */}
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}

                      {/* Icon */}
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                          isSelected ? 'bg-gradient-premium shadow-glow-sm' : `bg-${level.color}-500/10`
                        }`}
                      >
                        <Icon
                          className={`w-5 h-5 ${
                            isSelected ? 'text-white' : `text-${level.color}-400`
                          }`}
                        />
                      </div>

                      {/* Title */}
                      <h3 className="text-base font-semibold text-text-primary mb-1">
                        {level.name}
                      </h3>

                      {/* Duration Badge */}
                      <div className="inline-flex items-center px-2 py-1 bg-primary/10 rounded text-xs text-primary font-medium mb-2">
                        {level.duration}
                      </div>

                      {/* Description */}
                      <p className="text-xs text-text-secondary mb-3">
                        {level.description}
                      </p>

                      {/* Features */}
                      <ul className="space-y-1">
                        {level.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start space-x-2 text-xs text-text-muted">
                            <span className="text-primary mt-0.5">•</span>
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Deep Scan Authorization (only show for DEEP profile) */}
            {selectedLevel === 'extreme' && (
              <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                <div className="flex items-start space-x-3">
                  <div className="flex items-center h-5">
                    <input
                      id="deep-scan-auth"
                      type="checkbox"
                      checked={deepScanAuthorized}
                      onChange={(e) => setDeepScanAuthorized(e.target.checked)}
                      disabled={isLoading || success}
                      className="w-4 h-4 text-orange-500 bg-background-elevated border-border rounded focus:ring-orange-500/50 focus:ring-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor="deep-scan-auth" className="block text-sm font-medium text-orange-400 cursor-pointer">
                      Authorize Deep Scan (Aggressive Testing)
                    </label>
                    <p className="text-xs text-text-secondary mt-1">
                      Deep scans include aggressive security tests that may trigger security alerts, rate limits, or temporarily disrupt services.
                      Only enable for assets you own and control. Required to execute Phase 3 (Deep Scan).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-border/50">
              <button
                type="button"
                onClick={handleClose}
                disabled={isLoading || success}
                className="px-6 py-2.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-background/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || success}
                className="btn-premium px-6 py-2.5 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Starting Scan...</span>
                  </>
                ) : success ? (
                  <>
                    <Check className="w-5 h-5" />
                    <span>Scan Started!</span>
                  </>
                ) : (
                  <>
                    <Target className="w-5 h-5" />
                    <span>Start Scan</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
