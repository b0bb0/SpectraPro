'use client'

import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, Clock, XCircle, ChevronDown, ChevronRight, Shield } from 'lucide-react'

interface ReconSession {
  id: string
  scanId: string
  assetId: string
  status: string
  passiveStatus: string
  activeStatus: string
  contentStatus: string
  techStackStatus: string
  startedAt: string | null
  completedAt: string | null
  duration: number | null
}

interface ReconFinding {
  id: string
  reconSessionId: string
  stage: 'PASSIVE' | 'ACTIVE' | 'CONTENT_DISCOVERY' | 'TECH_STACK'
  findingType: string
  confidence: number
  source: string
  data: any
  timestamp: string
}

interface ReconDashboardProps {
  sessionId: string
  onClose?: () => void
}

const stageNames = {
  PASSIVE: 'Passive Recon',
  ACTIVE: 'Active Recon',
  CONTENT_DISCOVERY: 'Content Discovery',
  TECH_STACK: 'Tech Stack',
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'DONE':
      return 'text-green-500'
    case 'RUNNING':
      return 'text-blue-500'
    case 'FAILED':
      return 'text-red-500'
    default:
      return 'text-gray-400'
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'DONE':
      return CheckCircle2
    case 'RUNNING':
      return Activity
    case 'FAILED':
      return XCircle
    default:
      return Clock
  }
}

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 0.8) return 'bg-green-500'
  if (confidence >= 0.5) return 'bg-yellow-500'
  return 'bg-red-500'
}

const getConfidenceLabel = (confidence: number) => {
  if (confidence >= 0.8) return 'High'
  if (confidence >= 0.5) return 'Medium'
  return 'Low'
}

export default function ReconDashboard({ sessionId, onClose }: ReconDashboardProps) {
  const [session, setSession] = useState<ReconSession | null>(null)
  const [findings, setFindings] = useState<ReconFinding[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
  const [selectedStage, setSelectedStage] = useState<string | null>(null)

  useEffect(() => {
    fetchSession()
    fetchFindings()
    // Poll for updates every 3 seconds
    const interval = setInterval(() => {
      if (session?.status !== 'COMPLETED') {
        fetchSession()
        fetchFindings()
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [sessionId])

  const fetchSession = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/recon/${sessionId}`, {
        credentials: 'include',
      })
      const result = await response.json()
      if (result.success) {
        setSession(result.data)
      }
    } catch (error) {
      console.error('Failed to fetch recon session:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchFindings = async (stage?: string) => {
    try {
      const url = stage
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/recon/${sessionId}/findings?stage=${stage}`
        : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/recon/${sessionId}/findings`
      const response = await fetch(url, {
        credentials: 'include',
      })
      const result = await response.json()
      if (result.success) {
        setFindings(result.data.findings)
      }
    } catch (error) {
      console.error('Failed to fetch recon findings:', error)
    }
  }

  const toggleStage = (stage: string) => {
    const newExpanded = new Set(expandedStages)
    if (newExpanded.has(stage)) {
      newExpanded.delete(stage)
    } else {
      newExpanded.add(stage)
    }
    setExpandedStages(newExpanded)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Activity className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="p-6 text-center text-gray-500">
        Reconnaissance session not found
      </div>
    )
  }

  const stages = [
    { key: 'PASSIVE', status: session.passiveStatus },
    { key: 'ACTIVE', status: session.activeStatus },
    { key: 'CONTENT_DISCOVERY', status: session.contentStatus },
    { key: 'TECH_STACK', status: session.techStackStatus },
  ]

  const completedStages = stages.filter(s => s.status === 'DONE').length
  const progress = (completedStages / stages.length) * 100

  const findingsByStage = findings.reduce((acc, finding) => {
    if (!acc[finding.stage]) {
      acc[finding.stage] = []
    }
    acc[finding.stage].push(finding)
    return acc
  }, {} as Record<string, ReconFinding[]>)

  const highConfidenceCount = findings.filter(f => f.confidence >= 0.8).length
  const mediumConfidenceCount = findings.filter(f => f.confidence >= 0.5 && f.confidence < 0.8).length
  const lowConfidenceCount = findings.filter(f => f.confidence < 0.5).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="h-6 w-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-gray-900">Reconnaissance Pipeline</h2>
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

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Overall Progress</span>
          <span className="font-medium text-gray-900">{Math.round(progress)}% Complete</span>
        </div>
        <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stage Progress */}
      <div className="grid grid-cols-4 gap-4">
        {stages.map(({ key, status }) => {
          const StatusIcon = getStatusIcon(status)
          const statusColor = getStatusColor(status)
          return (
            <div
              key={key}
              className="bg-white rounded-lg border border-gray-200 p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {stageNames[key as keyof typeof stageNames]}
                </span>
                <StatusIcon className={`h-5 w-5 ${statusColor}`} />
              </div>
              <div className="text-xs text-gray-500 capitalize">{status.toLowerCase()}</div>
            </div>
          )
        })}
      </div>

      {/* Findings Summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Findings: {findings.length} total</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${getConfidenceColor(0.9)}`} />
            <span className="text-sm text-gray-600">High Confidence: {highConfidenceCount}</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${getConfidenceColor(0.6)}`} />
            <span className="text-sm text-gray-600">Medium: {mediumConfidenceCount}</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${getConfidenceColor(0.3)}`} />
            <span className="text-sm text-gray-600">Low: {lowConfidenceCount}</span>
          </div>
        </div>
      </div>

      {/* Findings by Stage */}
      <div className="space-y-4">
        {stages.map(({ key }) => {
          const stageFindings = findingsByStage[key] || []
          const isExpanded = expandedStages.has(key)

          return (
            <div key={key} className="bg-white rounded-lg border border-gray-200">
              <button
                onClick={() => toggleStage(key)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
              >
                <div className="flex items-center space-x-3">
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                  <span className="font-medium text-gray-900">
                    {stageNames[key as keyof typeof stageNames]}
                  </span>
                  <span className="text-sm text-gray-500">
                    ({stageFindings.length} findings)
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-200 p-4 space-y-3">
                  {stageFindings.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No findings yet for this stage
                    </p>
                  ) : (
                    stageFindings.map((finding) => (
                      <div
                        key={finding.id}
                        className="bg-gray-50 rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900">
                            {finding.findingType}
                          </span>
                          <div className="flex items-center space-x-2">
                            <span
                              className={`text-xs px-2 py-1 rounded-full text-white ${getConfidenceColor(
                                finding.confidence
                              )}`}
                            >
                              {getConfidenceLabel(finding.confidence)}
                            </span>
                            <span className="text-xs text-gray-500">
                              {finding.source}
                            </span>
                          </div>
                        </div>
                        <pre className="text-xs text-gray-600 overflow-x-auto">
                          {JSON.stringify(finding.data, null, 2)}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
