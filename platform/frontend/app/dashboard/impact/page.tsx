'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, Search, Loader2, AlertTriangle } from 'lucide-react'
import ImpactAssessmentView from '@/components/ImpactAssessmentView'
import { API_URL } from '@/lib/api'

interface ImpactSummary {
  vulnerabilityId: string
  overallImpactLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  impactSummary: string
  assessedAt: string
  vulnerability: {
    title: string
    severity: string
    assets: {
      name: string
    }
  }
}

export default function ImpactPage() {
  const [assessments, setAssessments] = useState<ImpactSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVulnId, setSelectedVulnId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterLevel, setFilterLevel] = useState<string>('ALL')

  useEffect(() => {
    fetchAssessments()
  }, [])

  const fetchAssessments = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `${API_URL}/api/impact/high-impact`,
        { credentials: 'include' }
      )
      const result = await response.json()
      if (result.success) {
        setAssessments(result.data.assessments)
      }
    } catch (error) {
      console.error('Failed to fetch impact assessments:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredAssessments = assessments.filter(assessment => {
    const matchesSearch =
      assessment.vulnerability.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      assessment.vulnerability.assets.name.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesFilter =
      filterLevel === 'ALL' || assessment.overallImpactLevel === filterLevel

    return matchesSearch && matchesFilter
  })

  const getImpactColor = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'text-red-600 bg-red-100'
      case 'HIGH': return 'text-orange-600 bg-orange-100'
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-100'
      case 'LOW': return 'text-blue-600 bg-blue-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  if (selectedVulnId) {
    return (
      <div className="p-8">
        <button
          onClick={() => setSelectedVulnId(null)}
          className="mb-6 text-blue-600 hover:text-blue-700 font-medium"
        >
          ← Back to Assessments
        </button>
        <ImpactAssessmentView vulnerabilityId={selectedVulnId} />
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <TrendingUp className="h-8 w-8 text-purple-500" />
          <h1 className="text-3xl font-bold text-gray-900">Impact Assessment</h1>
        </div>
        <p className="text-gray-600">
          Post-exploitation impact analysis with business risk translation
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search assessments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="ALL">All Levels</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      {/* Assessments List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : filteredAssessments.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <TrendingUp className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Impact Assessments</h3>
          <p className="text-gray-500 mb-6">
            Impact assessments are created after successful exploitation attempts.
            <br />
            Exploit vulnerabilities from the Exploitation page to see impact data.
          </p>
          <a
            href="/dashboard/exploitation"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
          >
            Go to Exploitation
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredAssessments.map((assessment) => (
            <button
              key={assessment.vulnerabilityId}
              onClick={() => setSelectedVulnId(assessment.vulnerabilityId)}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow text-left"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {assessment.vulnerability.title}
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    {assessment.vulnerability.assets.name}
                  </p>
                  <p className="text-sm text-gray-700">{assessment.impactSummary}</p>
                </div>
                <TrendingUp className="h-6 w-6 text-gray-400" />
              </div>
              <div className="flex items-center space-x-3">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getImpactColor(assessment.overallImpactLevel)}`}>
                  {assessment.overallImpactLevel} IMPACT
                </span>
                <span className="text-sm text-gray-500">
                  Assessed {new Date(assessment.assessedAt).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
