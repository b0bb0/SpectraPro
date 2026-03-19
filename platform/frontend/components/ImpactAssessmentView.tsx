'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, TrendingUp, Users, Database, Network, Shield } from 'lucide-react'
import { API_URL } from '@/lib/api'

interface ImpactAssessment {
  id: string
  vulnerabilityId: string
  exploitAttemptId: string
  privilegeEscalation: boolean
  privilegeContext: string | null
  authBypassed: boolean
  authBoundaryDescription: string | null
  lateralMovementPossible: boolean
  lateralMovementDescription: string | null
  dataSensitivityLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  dataSchemaExposed: string[]
  overallImpactLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  impactSummary: string
  assessedAt: string
  assessedBy: string
}

interface ImpactAssessmentViewProps {
  vulnerabilityId: string
}

const getImpactColor = (level: string) => {
  switch (level) {
    case 'CRITICAL':
      return 'text-red-600 bg-red-100'
    case 'HIGH':
      return 'text-orange-600 bg-orange-100'
    case 'MEDIUM':
      return 'text-yellow-600 bg-yellow-100'
    case 'LOW':
      return 'text-blue-600 bg-blue-100'
    default:
      return 'text-gray-600 bg-gray-100'
  }
}

const getImpactIcon = (level: string) => {
  switch (level) {
    case 'CRITICAL':
    case 'HIGH':
      return AlertTriangle
    case 'MEDIUM':
      return TrendingUp
    default:
      return Shield
  }
}

