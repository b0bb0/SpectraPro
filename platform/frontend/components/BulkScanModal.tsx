'use client'

import { useState } from 'react'
import { X, Layers, Zap, Shield, Flame, Check, Loader2, AlertCircle, Upload, FileText } from 'lucide-react'
import { scansAPI } from '@/lib/api'

interface BulkScanModalProps {
  isOpen: boolean
  onClose: () => void
  onScanStarted?: (batchId: string) => void
}

type ScanLevel = 'light' | 'normal' | 'extreme'

interface ScanLevelOption {
  id: ScanLevel
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  duration: string
  concurrency: string
}

const scanLevels: ScanLevelOption[] = [
  {
    id: 'light',
    name: 'Fast Scan',
    description: 'Quick assessment across all targets',
    icon: Zap,
    color: 'blue',
    duration: '~45 sec per target',
    concurrency: 'Recommended: 5-10 concurrent',
  },
  {
    id: 'normal',
    name: 'Balanced Scan',
    description: 'Comprehensive analysis (Recommended)',
    icon: Shield,
    color: 'purple',
    duration: '~75 sec per target',
    concurrency: 'Recommended: 3-5 concurrent',
  },
  {
    id: 'extreme',
    name: 'Deep Scan',
    description: 'Exhaustive security analysis',
    icon: Flame,
    color: 'orange',
    duration: '~4 min per target',
    concurrency: 'Recommended: 1-3 concurrent',
  },
]

