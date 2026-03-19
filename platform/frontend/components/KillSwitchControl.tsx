'use client'

import { useEffect, useState } from 'react'
import { Power, AlertTriangle, CheckCircle, Loader2, ShieldAlert, Clock, User } from 'lucide-react'
import { toast } from 'sonner'
import { API_URL } from '@/lib/api'

interface KillSwitchStatus {
  isActive: boolean
  activatedAt: string | null
  activatedBy: string | null
  reason: string | null
  deactivatedAt: string | null
  deactivatedBy: string | null
}

interface KillSwitchControlProps {
  onStatusChange?: (isActive: boolean) => void
}

export default function KillSwitchControl({ onStatusChange }: KillSwitchControlProps) {
  const [status, setStatus] = useState<KillSwitchStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [reason, setReason] = useState('')
  const [activeScanCount, setActiveScanCount] = useState(0)

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchStatus = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/kill-switch/status`,
        { credentials: 'include' }
      )
      const result = await response.json()
      if (result.success) {
        setStatus(result.data)
        if (onStatusChange) onStatusChange(result.data.isActive)
      }
    } catch (error) {
      console.error('Failed to fetch kill switch status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleActivate = async () => {
    if (!reason.trim() || reason.trim().length < 10) {
      toast.error('Please provide a detailed reason (at least 10 characters)')
      return
    }
    try {
      setActing(true)
      const response = await fetch(
        `${API_URL}/api/kill-switch/activate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ reason }),
        }
      )
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: 'Failed to activate kill switch' } }))
        throw new Error(errorData.error?.message || 'Failed to activate kill switch')
      }
      const result = await response.json()
      if (result.success) {
        await fetchStatus()
        setShowConfirmModal(false)
        setReason('')
        toast.success('Kill switch activated — all scans stopped')
      }
    } catch (error) {
      console.error('Failed to activate kill switch:', error)
      toast.error('Unable to activate kill switch. Please check permissions and try again.')
    } finally {
      setActing(false)
    }
  }

  const handleDeactivate = async () => {
    if (!confirm('Are you sure you want to deactivate the kill switch? Scans will resume.')) return
    try {
      setActing(true)
      const response = await fetch(
        `${API_URL}/api/kill-switch/deactivate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      )
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: 'Failed to deactivate kill switch' } }))
        throw new Error(errorData.error?.message || 'Failed to deactivate kill switch')
      }
      const result = await response.json()
      if (result.success) {
        await fetchStatus()
        toast.success('Kill switch deactivated — scanning can resume')
      }
    } catch (error) {
      console.error('Failed to deactivate kill switch:', error)
      toast.error('Unable to deactivate kill switch. Please check permissions and try again.')
    } finally {
      setActing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#f0b840' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-11 w-11 rounded-xl flex items-center justify-center"
            style={{
              background: status?.isActive
                ? 'rgba(255,107,107,0.15)'
                : 'linear-gradient(135deg, rgba(240,184,64,0.2), rgba(157,95,255,0.15))',
              border: status?.isActive
                ? '1px solid rgba(255,107,107,0.3)'
                : '1px solid rgba(240,184,64,0.3)',
            }}
          >
            <ShieldAlert className="w-5 h-5" style={{ color: status?.isActive ? '#ff6b6b' : '#f0b840' }} />
          </div>
          <h2 className="text-2xl font-bold" style={{ color: '#e0d6f6' }}>Emergency Controls</h2>
        </div>
        <span
          className="cosmic-pill flex items-center gap-2 px-4 py-2"
          style={{
            background: status?.isActive ? 'rgba(255,107,107,0.12)' : 'rgba(74,222,128,0.12)',
            color: status?.isActive ? '#ff6b6b' : '#4ade80',
            border: `1px solid ${status?.isActive ? 'rgba(255,107,107,0.3)' : 'rgba(74,222,128,0.3)'}`,
          }}
        >
          {status?.isActive ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
          <span className="font-mono text-sm font-semibold">{status?.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
        </span>
      </div>

      {/* Active Scans Counter */}
      <div className="cosmic-panel p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium font-mono" style={{ color: '#8878a9' }}>Active Scans</h3>
            <div className="text-3xl font-bold font-mono mt-1" style={{ color: '#e0d6f6' }}>{activeScanCount}</div>
          </div>
          <div
            className="h-16 w-16 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(96,165,250,0.15), rgba(157,95,255,0.1))',
              border: '1px solid rgba(96,165,250,0.25)',
            }}
          >
            <Power className="h-8 w-8" style={{ color: '#60a5fa' }} />
          </div>
        </div>
      </div>

      {/* Kill Switch Button */}
      {!status?.isActive ? (
        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={acting}
          className="w-full flex items-center justify-center gap-3 py-6 text-lg font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'linear-gradient(135deg, #ff6b6b, #cc3333)',
            color: '#fff',
            boxShadow: '0 0 30px rgba(255,107,107,0.3)',
            border: '1px solid rgba(255,107,107,0.4)',
          }}
        >
          <Power className="h-6 w-6" />
          <span>ACTIVATE KILL SWITCH</span>
        </button>
      ) : (
        <button
          onClick={handleDeactivate}
          disabled={acting}
          className="w-full flex items-center justify-center gap-3 py-6 text-lg font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'linear-gradient(135deg, #4ade80, #22c55e)',
            color: '#02020d',
            boxShadow: '0 0 30px rgba(74,222,128,0.3)',
            border: '1px solid rgba(74,222,128,0.4)',
          }}
        >
          {acting ? (
            <><Loader2 className="h-6 w-6 animate-spin" /><span>Deactivating...</span></>
          ) : (
            <><CheckCircle className="h-6 w-6" /><span>DEACTIVATE KILL SWITCH</span></>
          )}
        </button>
      )}

      {/* Status Information */}
      <div className="cosmic-panel p-6 space-y-4">
        <h3 className="text-lg font-semibold" style={{ color: '#e0d6f6' }}>Status Information</h3>

        {status?.isActive && status.activatedAt && (
          <div className="space-y-3">
            <div
              className="rounded-xl p-5"
              style={{ background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)' }}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#ff6b6b' }} />
                <div className="flex-1 space-y-2">
                  <div className="font-semibold" style={{ color: '#ff6b6b' }}>Kill Switch Active</div>
                  <div className="text-sm space-y-1.5" style={{ color: '#e0d6f6' }}>
                    <div className="flex items-center gap-2"><span style={{ color: '#8878a9' }}>Reason:</span> {status.reason}</div>
                    <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" style={{ color: '#8878a9' }} />{new Date(status.activatedAt).toLocaleString()}</div>
                    <div className="flex items-center gap-2"><User className="w-3.5 h-3.5" style={{ color: '#8878a9' }} />{status.activatedBy}</div>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-sm" style={{ color: '#8878a9' }}>
              All scanning activities have been stopped. No new scans can be initiated until the kill switch is deactivated.
            </p>
          </div>
        )}

        {!status?.isActive && status?.deactivatedAt && (
          <div className="space-y-3">
            <div
              className="rounded-xl p-5"
              style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)' }}
            >
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#4ade80' }} />
                <div className="flex-1 space-y-2">
                  <div className="font-semibold" style={{ color: '#4ade80' }}>Kill Switch Inactive</div>
                  <div className="text-sm space-y-1.5" style={{ color: '#e0d6f6' }}>
                    {status.activatedAt && (
                      <>
                        <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" style={{ color: '#8878a9' }} /><span style={{ color: '#8878a9' }}>Last activated:</span> {new Date(status.activatedAt).toLocaleString()}</div>
                        <div className="flex items-center gap-2"><span style={{ color: '#8878a9' }}>Last reason:</span> {status.reason}</div>
                      </>
                    )}
                    <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" style={{ color: '#8878a9' }} /><span style={{ color: '#8878a9' }}>Deactivated:</span> {new Date(status.deactivatedAt).toLocaleString()}</div>
                    <div className="flex items-center gap-2"><User className="w-3.5 h-3.5" style={{ color: '#8878a9' }} />{status.deactivatedBy}</div>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-sm" style={{ color: '#8878a9' }}>
              Scanning operations are running normally. The kill switch can be activated immediately in case of emergency.
            </p>
          </div>
        )}

        {!status?.isActive && !status?.deactivatedAt && (
          <p className="text-sm" style={{ color: '#8878a9' }}>
            The kill switch has never been activated. It is available for immediate use in emergency situations.
          </p>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="cosmic-panel max-w-md w-full p-6 space-y-5" style={{ boxShadow: '0 0 60px rgba(255,107,107,0.15)' }}>
            <div className="flex items-center gap-3">
              <div
                className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(255,107,107,0.12)', border: '1px solid rgba(255,107,107,0.3)' }}
              >
                <AlertTriangle className="h-6 w-6" style={{ color: '#ff6b6b' }} />
              </div>
              <h3 className="text-xl font-bold" style={{ color: '#e0d6f6' }}>Activate Kill Switch</h3>
            </div>

            <p className="text-sm" style={{ color: '#8878a9' }}>
              This will immediately stop all active scans and prevent new scans from starting. Use only in emergency situations.
            </p>

            <div className="space-y-2">
              <label className="block text-sm font-medium" style={{ color: '#e0d6f6' }}>
                Reason for Activation <span style={{ color: '#ff6b6b' }}>*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g., False positive rate too high, unauthorized scan detected, etc."
                className="w-full px-4 py-3 rounded-xl text-sm resize-none transition-all"
                style={{
                  background: 'rgba(14,14,58,0.6)',
                  border: '1px solid rgba(157,95,255,0.15)',
                  color: '#e0d6f6',
                  outline: 'none',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,107,107,0.4)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(157,95,255,0.15)' }}
              />
              <p className="text-xs" style={{ color: reason.trim().length >= 10 ? '#4ade80' : '#6b5f8a' }}>
                {reason.trim().length}/10 characters minimum
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowConfirmModal(false); setReason('') }}
                className="flex-1 px-4 py-2.5 rounded-lg font-medium transition-all"
                style={{ border: '1px solid rgba(157,95,255,0.2)', color: '#8878a9' }}
              >
                Cancel
              </button>
              <button
                onClick={handleActivate}
                disabled={!reason.trim() || reason.trim().length < 10 || acting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, #ff6b6b, #cc3333)',
                  color: '#fff',
                  border: '1px solid rgba(255,107,107,0.4)',
                }}
              >
                {acting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /><span>Activating...</span></>
                ) : (
                  <><Power className="h-4 w-4" /><span>Activate</span></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
