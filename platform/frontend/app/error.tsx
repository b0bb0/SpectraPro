'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to console in development only
    if (process.env.NODE_ENV === 'development') {
      console.error('Error:', error)
    }
    // In production, you could send to an error tracking service here
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="glass-panel p-8 max-w-lg w-full text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">
          Something went wrong
        </h2>
        <p className="text-text-secondary mb-6">
          We encountered an unexpected error. Please try again.
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="btn-premium px-6 py-2.5"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="px-6 py-2.5 rounded-lg font-semibold text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