export default function BulkScanModal({ isOpen, onClose, onScanStarted }: BulkScanModalProps) {
  const [targets, setTargets] = useState('')
  const [selectedLevel, setSelectedLevel] = useState<ScanLevel>('normal')
  const [maxConcurrent, setMaxConcurrent] = useState(3)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  if (!isOpen) return null

  // Parse targets from textarea
  const parseTargets = (text: string): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'))
  }

  const targetList = parseTargets(targets)
  const targetCount = targetList.length

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // Validate targets
      if (targetCount === 0) {
        throw new Error('Please enter at least one target URL')
      }

      if (targetCount > 50) {
        throw new Error('Maximum 50 targets allowed per batch scan')
      }

      // Start bulk scan
      const result = await scansAPI.bulkScan({
        targets: targetList,
        scanLevel: selectedLevel,
        maxConcurrent,
      })

      setSuccess(true)
      setTimeout(() => {
        onScanStarted?.(result.batchId)
        handleClose()
      }, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to start bulk scan')
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setTargets('')
    setSelectedLevel('normal')
    setMaxConcurrent(3)
    setError('')
    setSuccess(false)
    setIsLoading(false)
    onClose()
  }

  const estimatedTime = () => {
    const selected = scanLevels.find(l => l.id === selectedLevel)
    if (!selected) return ''

    const avgSeconds = selectedLevel === 'light' ? 45 : selectedLevel === 'normal' ? 75 : 240
    const totalSeconds = Math.ceil((targetCount * avgSeconds) / maxConcurrent)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    if (minutes > 0) {
      return `~${minutes}m ${seconds}s`
    }
    return `~${seconds}s`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="glass rounded-2xl p-8 shadow-card animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-premium rounded-lg flex items-center justify-center shadow-glow-sm">
                <Layers className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-text-primary">Bulk Scan</h2>
                <p className="text-sm text-text-secondary">
                  Scan multiple targets in parallel
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

          {/* Success State */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center space-x-3 animate-fade-in">
              <Check className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-green-400 font-semibold">Bulk scan initiated successfully!</p>
                <p className="text-sm text-green-400/70">
                  {targetCount} targets are being scanned in the background
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <div>
                <p className="text-red-400 font-semibold">Error</p>
                <p className="text-sm text-red-400/70">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Targets Input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-text-primary">
                  Target URLs
                </label>
                <div className="flex items-center space-x-4 text-xs text-text-muted">
                  <span className={targetCount > 0 ? 'text-primary font-semibold' : ''}>
                    {targetCount} {targetCount === 1 ? 'target' : 'targets'}
                  </span>
                  {targetCount > 50 && (
                    <span className="text-red-400 font-semibold">
                      Max 50 targets
                    </span>
                  )}
                </div>
              </div>
              <textarea
                value={targets}
                onChange={(e) => setTargets(e.target.value)}
                placeholder="Enter target URLs (one per line)&#10;&#10;https://example.com&#10;https://test.example.com&#10;https://staging.example.com&#10;&#10;# Lines starting with # are comments"
                rows={10}
                disabled={isLoading}
                className="w-full input-field font-mono text-sm resize-none"
              />
              <p className="text-xs text-text-muted mt-1">
                <FileText className="w-3 h-3 inline mr-1" />
                Enter one URL per line. Lines starting with # are ignored.
              </p>
            </div>

            {/* Scan Level Selection */}
            <div>
              <label className="text-sm font-semibold text-text-primary mb-3 block">
                Scan Level
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {scanLevels.map((level) => {
                  const Icon = level.icon
                  const isSelected = selectedLevel === level.id

                  return (
                    <button
                      key={level.id}
                      type="button"
                      onClick={() => setSelectedLevel(level.id)}
                      disabled={isLoading}
                      className={`
                        relative p-4 rounded-lg border-2 transition-all text-left
                        ${isSelected
                          ? 'border-primary bg-primary/5 shadow-glow-sm'
                          : 'border-border/50 hover:border-border glass-hover'
                        }
                        ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                      <div className="flex items-start space-x-3">
                        <div className={`
                          w-10 h-10 rounded-lg flex items-center justify-center
                          ${isSelected ? 'bg-gradient-premium' : 'bg-background-elevated'}
                        `}>
                          <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-text-muted'}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <h3 className="font-semibold text-text-primary">{level.name}</h3>
                            {isSelected && (
                              <Check className="w-4 h-4 text-primary" />
                            )}
                          </div>
                          <p className="text-xs text-text-secondary mt-1">{level.description}</p>
                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-text-muted">{level.duration}</p>
                            <p className="text-xs text-text-muted">{level.concurrency}</p>
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Concurrency Control */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-text-primary">
                  Concurrent Scans
                </label>
                <span className="text-sm font-mono text-primary font-semibold">
                  {maxConcurrent}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(parseInt(e.target.value))}
                disabled={isLoading}
                className="w-full h-2 bg-background-elevated rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-xs text-text-muted mt-2">
                <span>1 (Slow)</span>
                <span>5 (Balanced)</span>
                <span>10 (Fast)</span>
              </div>
              <p className="text-xs text-text-muted mt-2">
                Higher concurrency = faster completion but more server resources
              </p>
            </div>

            {/* Estimated Time */}
            {targetCount > 0 && (
              <div className="glass-panel p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-text-primary mb-1">
                      Estimated Completion Time
                    </h4>
                    <p className="text-xs text-text-muted">
                      Based on {targetCount} {targetCount === 1 ? 'target' : 'targets'} with {maxConcurrent} concurrent {maxConcurrent === 1 ? 'scan' : 'scans'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">{estimatedTime()}</p>
                    <p className="text-xs text-text-muted">approximate</p>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-border/50">
              <button
                type="button"
                onClick={handleClose}
                disabled={isLoading}
                className="px-6 py-2.5 rounded-lg font-semibold text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || targetCount === 0 || targetCount > 50}
                className="btn-premium px-8 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Starting Scans...</span>
                  </>
                ) : (
                  <>
                    <Layers className="w-5 h-5" />
                    <span>Start Bulk Scan</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Info Note */}
          <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-400/90">
                <p className="font-semibold mb-1">Bulk Scan Notes</p>
                <ul className="space-y-1 text-xs text-blue-400/70">
                  <li>• Scans run asynchronously in the background</li>
                  <li>• Individual reports generated for each target</li>
                  <li>• Failed scans don't stop the batch</li>
                  <li>• View results in the Scans list</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