export default function ImpactAssessmentView({ vulnerabilityId }: ImpactAssessmentViewProps) {
  const [assessment, setAssessment] = useState<ImpactAssessment | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAssessment()
  }, [vulnerabilityId])

  const fetchAssessment = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `${API_URL}/api/impact/vulnerability/${vulnerabilityId}`,
        { credentials: 'include' }
      )
      const result = await response.json()
      if (result.success) {
        setAssessment(result.data)
      }
    } catch (error) {
      console.error('Failed to fetch impact assessment:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">No impact assessment available</p>
        <p className="text-sm text-gray-400 mt-2">
          An impact assessment is created after successful exploitation
        </p>
      </div>
    )
  }

  const ImpactIcon = getImpactIcon(assessment.overallImpactLevel)

  return (
    <div className="space-y-6">
      {/* Overall Impact Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Impact Assessment</h2>
          <span className={`flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-semibold ${getImpactColor(assessment.overallImpactLevel)}`}>
            <ImpactIcon className="h-5 w-5" />
            <span>{assessment.overallImpactLevel}</span>
          </span>
        </div>
        <p className="text-gray-700 leading-relaxed">{assessment.impactSummary}</p>
        <div className="mt-4 text-sm text-gray-500">
          Assessed {new Date(assessment.assessedAt).toLocaleString()}
        </div>
      </div>

      {/* Impact Indicators Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Privilege Escalation */}
        <div className={`bg-white rounded-lg border p-6 ${assessment.privilegeEscalation ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-2">
              <TrendingUp className={`h-5 w-5 ${assessment.privilegeEscalation ? 'text-red-600' : 'text-gray-400'}`} />
              <h3 className="font-semibold text-gray-900">Privilege Escalation</h3>
            </div>
            {assessment.privilegeEscalation && (
              <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                YES
              </span>
            )}
          </div>
          {assessment.privilegeEscalation ? (
            <div className="text-sm text-gray-700">
              <strong>Context:</strong> {assessment.privilegeContext}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              No privilege escalation detected
            </div>
          )}
        </div>

        {/* Auth Bypass */}
        <div className={`bg-white rounded-lg border p-6 ${assessment.authBypassed ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Users className={`h-5 w-5 ${assessment.authBypassed ? 'text-red-600' : 'text-gray-400'}`} />
              <h3 className="font-semibold text-gray-900">Auth Bypass</h3>
            </div>
            {assessment.authBypassed && (
              <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                YES
              </span>
            )}
          </div>
          {assessment.authBypassed ? (
            <div className="text-sm text-gray-700">
              <strong>Boundary:</strong> {assessment.authBoundaryDescription}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              Authentication controls intact
            </div>
          )}
        </div>

        {/* Lateral Movement */}
        <div className={`bg-white rounded-lg border p-6 ${assessment.lateralMovementPossible ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Network className={`h-5 w-5 ${assessment.lateralMovementPossible ? 'text-orange-600' : 'text-gray-400'}`} />
              <h3 className="font-semibold text-gray-900">Lateral Movement</h3>
            </div>
            {assessment.lateralMovementPossible && (
              <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-medium rounded-full">
                POSSIBLE
              </span>
            )}
          </div>
          {assessment.lateralMovementPossible ? (
            <div className="text-sm text-gray-700">
              <strong>Description:</strong> {assessment.lateralMovementDescription}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              No lateral movement opportunities identified
            </div>
          )}
        </div>

        {/* Data Sensitivity */}
        <div className={`bg-white rounded-lg border p-6 ${assessment.dataSensitivityLevel !== 'NONE' ? 'border-purple-300 bg-purple-50' : 'border-gray-200'}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Database className={`h-5 w-5 ${assessment.dataSensitivityLevel !== 'NONE' ? 'text-purple-600' : 'text-gray-400'}`} />
              <h3 className="font-semibold text-gray-900">Data Sensitivity</h3>
            </div>
            {assessment.dataSensitivityLevel !== 'NONE' && (
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getImpactColor(assessment.dataSensitivityLevel)}`}>
                {assessment.dataSensitivityLevel}
              </span>
            )}
          </div>
          {assessment.dataSchemaExposed.length > 0 ? (
            <div className="text-sm text-gray-700">
              <strong>Exposed Schema:</strong>
              <div className="mt-2 flex flex-wrap gap-1">
                {assessment.dataSchemaExposed.map((schema) => (
                  <span
                    key={schema}
                    className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded"
                  >
                    {schema}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              No sensitive data exposure detected
            </div>
          )}
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Impact Analysis Details</h3>
        <div className="space-y-4">
          {assessment.privilegeEscalation && (
            <div className="flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-red-900 mb-1">Privilege Escalation Confirmed</div>
                <div className="text-sm text-red-800">
                  The exploitation provides elevated privileges: {assessment.privilegeContext}. This allows the attacker to perform actions beyond the intended access level.
                </div>
              </div>
            </div>
          )}

          {assessment.authBypassed && (
            <div className="flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-red-900 mb-1">Authentication Bypass Detected</div>
                <div className="text-sm text-red-800">
                  {assessment.authBoundaryDescription}. This completely undermines the authentication controls.
                </div>
              </div>
            </div>
          )}

          {assessment.lateralMovementPossible && (
            <div className="flex items-start space-x-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <Network className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-orange-900 mb-1">Lateral Movement Possible</div>
                <div className="text-sm text-orange-800">
                  {assessment.lateralMovementDescription}
                </div>
              </div>
            </div>
          )}

          {assessment.dataSchemaExposed.length > 0 && (
            <div className="flex items-start space-x-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <Database className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-purple-900 mb-1">Sensitive Data Exposure</div>
                <div className="text-sm text-purple-800">
                  The following database schemas are accessible: {assessment.dataSchemaExposed.join(', ')}.
                  This represents a {assessment.dataSensitivityLevel} level data breach risk.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Remediation Priority */}
      {assessment.overallImpactLevel === 'CRITICAL' || assessment.overallImpactLevel === 'HIGH' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 mb-2">Immediate Action Required</h3>
              <p className="text-sm text-red-800">
                This vulnerability has a {assessment.overallImpactLevel} impact level and should be remediated immediately. The exploitation proof confirms active exploitability with significant business impact.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
