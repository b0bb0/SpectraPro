'use client'

import { Activity, CheckCircle, AlertTriangle, FileText, Clock } from 'lucide-react'

interface TimelineEvent {
  id: string
  type: string
  title: string
  description: string
  timestamp: string
  status: 'success' | 'danger' | 'info' | string
  severity?: string
}

interface AssetTimelineProps {
  events: TimelineEvent[]
  onClose?: () => void
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'success':
      return CheckCircle
    case 'danger':
      return AlertTriangle
    case 'info':
      return FileText
    default:
      return Clock
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'success':
      return 'text-green-400'
    case 'danger':
      return 'text-red-400'
    case 'info':
      return 'text-blue-400'
    default:
      return 'text-gray-400'
  }
}

export default function AssetTimeline({ events, onClose }: AssetTimelineProps) {
  return (
    <div className="rounded-lg border bg-gray-900 border-gray-700">
      <div className="flex flex-col space-y-1.5 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-blue-400" />
            <h3 className="text-lg font-semibold leading-none tracking-tight text-white">Activity Timeline</h3>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="p-6 pt-0">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500">
            <Clock className="h-10 w-10 mb-3 text-gray-600" />
            <p>No activity recorded</p>
          </div>
        ) : (
          <ol className="space-y-4">
            {events.map((event, index) => {
              const Icon = getStatusIcon(event.status)
              const iconColor = getStatusColor(event.status)
              return (
                <li key={event.id} className="flex items-start space-x-3">
                  <div className={`flex-shrink-0 mt-0.5 ${iconColor}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{event.title}</p>
                    <p className="text-sm text-gray-400">{event.description}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(event.timestamp).toLocaleString()}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
