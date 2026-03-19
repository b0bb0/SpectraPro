'use client';

import { MouseEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, CheckCircle, XCircle, Clock, Target, Search, X, Layers, Square } from 'lucide-react';
import { scansAPI } from '@/lib/api';
import NewScanModal from '@/components/NewScanModal';
import BulkScanModal from '@/components/BulkScanModal';
import { useWebSocket, useBulkScanUpdates } from '@/hooks/useWebSocket';

interface Scan {
  id: string;
  name: string;
  type: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  progress?: number;
  currentPhase?: string;
  vulnFound: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  asset?: {
    id: string;
    name: string;
    hostname?: string;
    ipAddress?: string;
  };
}

export default function ScansPage() {
  const router = useRouter();
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showScanModal, setShowScanModal] = useState(false);
  const [showBulkScanModal, setShowBulkScanModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [scanStartedNotification, setScanStartedNotification] = useState(false);
  const [bulkScanStartedNotification, setBulkScanStartedNotification] = useState(false);
  const [killingScanIds, setKillingScanIds] = useState<Set<string>>(new Set());

  // WebSocket for real-time updates
  const { lastEvent, isConnected } = useWebSocket();
  const { bulkProgress, isRunning: isBulkScanRunning } = useBulkScanUpdates();

  const fetchScans = async () => {
    try {
      const data = await scansAPI.getAll();
      setScans(data || []);
      setError('');
    } catch (err: any) {
      console.error('Failed to load scans:', err);
      // Secure error handling - generic user message only
      setError('Unable to load scans. Please try again.');
      setScans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScans();

    // Reduced polling to every 30 seconds since WebSocket provides real-time updates
    const interval = setInterval(() => {
      fetchScans();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Handle WebSocket events for real-time updates
  useEffect(() => {
    if (!lastEvent) return;

    if (lastEvent.type === 'scan_progress' || lastEvent.type === 'scan_completed') {
      // Update the specific scan in the list
      setScans(prevScans =>
        prevScans.map(scan => {
          if (scan.id === lastEvent.scanId) {
            if (lastEvent.type === 'scan_progress') {
              return {
                ...scan,
                progress: lastEvent.progress,
                currentPhase: lastEvent.currentPhase,
                status: lastEvent.status,
                vulnFound: lastEvent.vulnFound || scan.vulnFound,
              };
            } else if (lastEvent.type === 'scan_completed') {
              // Fetch full details when scan completes
              fetchScans();
              return scan;
            }
          }
          return scan;
        })
      );
    } else if (lastEvent.type === 'scan_started') {
      // Refresh list to show new scan
      fetchScans();
    } else if (lastEvent.type === 'bulk_scan_started') {
      // Show bulk scan notification
      setBulkScanStartedNotification(true);
      setTimeout(() => setBulkScanStartedNotification(false), 10000);
    } else if (lastEvent.type === 'bulk_scan_completed') {
      // Refresh list when bulk scan completes
      fetchScans();
    }
  }, [lastEvent]);

  const handleScanStarted = (scanId: string) => {
    setShowScanModal(false);
    setScanStartedNotification(true);
    fetchScans(); // Refresh the list to show the new scan

    // Hide notification after 5 seconds
    setTimeout(() => {
      setScanStartedNotification(false);
    }, 5000);
  };

  const handleBulkScanStarted = (batchId: string, targetCount?: number) => {
    setShowBulkScanModal(false);
    setBulkScanStartedNotification(true);
    fetchScans(); // Refresh the list to show the new scans

    // Hide notification after 7 seconds (longer for bulk scans)
    setTimeout(() => {
      setBulkScanStartedNotification(false);
    }, 7000);
  };

  const handleKillScan = async (e: MouseEvent, scanId: string) => {
    e.stopPropagation();
    if (killingScanIds.has(scanId)) return;

    setKillingScanIds((prev) => new Set(prev).add(scanId));
    try {
      await scansAPI.kill(scanId);
      await fetchScans();
    } catch (err) {
      console.error('Failed to kill scan:', err);
      setError('Failed to terminate scan. Please try again.');
    } finally {
      setKillingScanIds((prev) => {
        const next = new Set(prev);
        next.delete(scanId);
        return next;
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'FAILED':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'RUNNING':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'PENDING':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'text-green-500';
      case 'FAILED':
        return 'text-red-500';
      case 'RUNNING':
        return 'text-blue-500';
      case 'PENDING':
        return 'text-yellow-500';
      default:
        return 'text-gray-500';
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const filteredScans = scans.filter((scan) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      scan.name.toLowerCase().includes(searchLower) ||
      scan.asset?.name?.toLowerCase().includes(searchLower) ||
      scan.asset?.hostname?.toLowerCase().includes(searchLower) ||
      scan.asset?.ipAddress?.toLowerCase().includes(searchLower)
    );
  });

  const activeScans = filteredScans.filter(
    (scan) => scan.status === 'RUNNING' || scan.status === 'PENDING'
  );
  const completedScans = filteredScans.filter((scan) => scan.status === 'COMPLETED');
  const failedScans = filteredScans.filter((scan) => scan.status === 'FAILED');

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Vulnerability Scans</h1>
          <p className="text-gray-400">Monitor and manage your security scans</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchScans}
            className="btn-secondary px-4 py-2 flex items-center space-x-2"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowBulkScanModal(true)}
            className="btn-secondary px-4 py-2 flex items-center space-x-2"
          >
            <Layers className="w-4 h-4" />
            <span>Bulk Scan</span>
          </button>
          <button
            onClick={() => setShowScanModal(true)}
            className="btn-premium px-4 py-2 flex items-center space-x-2"
          >
            <Target className="w-4 h-4" />
            <span>New Scan</span>
          </button>
        </div>
      </div>

      {/* Scan Started Notification */}
      {scanStartedNotification && (
        <div className="glass-panel p-4 bg-green-500/10 border-green-500/30 animate-slide-down" role="status" aria-live="polite">
          <div className="flex items-center space-x-3">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <div className="flex-1">
              <p className="text-green-400 font-semibold">Scan started successfully!</p>
              <p className="text-green-400/80 text-sm">Your scan is now running. Watch progress below in Active Scans.</p>
            </div>
            <button
              onClick={() => setScanStartedNotification(false)}
              className="text-green-400 hover:text-green-300 p-1"
              aria-label="Dismiss notification"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Bulk Scan Started Notification */}
      {bulkScanStartedNotification && (
        <div className="glass-panel p-4 bg-blue-500/10 border-blue-500/30 animate-slide-down">
          <div className="flex items-center space-x-3">
            <Layers className="w-5 h-5 text-blue-400" />
            <div className="flex-1">
              <p className="text-blue-400 font-semibold">Bulk scan initiated successfully!</p>
              <p className="text-blue-400/80 text-sm">Multiple scans are now running in the background. Results will appear below as they complete.</p>
            </div>
            <button
              onClick={() => setBulkScanStartedNotification(false)}
              className="text-blue-400 hover:text-blue-300 p-1"
              aria-label="Dismiss notification"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Bulk Scan Real-time Progress */}
      {isBulkScanRunning && bulkProgress && (
        <div className="glass-panel p-6 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/30">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Layers className="w-6 h-6 text-purple-400 animate-pulse" />
                <div>
                  <h3 className="text-white font-semibold text-lg">Bulk Scan In Progress</h3>
                  <p className="text-gray-400 text-sm">
                    Batch {bulkProgress.currentBatch} of {bulkProgress.totalBatches}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4 text-sm">
                <div className="text-center">
                  <p className="text-green-400 font-bold text-2xl">{bulkProgress.completed}</p>
                  <p className="text-gray-400">Completed</p>
                </div>
                <div className="text-center">
                  <p className="text-blue-400 font-bold text-2xl">{bulkProgress.inProgress}</p>
                  <p className="text-gray-400">Running</p>
                </div>
                <div className="text-center">
                  <p className="text-red-400 font-bold text-2xl">{bulkProgress.failed}</p>
                  <p className="text-gray-400">Failed</p>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  Overall Progress: {bulkProgress.completed + bulkProgress.failed} / {bulkProgress.totalTargets}
                </span>
                <span className="text-white font-semibold">
                  {Math.round(((bulkProgress.completed + bulkProgress.failed) / bulkProgress.totalTargets) * 100)}%
                </span>
              </div>
              <div className="w-full bg-background-elevated rounded-full h-3 overflow-hidden">
                <div className="h-full flex">
                  <div
                    className="bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
                    style={{
                      width: `${(bulkProgress.completed / bulkProgress.totalTargets) * 100}%`,
                    }}
                  />
                  <div
                    className="bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 animate-pulse"
                    style={{
                      width: `${(bulkProgress.inProgress / bulkProgress.totalTargets) * 100}%`,
                    }}
                  />
                  <div
                    className="bg-gradient-to-r from-red-500 to-red-600 transition-all duration-500"
                    style={{
                      width: `${(bulkProgress.failed / bulkProgress.totalTargets) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Recent Scans */}
            {bulkProgress.recentScans.length > 0 && (
              <div className="space-y-2">
                <p className="text-gray-400 text-sm font-semibold">Recent Targets:</p>
                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                  {bulkProgress.recentScans.slice(-5).reverse().map((scan, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-background-elevated/50 rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        {scan.status === 'completed' && (
                          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                        )}
                        {scan.status === 'failed' && (
                          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                        {scan.status === 'running' && (
                          <Clock className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                        )}
                        <span className="text-white text-sm truncate">{scan.target}</span>
                      </div>
                      {scan.error && (
                        <span className="text-red-400 text-xs ml-2 flex-shrink-0">{scan.error}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="glass-panel p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search scans by name or target..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10 w-full"
          />
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-gray-400 text-sm mb-1">Total Scans</p>
          <p className="text-3xl font-bold text-white">{scans.length}</p>
        </div>
        <div className="stat-card bg-blue-500/10 border-blue-500/30">
          <p className="text-blue-400 text-sm mb-1">Active Scans</p>
          <p className="text-3xl font-bold text-blue-400">{activeScans.length}</p>
        </div>
        <div className="stat-card bg-green-500/10 border-green-500/30">
          <p className="text-green-400 text-sm mb-1">Completed</p>
          <p className="text-3xl font-bold text-green-400">{completedScans.length}</p>
        </div>
        <div className="stat-card bg-red-500/10 border-red-500/30">
          <p className="text-red-400 text-sm mb-1">Failed</p>
          <p className="text-3xl font-bold text-red-400">{failedScans.length}</p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="glass-panel p-4 bg-red-500/10 border-red-500/30" role="alert" aria-live="polite">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Active Scans */}
      {activeScans.length > 0 && (
        <div className="glass-panel p-6 border-blue-500/30 bg-blue-500/5">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Active Scans</h2>
              <p className="text-blue-400 text-sm">{activeScans.length} scan{activeScans.length !== 1 ? 's' : ''} running</p>
            </div>
          </div>
          <div className="space-y-3">
            {activeScans.map((scan) => (
              <div
                key={scan.id}
                className="p-4 bg-dark-200 rounded-lg border border-blue-500/30 hover:border-blue-500/50 transition-colors cursor-pointer"
                onClick={() => router.push(`/dashboard/scans/${scan.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/dashboard/scans/${scan.id}`) }}}
                tabIndex={0}
                role="button"
                aria-label={`View scan: ${scan.name} - ${scan.status}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(scan.status)}
                    <div>
                      <h3 className="text-white font-semibold">{scan.name}</h3>
                      <p className="text-gray-400 text-sm">
                        {scan.asset?.hostname || scan.asset?.ipAddress || scan.asset?.name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={(e) => handleKillScan(e, scan.id)}
                      disabled={killingScanIds.has(scan.id)}
                      className="px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center space-x-2 text-xs font-semibold transition-colors"
                    >
                      {killingScanIds.has(scan.id) ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                      <span>{killingScanIds.has(scan.id) ? 'Killing...' : 'Kill Scan'}</span>
                    </button>
                    <span className={`text-sm font-semibold ${getStatusColor(scan.status)}`}>
                      {scan.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-400">Started: {formatDate(scan.startedAt)}</span>
                  <span className="text-gray-400">{scan.type}</span>
                </div>
                {(scan.status === 'RUNNING' || scan.status === 'PENDING') && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-400">
                        {scan.status === 'PENDING' ? 'Initializing...' : (scan.currentPhase || 'Scanning...')}
                      </span>
                      <span className="text-xs font-semibold text-blue-400">{scan.progress || 0}%</span>
                    </div>
                    <div className="h-1.5 bg-dark-300 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${scan.progress || 0}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Scans */}
      <div className="glass-panel p-6">
        <h2 className="text-xl font-bold text-white mb-4">Recent Scans</h2>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-accent-primary animate-spin" />
          </div>
        ) : filteredScans.length === 0 ? (
          <div className="text-center py-12">
            <Target className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Scans Yet</h3>
            <p className="text-gray-400 mb-4">Start your first vulnerability scan to see results here</p>
            <button
              onClick={() => setShowScanModal(true)}
              className="btn-premium px-4 py-2"
            >
              Start New Scan
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredScans.map((scan) => (
              <div
                key={scan.id}
                className="p-4 bg-dark-200 rounded-lg border border-dark-300 hover:border-accent-primary/50 transition-colors cursor-pointer"
                onClick={() => router.push(`/dashboard/scans/${scan.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/dashboard/scans/${scan.id}`) }}}
                tabIndex={0}
                role="button"
                aria-label={`View scan: ${scan.name} - ${scan.status}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(scan.status)}
                    <div>
                      <h3 className="text-white font-semibold">{scan.name}</h3>
                      <p className="text-gray-400 text-sm">
                        {scan.asset?.hostname || scan.asset?.ipAddress || scan.asset?.name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {scan.status === 'COMPLETED' && (
                      <div className="flex items-center space-x-2 text-sm">
                        {scan.criticalCount > 0 && (
                          <span className="px-2 py-1 rounded bg-purple-500/20 text-purple-400 font-semibold">
                            {scan.criticalCount} Critical
                          </span>
                        )}
                        {scan.highCount > 0 && (
                          <span className="px-2 py-1 rounded bg-red-500/20 text-red-400 font-semibold">
                            {scan.highCount} High
                          </span>
                        )}
                        {scan.vulnFound === 0 && (
                          <span className="px-2 py-1 rounded bg-green-500/20 text-green-400 font-semibold">
                            No Issues
                          </span>
                        )}
                      </div>
                    )}
                    <span className={`text-sm font-semibold ${getStatusColor(scan.status)}`}>
                      {scan.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Started: {formatDate(scan.startedAt)}</span>
                  <div className="flex items-center space-x-4 text-gray-400">
                    {scan.completedAt && (
                      <span>Completed: {formatDate(scan.completedAt)}</span>
                    )}
                    <span>{scan.type}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Scan Modal */}
      <NewScanModal
        isOpen={showScanModal}
        onClose={() => setShowScanModal(false)}
        onScanStarted={handleScanStarted}
      />

      {/* Bulk Scan Modal */}
      <BulkScanModal
        isOpen={showBulkScanModal}
        onClose={() => setShowBulkScanModal(false)}
        onScanStarted={handleBulkScanStarted}
      />
    </div>
  );
}
