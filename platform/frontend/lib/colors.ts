/**
 * Centralized color utilities for severity, status, and scan state.
 * All dashboard pages import from here so chart/badge colors stay consistent.
 */

// ── Hex values (for inline styles, SVG fills, Recharts) ──────────────

export function getSeverityHex(severity: string): string {
  switch (severity?.toUpperCase()) {
    case 'CRITICAL':
      return '#ff6b6b'
    case 'HIGH':
      return '#f0b840'
    case 'MEDIUM':
      return '#9d5fff'
    case 'LOW':
      return '#60a5fa'
    case 'INFO':
    case 'INFORMATIONAL':
      return '#8878a9'
    default:
      return '#8878a9'
  }
}

export function getScanStatusHex(status: string): string {
  switch (status?.toUpperCase()) {
    case 'COMPLETED':
      return '#4ade80'
    case 'RUNNING':
      return '#60a5fa'
    case 'PENDING':
      return '#f0b840'
    case 'FAILED':
      return '#ff6b6b'
    default:
      return '#8878a9'
  }
}

// ── Tailwind-friendly class objects (for badges, pills) ──────────────

export function getSeverityColor(severity: string): {
  bg: string
  text: string
  border: string
} {
  switch (severity?.toUpperCase()) {
    case 'CRITICAL':
      return { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' }
    case 'HIGH':
      return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
    case 'MEDIUM':
      return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' }
    case 'LOW':
      return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' }
    case 'INFO':
    case 'INFORMATIONAL':
      return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' }
    default:
      return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' }
  }
}

export function getScanStatusColor(status: string): {
  bg: string
  text: string
  border: string
} {
  switch (status?.toUpperCase()) {
    case 'COMPLETED':
      return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' }
    case 'RUNNING':
      return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' }
    case 'PENDING':
      return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' }
    case 'FAILED':
      return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
    default:
      return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' }
  }
}

export function getStatusColor(status: string): {
  bg: string
  text: string
  border: string
} {
  switch (status?.toUpperCase()) {
    case 'OPEN':
      return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
    case 'IN_PROGRESS':
      return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' }
    case 'MITIGATED':
      return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' }
    case 'ACCEPTED':
      return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' }
    case 'FALSE_POSITIVE':
      return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' }
    case 'REOPENED':
      return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' }
    case 'CONTROLLED':
      return { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' }
    default:
      return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' }
  }
}
