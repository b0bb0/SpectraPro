'use client'

import { useState, useEffect } from 'react'
import { GitBranch, Radio, AlertTriangle, Target, TrendingUp, ChevronRight, Calendar, Loader2 } from 'lucide-react'

interface AttackChainStep {
  id: string
  attackChainId: string
  stepType: 'RECON' | 'VULN_DISCOVERY' | 'EXPLOITATION' | 'IMPACT_ASSESSMENT'
  stepData: any
  timestamp: string
}

interface AttackChain {
  id: string
  scanId: string
  reconSessionId: string | null
  vulnerabilityIds: string[]
  exploitAttemptIds: string[]
  impactSummary: string | null
  createdAt: string
  steps: AttackChainStep[]
}

interface AttackChainGraphProps {
  attackChainId: string
  onClose?: () => void
}

const getStepIcon = (stepType: string) => {
  switch (stepType) {
    case 'RECON':
      return Radio
    case 'VULN_DISCOVERY':
      return AlertTriangle
    case 'EXPLOITATION':
      return Target
    case 'IMPACT_ASSESSMENT':
      return TrendingUp
    default:
      return GitBranch
  }
}

const getStepColor = (stepType: string) => {
  switch (stepType) {
    case 'RECON':
      return 'bg-blue-100 text-blue-600 border-blue-300'
    case 'VULN_DISCOVERY':
      return 'bg-yellow-100 text-yellow-600 border-yellow-300'
    case 'EXPLOITATION':
      return 'bg-red-100 text-red-600 border-red-300'
    case 'IMPACT_ASSESSMENT':
      return 'bg-purple-100 text-purple-600 border-purple-300'
    default:
      return 'bg-gray-100 text-gray-600 border-gray-300'
  }
}

const getStepLabel = (stepType: string) => {
  switch (stepType) {
    case 'RECON':
      return 'Reconnaissance'
    case 'VULN_DISCOVERY':
      return 'Vulnerability Discovery'
    case 'EXPLOITATION':
      return 'Exploitation'
    case 'IMPACT_ASSESSMENT':
      return 'Impact Assessment'
    default:
      return stepType
  }
}

export default function AttackChainGraph({ attackChainId, onClose }: AttackChainGraphProps) {
  const [chain, setChain] = useState<AttackChain | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'graph' | 'timeline'>('graph')
  const [selectedStep, setSelectedStep] = useState<AttackChainStep | null>(null)

  useEffect(() => {
    fetchChain()
  }, [attackChainId])

  const fetchChain = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/attack-chain/${attackChainId}`,
        { credentials: 'include' }
      )
      const result = await response.json()
      if (result.success) {
        setChain(result.data)
      }
    } catch (error) {
      console.error('Failed to fetch attack chain:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (!chain) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <AlertTriangle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Attack Chain Not Found</h3>
        <p className="text-gray-500">The requested attack chain could not be loaded.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <GitBranch className="h-6 w-6 text-gray-600" />
              <h2 className="text-2xl font-bold text-gray-900">Attack Chain Analysis</h2>
            </div>
            <p className="text-sm text-gray-600">
              Created {new Date(chain.createdAt).toLocaleString()}
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          )}
        </div>

        {chain.impactSummary && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-purple-900 mb-2">Impact Summary</h3>
            <p className="text-sm text-purple-800">{chain.impactSummary}</p>
          </div>
        )}
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center space-x-2 bg-white rounded-lg border border-gray-200 p-2">
        <button
          onClick={() => setViewMode('graph')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'graph'
              ? 'bg-blue-600 text-white'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Graph View
        </button>
        <button
          onClick={() => setViewMode('timeline')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'timeline'
              ? 'bg-blue-600 text-white'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Timeline View
        </button>
      </div>

      {/* Graph View */}
      {viewMode === 'graph' && (
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="flex items-center justify-center space-x-4 overflow-x-auto">
            {chain.steps.map((step, index) => {
              const Icon = getStepIcon(step.stepType)
              const colorClass = getStepColor(step.stepType)

              return (
                <div key={step.id} className="flex items-center">
                  <button
                    onClick={() => setSelectedStep(step)}
                    className={`flex flex-col items-center p-6 border-2 rounded-lg hover:shadow-lg transition-shadow ${colorClass}`}
                  >
                    <Icon className="h-8 w-8 mb-3" />
                    <span className="text-sm font-semibold text-center">
                      {getStepLabel(step.stepType)}
                    </span>
                    <span className="text-xs mt-2 opacity-75">
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </span>
                  </button>

                  {index < chain.steps.length - 1 && (
                    <ChevronRight className="h-6 w-6 text-gray-400 mx-2" />
                  )}
                </div>
              )
            })}
          </div>

          {chain.steps.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No steps in this attack chain yet
            </div>
          )}
        </div>
      )}

      {/* Timeline View */}
      {viewMode === 'timeline' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="space-y-4">
            {chain.steps.map((step, index) => {
              const Icon = getStepIcon(step.stepType)
              const colorClass = getStepColor(step.stepType)

              return (
                <div key={step.id} className="flex items-start space-x-4">
                  <div className="flex-shrink-0 relative">
                    <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${colorClass}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    {index < chain.steps.length - 1 && (
                      <div className="absolute top-12 left-6 w-0.5 h-8 bg-gray-300" />
                    )}
                  </div>

                  <button
                    onClick={() => setSelectedStep(step)}
                    className="flex-1 text-left bg-gray-50 hover:bg-gray-100 rounded-lg p-4 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {getStepLabel(step.stepType)}
                      </h3>
                      <span className="text-sm text-gray-500">
                        {new Date(step.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <pre className="text-xs text-gray-600 bg-white p-2 rounded overflow-x-auto">
                      {JSON.stringify(step.stepData, null, 2)}
                    </pre>
                  </button>
                </div>
              )
            })}

            {chain.steps.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p>No timeline events to display</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step Details Modal */}
      {selectedStep && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">
                  {getStepLabel(selectedStep.stepType)} Details
                </h3>
                <button
                  onClick={() => setSelectedStep(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Timestamp</div>
                <div className="text-gray-900">{new Date(selectedStep.timestamp).toLocaleString()}</div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-2">Step Data</div>
                <pre className="text-xs text-gray-900 overflow-x-auto">
                  {JSON.stringify(selectedStep.stepData, null, 2)}
                </pre>
              </div>

              <button
                onClick={() => setSelectedStep(null)}
                className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Attack Chain Statistics</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{chain.steps.length}</div>
            <div className="text-sm text-gray-500">Total Steps</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {chain.steps.filter(s => s.stepType === 'RECON').length}
            </div>
            <div className="text-sm text-gray-500">Recon</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {chain.steps.filter(s => s.stepType === 'VULN_DISCOVERY').length}
            </div>
            <div className="text-sm text-gray-500">Vulnerabilities</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {chain.steps.filter(s => s.stepType === 'EXPLOITATION').length}
            </div>
            <div className="text-sm text-gray-500">Exploits</div>
          </div>
        </div>
      </div>
    </div>
  )
}
