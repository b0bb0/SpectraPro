'use client'

import { useEffect, useState } from 'react'
import { Check, X, SkipForward, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'

interface TestResult {
  id: string
  scanId: string
  testName: string
  layer: 'BASELINE' | 'AI_EXPANDED'
  executionStatus: 'EXECUTED' | 'SKIPPED' | 'FAILED'
  skipReason: string | null
  result: any
  executionTime: number | null
  timestamp: string
}

interface TestStats {
  total: number
  executed: number
  skipped: number
  failed: number
  baseline: number
  aiExpanded: number
  skipReasons: Array<{ testName: string; reason: string }>
}

interface DiscoveryScanResultsProps {
  scanId: string
  onForceExecute?: (testResultId: string) => void
}

export default function DiscoveryScanResults({ scanId, onForceExecute }: DiscoveryScanResultsProps) {
  const [activeTab, setActiveTab] = useState<'BASELINE' | 'AI_EXPANDED' | 'ALL'>('ALL')
  const [results, setResults] = useState<TestResult[]>([])
  const [stats, setStats] = useState<TestStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [forcingTest, setForcingTest] = useState<string | null>(null)

  useEffect(() => {
    fetchResults()
    fetchStats()
  }, [scanId, activeTab])

  const fetchResults = async () => {
    try {
      setLoading(true)
      const layer = activeTab === 'ALL' ? '' : `?layer=${activeTab}`
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/discovery-scan/${scanId}/results${layer}`,
        { credentials: 'include' }
      )
      const result = await response.json()
      if (result.success) {
        setResults(result.data.results)
      }
    } catch (error) {
      console.error('Failed to fetch test results:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/discovery-scan/${scanId}/stats`,
        { credentials: 'include' }
      )
      const result = await response.json()
      if (result.success) {
        setStats(result.data)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const handleForceExecute = async (testResultId: string) => {
    try {
      setForcingTest(testResultId)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/discovery-scan/force-execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            testResultId,
            reason: 'Manual override from UI',
          }),
        }
      )
      const result = await response.json()
      if (result.success) {
        await fetchResults()
        await fetchStats()
        if (onForceExecute) {
          onForceExecute(testResultId)
        }
      }
    } catch (error) {
      console.error('Failed to force execute test:', error)
    } finally {
      setForcingTest(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'EXECUTED':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <Check className="h-3 w-3 mr-1" />
            EXECUTED
          </span>
        )
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <SkipForward className="h-3 w-3 mr-1" />
            SKIPPED
          </span>
        )
      case 'FAILED':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <X className="h-3 w-3 mr-1" />
            FAILED
          </span>
        )
    }
  }

  const getLayerBadge = (layer: string) => {
    return layer === 'BASELINE' ? (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        Baseline
      </span>
    ) : (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
        AI-Expanded
      </span>
    )
  }

  if (loading && !results.length) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('ALL')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'ALL'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          All Tests
        </button>
        <button
          onClick={() => setActiveTab('BASELINE')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'BASELINE'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Baseline
        </button>
        <button
          onClick={() => setActiveTab('AI_EXPANDED')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'AI_EXPANDED'
              ? 'border-purple-500 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          AI-Expanded
        </button>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Execution Statistics</h3>
          <div className="grid grid-cols-6 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-500">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.executed}</div>
              <div className="text-sm text-gray-500">Executed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.skipped}</div>
              <div className="text-sm text-gray-500">Skipped</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <div className="text-sm text-gray-500">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.baseline}</div>
              <div className="text-sm text-gray-500">Baseline</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.aiExpanded}</div>
              <div className="text-sm text-gray-500">AI-Expanded</div>
            </div>
          </div>
        </div>
      )}

      {/* Test Results */}
      <div className="space-y-3">
        {results.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            No test results found
          </div>
        ) : (
          results.map((test) => (
            <div
              key={test.id}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center space-x-3">
                    {getStatusBadge(test.executionStatus)}
                    {getLayerBadge(test.layer)}
                    <span className="font-medium text-gray-900">{test.testName}</span>
                    {test.executionTime && (
                      <span className="text-sm text-gray-500">{test.executionTime}ms</span>
                    )}
                  </div>

                  {test.executionStatus === 'SKIPPED' && test.skipReason && (
                    <div className="flex items-start space-x-2 text-sm text-gray-600 bg-yellow-50 p-2 rounded">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <span>{test.skipReason}</span>
                    </div>
                  )}

                  {test.executionStatus === 'EXECUTED' && test.result && (
                    <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto">
                      {JSON.stringify(test.result, null, 2)}
                    </pre>
                  )}
                </div>

                {test.executionStatus === 'SKIPPED' && test.layer === 'AI_EXPANDED' && (
                  <button
                    onClick={() => handleForceExecute(test.id)}
                    disabled={forcingTest === test.id}
                    className="ml-4 flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {forcingTest === test.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Forcing...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        <span>Force Execute</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Skip Reasons Summary */}
      {stats && stats.skipReasons.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Skip Reasons</h3>
          <div className="space-y-2">
            {stats.skipReasons.map((item, index) => (
              <div key={index} className="flex items-start space-x-2 text-sm">
                <span className="font-medium text-gray-700 min-w-[200px]">{item.testName}:</span>
                <span className="text-gray-600">{item.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
