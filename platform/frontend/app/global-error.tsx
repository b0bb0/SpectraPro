'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to console in development only
    if (process.env.NODE_ENV === 'development') {
      console.error('Global Error:', error)
    }
  }, [error])

  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#02020d' }}>
          <div style={{ background: 'rgba(14,14,58,0.6)', border: '1px solid rgba(157,95,255,0.15)', backdropFilter: 'blur(20px)', borderRadius: '1rem' }} className="p-8 max-w-lg w-full text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(255,107,107,0.1)' }}>
              <AlertTriangle className="w-8 h-8" style={{ color: '#ff6b6b' }} />
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: '#e0d6f6' }}>
              Application Error
            </h2>
            <p className="mb-6" style={{ color: '#8878a9' }}>
              A critical error occurred. Please refresh the page or contact support if the problem persists.
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={reset}
                className="px-6 py-2.5 rounded-lg font-semibold transition-all"
                style={{ background: 'linear-gradient(135deg, #f0b840, #9d5fff)', color: '#02020d', boxShadow: '0 0 20px rgba(240,184,64,0.3)' }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-6 py-2.5 rounded-lg font-semibold transition-colors"
                style={{ color: '#8878a9', border: '1px solid rgba(157,95,255,0.2)' }}
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
