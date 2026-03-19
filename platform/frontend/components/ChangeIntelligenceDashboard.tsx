'use client'

import { useState, useEffect } from 'react'
import { GitCompare, TrendingUp, TrendingDown, AlertTriangle, Plus, Search, Loader2, Calendar } from 'lucide-react'
import { API_URL } from '@/lib/api'

interface ChangeRecord {
  id: string
  assetId: string
  changeType: 'NEW_PARAMETERS' | 'NEW_EXPOSURE' | 'TECH_STACK_CHANGE' | 'RISK_DELTA'
  previousValue: string
  newValue: string
  riskDelta: number
  detectedAt: string
  assets: {
    name: string
    url: string
  }
}

interface ChangeIntelligenceDashboardProps {
  assetId?: string
  scanId?: string
}

const getChangeTypeLabel = (changeType: string) => {
  switch (changeType) {
    case 'NEW_PARAMETERS':
      return 'New Parameters'
    case 'NEW_EXPOSURE':
      return 'New Exposure'
    case 'TECH_STACK_CHANGE':
      return 'Tech Stack Change'
    case 'RISK_DELTA':
      return 'Risk Change'
    default:
      return changeType
  }
}

const getChangeTypeColor = (changeType: string) => {
  switch (changeType) {
    case 'NEW_PARAMETERS':
      return 'bg-blue-100 text-blue-600 border-blue-300'
    case 'NEW_EXPOSURE':
      return 'bg-red-100 text-red-600 border-red-300'
    case 'TECH_STACK_CHANGE':
      return 'bg-purple-100 text-purple-600 border-purple-300'
    case 'RISK_DELTA':
      return 'bg-yellow-100 text-yellow-600 border-yellow-300'
    default:
      return 'bg-gray-100 text-gray-600 border-gray-300'
  }
}

const getRiskSeverity = (delta: number) => {
  if (delta >= 20) return { label: 'Critical', color: 'text-red-600' }
  if (delta >= 10) return { label: 'High', color: 'text-orange-600' }
  if (delta >= 5) return { label: 'Medium', color: 'text-yellow-600' }
  if (delta > 0) return { label: 'Low', color: 'text-blue-600' }
  return { label: 'No Change', color: 'text-gray-600' }
}

