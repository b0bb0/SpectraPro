'use client'

import { useState, useEffect } from 'react'
import { Clock, Search, AlertTriangle, Target, TrendingUp, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'

interface TimelineEvent {
  id: string
  assetId: string
  eventType: 'DISCOVERED' | 'VULNERABLE' | 'EXPLOITED' | 'RISK_CHANGED'
  eventDescription: string
  timestamp: string
}

interface Asset {
  id: string
  name: string
  url: string
  riskScore: number
}

interface AssetTimelineProps {
  assetId: string
  onClose?: () => void
}

const getEventIcon = (eventType: string) => {
  switch (eventType) {
    case 'DISCOVERED':
      return Search
    case 'VULNERABLE':
      return AlertTriangle
    case 'EXPLOITED':
      return Target
    case 'RISK_CHANGED':
      return TrendingUp
    default:
      return Clock
  }
}

const getEventColor = (eventType: string) => {
  switch (eventType) {
    case 'DISCOVERED':
      return 'bg-blue-100 text-blue-600 border-blue-300'
    case 'VULNERABLE':
      return 'bg-yellow-100 text-yellow-600 border-yellow-300'
    case 'EXPLOITED':
      return 'bg-red-100 text-red-600 border-red-300'
    case 'RISK_CHANGED':
      return 'bg-purple-100 text-purple-600 border-purple-300'
    default:
      return 'bg-gray-100 text-gray-600 border-gray-300'
  }
}

const getEventLabel = (eventType: string) => {
  switch (eventType) {
    case 'DISCOVERED':
      return 'First Discovered'
    case 'VULNERABLE':
      return 'First Vulnerable'
    case 'EXPLOITED':
      return 'Exploited'
    case 'RISK_CHANGED':
      return 'Risk Changed'
    default:
      return eventType
  }
}

export default function AssetTimeline({ assetId, onClose }: AssetTimelineProps) {
  const [asset, setAsset] = useState<Asset | null>(null)
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())
  const [riskHistory, setRiskHistory] = useState<Array<{ timestamp: string; score: number }>>([])

  useEffect(() => {
    fetchAsset()
    fetchEvents()
    fetchRiskHistory()
  }, [assetId])

  const fetchAsset = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/assets/${assetId}`,
        { credentials: 'include' }
      )
      const result = await response.json()
      if (result.success) {
        setAsset(result.data)
      }
    } catch (error) {
      console.error('Failed to fetch asset:', error)
    }
  }

  const fetchEvents = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/asset-timeline/${assetId}`,
        { credentials: 'include' }
      )
      const result = await response.json()
      if (result.success) {
        setEvents(result.data.events)
      }
    } catch (error) {
      console.error('Failed to fetch timeline events:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchRiskHistory = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/asset-timeline/${assetId}/risk-history`,
        { credentials: 'include' }
      )
      const result = await response.json()
      if (result.success) {
        setRiskHistory(result.data.history)
      }
    } catch (error) {
      console.error('Failed to fetch risk history:', error)
    }
  }

  const toggleEventExpanded = (eventId: string) => {
    const newExpanded = new Set(expandedEvents)
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId)
    } else {
      newExpanded.add(eventId)
    }
    setExpandedEvents(newExpanded)
  }

  const getRiskLevel = (score: number) => {
    if (score >= 75) return { label: 'Critical', color: 'text-red-600' }
    if (score >= 50) return { label: 'High', color: 'text-orange-600' }
    if (score >= 25) return { label: 'Medium', color: 'text-yellow-600' }
    return { label: 'Low', color: 'text-blue-600' }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {asset && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <Clock className="h-6 w-6 text-gray-600" />
                <h2 className="text-2xl font-bold text-gray-900">Asset Timeline</h2>
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">{asset.name}</h3>
              <p className="text-sm text-gray-600 mb-4">{asset.url}</p>
              <div className="flex items-center space-x-4">
                <div>
                  <span className="text-sm text-gray-500">Current Risk Score: </span>
                  <span className={`text-2xl font-bold ${getRiskLevel(asset.riskScore).color}`}>
                    {asset.riskScore}
                  </span>
                  <span className={`ml-2 text-sm ${getRiskLevel(asset.riskScore).color}`}>
                    ({getRiskLevel(asset.riskScore).label})
                  </span>
                </div>
              </div>
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
        </div>
      )}

      {/* Risk Trend Chart */}
      {riskHistory.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Risk Trend</h3>
          <div className="relative h-48">
            <svg className="w-full h-full">
              {/* Y-axis labels */}
              <text x="10" y="20" className="text-xs fill-gray-500">100</text>
              <text x="10" y="60" className="text-xs fill-gray-500">75</text>
              <text x="10" y="100" className="text-xs fill-gray-500">50</text>
              <text x="10" y="140" className="text-xs fill-gray-500">25</text>
              <text x="10" y="180" className="text-xs fill-gray-500">0</text>

              {/* Grid lines */}
              <line x1="40" y1="20" x2="100%" y2="20" stroke="#e5e7eb" strokeWidth="1" />
              <line x1="40" y1="60" x2="100%" y2="60" stroke="#e5e7eb" strokeWidth="1" />
              <line x1="40" y1="100" x2="100%" y2="100" stroke="#e5e7eb" strokeWidth="1" />
              <line x1="40" y1="140" x2="100%" y2="140" stroke="#e5e7eb" strokeWidth="1" />
              <line x1="40" y1="180" x2="100%" y2="180" stroke="#e5e7eb" strokeWidth="1" />

              {/* Risk trend line */}
              <polyline
                points={riskHistory.map((point, index) => {
                  const x = 40 + (index / (riskHistory.length - 1)) * (100 - 40)
                  const y = 180 - (point.score / 100) * 160
                  return `${x}%,${y}`
                }).join(' ')}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
              />

              {/* Data points */}
              {riskHistory.map((point, index) => {
                const x = 40 + (index / (riskHistory.length - 1)) * (100 - 40)
                const y = 180 - (point.score / 100) * 160
                return (
                  <circle
                    key={index}
                    cx={`${x}%`}
                    cy={y}
                    r="4"
                    fill="#3b82f6"
                    className="hover:r-6 cursor-pointer"
                  >
                    <title>{`${new Date(point.timestamp).toLocaleString()}: ${point.score}`}</title>
                  </circle>
                )
              })}
            </svg>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
            <span>{new Date(riskHistory[0].timestamp).toLocaleDateString()}</span>
            <span>{new Date(riskHistory[riskHistory.length - 1].timestamp).toLocaleDateString()}</span>
          </div>
        </div>
      )}

      {/* Timeline Events */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Event Timeline</h3>

        {events.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Clock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p>No timeline events to display</p>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event, index) => {
              const Icon = getEventIcon(event.eventType)
              const colorClass = getEventColor(event.eventType)
              const isExpanded = expandedEvents.has(event.id)
              const eventData = JSON.parse(event.eventDescription)

              return (
                <div key={event.id} className="flex items-start space-x-4">
                  <div className="flex-shrink-0 relative">
                    <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${colorClass}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    {index < events.length - 1 && (
                      <div className="absolute top-12 left-6 w-0.5 h-full bg-gray-300" />
                    )}
                  </div>

                  <div className="flex-1">
                    <button
                      onClick={() => toggleEventExpanded(event.id)}
                      className="w-full text-left bg-gray-50 hover:bg-gray-100 rounded-lg p-4 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-lg font-semibold text-gray-900">
                          {getEventLabel(event.eventType)}
                        </h4>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-500">
                            {new Date(event.timestamp).toLocaleString()}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <pre className="text-xs text-gray-600 overflow-x-auto">
                            {JSON.stringify(eventData, null, 2)}
                          </pre>
                        </div>
                      )}

                      {!isExpanded && eventData.summary && (
                        <p className="text-sm text-gray-600">{eventData.summary}</p>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Statistics */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Event Statistics</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{events.length}</div>
            <div className="text-sm text-gray-500">Total Events</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {events.filter(e => e.eventType === 'DISCOVERED').length}
            </div>
            <div className="text-sm text-gray-500">Discovered</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {events.filter(e => e.eventType === 'VULNERABLE').length}
            </div>
            <div className="text-sm text-gray-500">Vulnerable</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {events.filter(e => e.eventType === 'EXPLOITED').length}
            </div>
            <div className="text-sm text-gray-500">Exploited</div>
          </div>
        </div>
      </div>
    </div>
  )
}
