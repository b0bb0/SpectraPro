'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, Wifi, WifiOff, Square } from 'lucide-react';
import { scansAPI } from '@/lib/api';
import { useScanUpdates } from '@/hooks/useWebSocket';
import EvidenceGraph from '@/components/EvidenceGraph';

interface Vulnerability {
  id: string;
  title: string;
  description: string;
  severity: string;
  cvssScore: number;
  cveId: string;
  status: string;
  firstSeen: string;
}

interface Scan {
  id: string;
  name: string;
  type: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  progress: number;
  currentPhase?: string;
  templatesTotal?: number;
  templatesRun?: number;
  vulnFound: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  errorMessage?: string;
  assets?: {
    id: string;
    name: string;
    hostname?: string;
    ipAddress?: string;
  };
  vulnerabilities?: Vulnerability[];
}

export default function ScanDetailsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [killLoading, setKillLoading] = useState(false);
  const [killError, setKillError] = useState('');

  // WebSocket for real-time updates
  const { scanProgress, scanStatus, isConnected } = useScanUpdates(params.id);
  const fetchInFlightRef = useRef(false);
  const prevVulnFoundRef = useRef(0);
  const isActiveRef = useRef(true);

  const fetchScanDetails = async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const data = await scansAPI.getById(params.id);
      setScan(data);
      prevVulnFoundRef.current = data.vulnFound || 0;
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load scan details');
      setScan(null);
    } finally {
      setLoading(false);
      fetchInFlightRef.current = false;
    }
  };

  // Update active ref without triggering effect re-runs
  isActiveRef.current = !scan?.status || scan.status === 'RUNNING' || scan.status === 'PENDING';

  useEffect(() => {
    fetchScanDetails();

    // Poll every 10s while scan is active, 30s otherwise
    const interval = setInterval(() => {
      fetchScanDetails();
    }, isActiveRef.current ? 10000 : 30000);

    return () => clearInterval(interval);
  }, [params.id]);

  // Update scan state from WebSocket events
  useEffect(() => {
    if (scanProgress && scan) {
      const newVulnFound = scanProgress.vulnFound ?? scan.vulnFound;
      setScan(prev => prev ? {
        ...prev,
        progress: scanProgress.progress,
        currentPhase: scanProgress.currentPhase,
        status: scanProgress.status,
        vulnFound: newVulnFound,
      } : prev);

      // Re-fetch full details when new vulnerabilities are found
      if (newVulnFound > prevVulnFoundRef.current) {
        prevVulnFoundRef.current = newVulnFound;
        fetchScanDetails();
      }
    }
  }, [scanProgress]);

  // Refresh full scan details when scan completes via WebSocket
  useEffect(() => {
    if (scanStatus === 'COMPLETED' || scanStatus === 'FAILED') {
      fetchScanDetails();
    }
  }, [scanStatus]);

  const handleKillScan = async () => {
    if (!scan || killLoading) return;

    setKillError('');
    setKillLoading(true);
    try {
      await scansAPI.kill(scan.id);
      await fetchScanDetails();
    } catch (err: any) {
      setKillError(err.message || 'Failed to terminate scan');
    } finally {
      setKillLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'FAILED':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'RUNNING':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'PENDING':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
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

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'high':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'medium':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'low':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'informational':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const calculateDuration = () => {
    if (!scan?.startedAt) return null;

    const start = new Date(scan.startedAt).getTime();
    const end = scan.completedAt ? new Date(scan.completedAt).getTime() : Date.now();
    const duration = Math.floor((end - start) / 1000);

    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="p-8">
        <div className="glass-panel p-6 text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Error Loading Scan</h2>
          <p className="text-gray-400 mb-4">{error || 'Scan not found'}</p>
          <button
            onClick={() => router.push('/dashboard/scans')}
            className="btn-secondary px-4 py-2"
          >
            Back to Scans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.push('/dashboard/scans')}
            className="btn-secondary p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{scan.name}</h1>
            <p className="text-gray-400">
              Target: {scan.assets?.hostname || scan.assets?.ipAddress || scan.assets?.name}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {/* WebSocket Status Indicator */}
          {(scan.status === 'RUNNING' || scan.status === 'PENDING') && (
            <div className="flex items-center space-x-2 px-3 py-2 glass rounded-lg">
              {isConnected ? (
                <>
                  <Wifi className="w-4 h-4 text-green-400" />
                  <span className="text-green-400 text-sm font-medium">Live Updates</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-400 text-sm font-medium">Polling</span>
                </>
              )}
            </div>
          )}
          {(scan.status === 'RUNNING' || scan.status === 'PENDING') && (
            <button
              onClick={handleKillScan}
              disabled={killLoading}
              className="px-4 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors"
            >
              {killLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              <span>{killLoading ? 'Killing...' : 'Kill Scan'}</span>
            </button>
          )}
          <button
            onClick={fetchScanDetails}
            className="btn-secondary px-4 py-2 flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Status Card */}
      <div className="glass-panel p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <p className="text-gray-400 text-sm mb-2">Status</p>
            <div className="flex items-center space-x-2">
              {getStatusIcon(scan.status)}
              <span className={`text-lg font-semibold ${getStatusColor(scan.status)}`}>
                {scan.status}
              </span>
            </div>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-2">Scanner</p>
            <p className="text-white font-semibold">{scan.type}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-2">Started</p>
            <p className="text-white font-semibold">{formatDate(scan.startedAt)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-2">Duration</p>
            <p className="text-white font-semibold">{calculateDuration()}</p>
          </div>
        </div>

        {(scan.status === 'RUNNING' || scan.status === 'PENDING') && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-3">
                <span className="text-sm font-medium text-gray-300">
                  {scan.currentPhase || 'Initializing scan'}
                </span>
                {scan.vulnFound > 0 && (
                  <span className="px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-semibold">
                    {scan.vulnFound} {scan.vulnFound === 1 ? 'vulnerability' : 'vulnerabilities'} found
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-3">
                {isConnected && (scan.status === 'RUNNING' || scan.status === 'PENDING') && (
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                    <span className="text-xs text-green-400">Real-time</span>
                  </div>
                )}
                <span className="text-lg font-bold text-accent-primary">
                  {scan.progress || 0}%
                </span>
              </div>
            </div>
            <div className="h-3 bg-dark-300 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent-primary to-accent-secondary transition-all duration-500 ease-out"
                style={{ width: `${scan.progress || 0}%` }}
              >
                <div className="h-full w-full animate-pulse bg-white/10"></div>
              </div>
            </div>
          </div>
        )}

        {scan.errorMessage && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{scan.errorMessage}</p>
          </div>
        )}

        {killError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{killError}</p>
          </div>
        )}
      </div>

      {/* Vulnerabilities Summary */}
      <div className="glass-panel p-6">
        <h2 className="text-xl font-bold text-white mb-4">Vulnerabilities Found</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="stat-card bg-purple-500/10 border-purple-500/30">
            <p className="text-purple-400 text-sm mb-1">Critical</p>
            <p className="text-3xl font-bold text-purple-400">{scan.criticalCount || 0}</p>
          </div>
          <div className="stat-card bg-red-500/10 border-red-500/30">
            <p className="text-red-400 text-sm mb-1">High</p>
            <p className="text-3xl font-bold text-red-400">{scan.highCount || 0}</p>
          </div>
          <div className="stat-card bg-orange-500/10 border-orange-500/30">
            <p className="text-orange-400 text-sm mb-1">Medium</p>
            <p className="text-3xl font-bold text-orange-400">{scan.mediumCount || 0}</p>
          </div>
          <div className="stat-card bg-yellow-500/10 border-yellow-500/30">
            <p className="text-yellow-400 text-sm mb-1">Low</p>
            <p className="text-3xl font-bold text-yellow-400">{scan.lowCount || 0}</p>
          </div>
          <div className="stat-card bg-blue-500/10 border-blue-500/30">
            <p className="text-blue-400 text-sm mb-1">Info</p>
            <p className="text-3xl font-bold text-blue-400">{scan.infoCount || 0}</p>
          </div>
        </div>
      </div>

      {/* Evidence Graph */}
      {scan.vulnerabilities && scan.vulnerabilities.length > 0 && (
        <EvidenceGraph
          target={scan.assets?.hostname || scan.assets?.ipAddress || scan.assets?.name || 'target'}
          vulnerabilities={scan.vulnerabilities}
          onNodeClick={(vulnId) => router.push(`/dashboard/vulnerabilities/${vulnId}?returnTo=${encodeURIComponent(`/dashboard/scans/${scan.id}`)}`)}
        />
      )}

      {/* Vulnerabilities List */}
      {scan.vulnerabilities && scan.vulnerabilities.length > 0 && (
        <div className="glass-panel p-6">
          <h2 className="text-xl font-bold text-white mb-4">Vulnerability Details</h2>
          <div className="space-y-3">
            {scan.vulnerabilities.map((vuln) => (
              <div
                key={vuln.id}
                className="p-4 bg-dark-200 rounded-lg border border-dark-300 hover:border-accent-primary/50 transition-colors cursor-pointer"
                onClick={() => router.push(`/dashboard/vulnerabilities/${vuln.id}?returnTo=${encodeURIComponent(`/dashboard/scans/${scan.id}`)}`)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold border ${getSeverityColor(vuln.severity)}`}>
                        {vuln.severity.toUpperCase()}
                      </span>
                      <span className="text-gray-400 text-sm">{vuln.cveId}</span>
                      <span className="text-gray-500 text-sm">CVSS: {vuln.cvssScore}</span>
                    </div>
                    <h3 className="text-white font-semibold mb-1">{vuln.title}</h3>
                    <p className="text-gray-400 text-sm line-clamp-2">{vuln.description}</p>
                  </div>
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {scan.status === 'COMPLETED' && (!scan.vulnerabilities || scan.vulnerabilities.length === 0) && (
        <div className="glass-panel p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No Vulnerabilities Found</h3>
          <p className="text-gray-400">The scan completed successfully with no vulnerabilities detected.</p>
        </div>
      )}
    </div>
  );
}