export default function ChangeIntelligenceDashboard({ assetId, scanId }: ChangeIntelligenceDashboardProps) {
  const [changes, setChanges] = useState<ChangeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [compareView, setCompareView] = useState<ChangeRecord | null>(null)

  useEffect(() => {
    fetchChanges()
  }, [assetId, scanId])

  const fetchChanges = async () => {
    try {
      setLoading(true)
      let url = `${API_URL}/api/change-intelligence`

      const params = new URLSearchParams()
      if (assetId) params.append('assetId', assetId)
      if (scanId) params.append('scanId', scanId)
      if (params.toString()) url += `?${params.toString()}`

      const response = await fetch(url, { credentials: 'include' })
      const result = await response.json()
      if (result.success) {
        setChanges(result.data.changes)
      }
    } catch (error) {
      console.error('Failed to fetch change intelligence:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredChanges = changes.filter(change => {
    const matchesFilter = filterType === 'ALL' || change.changeType === filterType
    const matchesSearch =
      change.assets.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      change.assets.url.toLowerCase().includes(searchTerm.toLowerCase())

    return matchesFilter && matchesSearch
  })

  const newParameters = changes.filter(c => c.changeType === 'NEW_PARAMETERS')
  const newExposures = changes.filter(c => c.changeType === 'NEW_EXPOSURE')
  const techStackChanges = changes.filter(c => c.changeType === 'TECH_STACK_CHANGE')
  const totalRiskIncrease = changes.reduce((sum, c) => sum + (c.riskDelta > 0 ? c.riskDelta : 0), 0)

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
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center space-x-3 mb-2">
          <GitCompare className="h-8 w-8 text-purple-500" />
          <h1 className="text-3xl font-bold text-gray-900">Change Intelligence</h1>
        </div>
        <p className="text-gray-600">
          Track changes to your attack surface across scans
        </p>
      </div>

      {/* Statistics Overview */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <Plus className="h-6 w-6 text-blue-600" />
            <span className="text-sm text-gray-500">New</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{newParameters.length}</div>
          <div className="text-sm text-gray-600">Parameters</div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="h-6 w-6 text-red-600" />
            <span className="text-sm text-gray-500">New</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{newExposures.length}</div>
          <div className="text-sm text-gray-600">Exposures</div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <GitCompare className="h-6 w-6 text-purple-600" />
            <span className="text-sm text-gray-500">Stack</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{techStackChanges.length}</div>
          <div className="text-sm text-gray-600">Changes</div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="h-6 w-6 text-yellow-600" />
            <span className="text-sm text-gray-500">Total</span>
          </div>
          <div className={`text-3xl font-bold ${getRiskSeverity(totalRiskIncrease).color}`}>
            +{totalRiskIncrease}
          </div>
          <div className="text-sm text-gray-600">Risk Increase</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by asset..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="ALL">All Changes</option>
          <option value="NEW_PARAMETERS">New Parameters</option>
          <option value="NEW_EXPOSURE">New Exposures</option>
          <option value="TECH_STACK_CHANGE">Tech Stack Changes</option>
          <option value="RISK_DELTA">Risk Changes</option>
        </select>
      </div>

      {/* Changes List */}
      {filteredChanges.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <GitCompare className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Changes Detected</h3>
          <p className="text-gray-500">
            Run multiple scans on the same assets to track changes over time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredChanges.map((change) => {
            const previous = JSON.parse(change.previousValue)
            const current = JSON.parse(change.newValue)

            return (
              <div
                key={change.id}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getChangeTypeColor(change.changeType)}`}>
                        {getChangeTypeLabel(change.changeType)}
                      </span>
                      {change.riskDelta > 0 && (
                        <span className={`flex items-center text-sm font-medium ${getRiskSeverity(change.riskDelta).color}`}>
                          <TrendingUp className="h-4 w-4 mr-1" />
                          +{change.riskDelta} Risk
                        </span>
                      )}
                      {change.riskDelta < 0 && (
                        <span className="flex items-center text-sm font-medium text-green-600">
                          <TrendingDown className="h-4 w-4 mr-1" />
                          {change.riskDelta} Risk
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {change.assets.name}
                    </h3>
                    <p className="text-sm text-gray-600 mb-3">{change.assets.url}</p>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <Calendar className="h-4 w-4" />
                      <span>{new Date(change.detectedAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setCompareView(change)}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                  >
                    Compare
                  </button>
                </div>

                {/* Quick Summary */}
                {change.changeType === 'NEW_PARAMETERS' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <h4 className="text-sm font-semibold text-blue-900 mb-1">New Parameters Detected</h4>
                    <div className="flex flex-wrap gap-2">
                      {Array.isArray(current) && current.slice(0, 5).map((param: string, idx: number) => (
                        <span key={idx} className="px-2 py-1 bg-white text-xs text-blue-700 rounded border border-blue-300">
                          {param}
                        </span>
                      ))}
                      {Array.isArray(current) && current.length > 5 && (
                        <span className="px-2 py-1 text-xs text-blue-700">
                          +{current.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {change.changeType === 'NEW_EXPOSURE' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <h4 className="text-sm font-semibold text-red-900 mb-1">New Exposure Found</h4>
                    <p className="text-sm text-red-800">{current.path || current.description}</p>
                  </div>
                )}

                {change.changeType === 'TECH_STACK_CHANGE' && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <h4 className="text-sm font-semibold text-purple-900 mb-1">Technology Stack Changed</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-purple-700">Previous: </span>
                        <span className="text-purple-900 font-medium">{previous.version || previous.framework}</span>
                      </div>
                      <div>
                        <span className="text-purple-700">Current: </span>
                        <span className="text-purple-900 font-medium">{current.version || current.framework}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Comparison Modal */}
      {compareView && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">Change Comparison</h3>
                <button
                  onClick={() => setCompareView(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getChangeTypeColor(compareView.changeType)}`}>
                    {getChangeTypeLabel(compareView.changeType)}
                  </span>
                </div>
                <h4 className="text-lg font-semibold text-gray-900">{compareView.assets.name}</h4>
                <p className="text-sm text-gray-600">{compareView.assets.url}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-red-900 mb-3">Previous State</h4>
                  <pre className="text-xs text-red-800 overflow-x-auto">
                    {JSON.stringify(JSON.parse(compareView.previousValue), null, 2)}
                  </pre>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-green-900 mb-3">Current State</h4>
                  <pre className="text-xs text-green-800 overflow-x-auto">
                    {JSON.stringify(JSON.parse(compareView.newValue), null, 2)}
                  </pre>
                </div>
              </div>

              {compareView.riskDelta !== 0 && (
                <div className={`rounded-lg p-4 ${compareView.riskDelta > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
                  <h4 className={`text-sm font-semibold mb-2 ${compareView.riskDelta > 0 ? 'text-yellow-900' : 'text-green-900'}`}>
                    Risk Impact
                  </h4>
                  <div className="flex items-center space-x-2">
                    {compareView.riskDelta > 0 ? (
                      <TrendingUp className="h-5 w-5 text-yellow-600" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-green-600" />
                    )}
                    <span className={`text-lg font-bold ${compareView.riskDelta > 0 ? 'text-yellow-900' : 'text-green-900'}`}>
                      {compareView.riskDelta > 0 ? '+' : ''}{compareView.riskDelta} points
                    </span>
                    <span className={`text-sm ${compareView.riskDelta > 0 ? 'text-yellow-700' : 'text-green-700'}`}>
                      ({getRiskSeverity(Math.abs(compareView.riskDelta)).label})
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={() => setCompareView(null)}
                className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
