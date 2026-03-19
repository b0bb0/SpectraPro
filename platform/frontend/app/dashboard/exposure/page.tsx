'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Globe,
  Play,
  RefreshCw,
  Trash2,
  CheckCircle,
  XCircle,
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
  Network,
  AlertCircle,
  Square,
} from 'lucide-react';
import { toast } from 'sonner';
import { exposureAPI } from '@/lib/api';

interface Subdomain {
  id: string;
  subdomain: string;
  isActive: boolean;
  protocol?: string;
  ipAddress?: string;
  statusCode?: number;
  responseTime?: number;
  screenshotUrl?: string;
  screenshotCapturedAt?: string;
}

interface ExposureScan {
  id: string;
  rootDomain: string;
  status: string;
  progress: number;
  currentPhase?: string;
  totalSubdomains: number;
  activeSubdomains: number;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  errorMessage?: string;
  subdomains?: Subdomain[];
  createdAt: string;
}

export default function ExposurePage() {
  const router = useRouter();
  const [domain, setDomain] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [activeScan, setActiveScan] = useState<ExposureScan | null>(null);
  const [scans, setScans] = useState<ExposureScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [killing, setKilling] = useState(false);
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  useEffect(() => {
    fetchScans();
  }, []);

  useEffect(() => {
    // Poll active scan
    if (activeScan && ['PENDING', 'ENUMERATING', 'DETECTING', 'CAPTURING'].includes(activeScan.status)) {
      const interval = setInterval(() => {
        refreshActiveScan();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [activeScan]);

  useEffect(() => {
    if (!activeScan?.status) return;
    if (activeScan.status !== lastStatus) {
      if (activeScan.status === 'COMPLETED') {
        toast.success('Exposure scan completed', { description: activeScan.rootDomain });
      } else if (activeScan.status === 'FAILED') {
        toast.error('Exposure scan failed', { description: activeScan.errorMessage || activeScan.rootDomain });
      }
      setLastStatus(activeScan.status);
    }
  }, [activeScan?.status, activeScan?.rootDomain, activeScan?.errorMessage, lastStatus]);

  const fetchScans = async () => {
    try {
      const data = await exposureAPI.listScans(20);
      setScans(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load scans');
    } finally {
      setLoading(false);
    }
  };

  const refreshActiveScan = async () => {
    if (!activeScan) return;

    try {
      const data = await exposureAPI.getScan(activeScan.id);
      setActiveScan(data);

      if (data.status === 'COMPLETED' || data.status === 'FAILED') {
        setIsScanning(false);
        fetchScans();
      }
    } catch (err: any) {
      console.error('Failed to refresh scan:', err);
    }
  };

  const handleStartScan = async () => {
    if (!domain.trim()) {
      setError('Please enter a domain');
      return;
    }

    setIsScanning(true);
    setError('');

    try {
      const result = await exposureAPI.enumerate(domain);

      // Start polling
      const scanId = result.scanId;
      const scanData = await exposureAPI.getScan(scanId);
      setActiveScan(scanData);
      setDomain('');

    } catch (err: any) {
      setError(err.message || 'Failed to start scan');
      setIsScanning(false);
    }
  };

  const handleKillActiveScan = async () => {
    if (!activeScan) return;
    setKilling(true);
    setError('');
    try {
      await exposureAPI.killScan(activeScan.id);
      setActiveScan(null);
      setIsScanning(false);
      fetchScans();
    } catch (err: any) {
      setError(err.message || 'Failed to kill scan');
    } finally {
      setKilling(false);
    }
  };

  const handleDeleteScan = async (scanId: string) => {
    if (!confirm('Are you sure you want to delete this scan?')) {
      return;
    }

    try {
      await exposureAPI.deleteScan(scanId);
      setScans(scans.filter(s => s.id !== scanId));
      if (activeScan?.id === scanId) {
        setActiveScan(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete scan');
    }
  };

  const handleViewScan = async (scanId: string) => {
    try {
      const data = await exposureAPI.getScan(scanId);
      setActiveScan(data);
      setExpandedNodes(new Set([data.rootDomain]));
    } catch (err: any) {
      setError(err.message || 'Failed to load scan');
    }
  };

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: 'text-blue-400',
      ENUMERATING: 'text-yellow-400',
      DETECTING: 'text-orange-400',
      CAPTURING: 'text-purple-400',
      COMPLETED: 'text-green-400',
      FAILED: 'text-red-400',
    };
    return colors[status] || 'text-gray-400';
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      PENDING: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      ENUMERATING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      DETECTING: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      CAPTURING: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      COMPLETED: 'bg-green-500/20 text-green-400 border-green-500/30',
      FAILED: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return badges[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-cyan-500/20 rounded-lg flex items-center justify-center">
            <Network className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Exposure Mapping</h1>
            <p className="text-gray-400 text-sm">Discover and visualize subdomain attack surface</p>
          </div>
        </div>
        <button onClick={fetchScans} className="btn-secondary px-4 py-2 flex items-center space-x-2">
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* New Scan Form */}
      <div className="glass-panel p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Start New Enumeration</h2>
        <div className="flex space-x-4">
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleStartScan()}
            placeholder="Enter domain (e.g., example.com)"
            className="flex-1 bg-dark-200 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
            disabled={isScanning}
          />
          <button
            onClick={handleStartScan}
            disabled={isScanning || !domain.trim()}
            className="btn-premium px-6 py-3 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Scanning...</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                <span>Enumerate</span>
              </>
            )}
          </button>
        </div>
        {error && (
          <div className="mt-3 flex items-center space-x-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Active Scan Progress */}
      {activeScan && (
        <div className="glass-panel p-6 border-cyan-500/30 bg-cyan-500/5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">{activeScan.rootDomain}</h2>
              <div className="flex items-center space-x-2 mt-1">
                <span className={`inline-block px-3 py-1 rounded text-sm font-semibold border ${getStatusBadge(activeScan.status)}`}>
                  {activeScan.status}
                </span>
                {activeScan.currentPhase && (
                  <span className="text-gray-400 text-sm">{activeScan.currentPhase}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-2xl font-bold text-white">{activeScan.progress}%</div>
                <div className="text-sm text-gray-400">
                  {activeScan.totalSubdomains} total • {activeScan.activeSubdomains} active
                </div>
              </div>
              <button
                onClick={handleKillActiveScan}
                disabled={killing || activeScan.status === 'COMPLETED' || activeScan.status === 'FAILED'}
                className="px-4 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center space-x-2 text-sm font-semibold transition-colors"
              >
                {killing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                <span>{killing ? 'Killing...' : 'Kill Scan'}</span>
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-dark-300 rounded-full h-2 mb-4">
            <div
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${activeScan.progress}%` }}
            />
          </div>

          {/* Error Message */}
          {activeScan.errorMessage && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {activeScan.errorMessage}
            </div>
          )}

          {/* Tree Visualization */}
          {activeScan.status === 'COMPLETED' && activeScan.subdomains && activeScan.subdomains.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                <Globe className="w-5 h-5 text-cyan-400" />
                <span>Subdomain Tree</span>
              </h3>

              {/* Root Node */}
              <div className="space-y-2">
                <div
                  className="flex items-center space-x-2 p-3 bg-dark-200 rounded-lg cursor-pointer hover:bg-dark-100 transition-colors"
                  onClick={() => toggleNode(activeScan.rootDomain)}
                >
                  {expandedNodes.has(activeScan.rootDomain) ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                  <Globe className="w-5 h-5 text-cyan-400" />
                  <span className="font-semibold text-white">{activeScan.rootDomain}</span>
                  <span className="text-xs text-gray-400">
                    ({activeScan.activeSubdomains} active / {activeScan.totalSubdomains} total)
                  </span>
                </div>

                {/* Subdomains */}
                {expandedNodes.has(activeScan.rootDomain) && (
                  <div className="ml-8 space-y-2 border-l-2 border-gray-700 pl-4">
                    {activeScan.subdomains.map((subdomain) => (
                      <div
                        key={subdomain.id}
                        className={`p-3 rounded-lg ${
                          subdomain.isActive
                            ? 'bg-green-500/10 border border-green-500/30'
                            : 'bg-gray-500/10 border border-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            {subdomain.isActive ? (
                              <CheckCircle className="w-5 h-5 text-green-400" />
                            ) : (
                              <XCircle className="w-5 h-5 text-gray-500" />
                            )}
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className={`font-mono text-sm ${subdomain.isActive ? 'text-white' : 'text-gray-500'}`}>
                                  {subdomain.subdomain}
                                </span>
                                {subdomain.protocol && (
                                  <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                    {subdomain.protocol}
                                  </span>
                                )}
                                {subdomain.statusCode && (
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                    subdomain.statusCode < 300 ? 'bg-green-500/20 text-green-400' :
                                    subdomain.statusCode < 400 ? 'bg-yellow-500/20 text-yellow-400' :
                                    'bg-red-500/20 text-red-400'
                                  }`}>
                                    {subdomain.statusCode}
                                  </span>
                                )}
                              </div>
                              {subdomain.ipAddress && (
                                <div className="text-xs text-gray-400 mt-1">
                                  IP: {subdomain.ipAddress}
                                  {subdomain.responseTime && ` • ${subdomain.responseTime}ms`}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Screenshot */}
                          {subdomain.screenshotUrl && (
                            <button
                              onClick={() => setSelectedScreenshot(subdomain.screenshotUrl!)}
                              className="flex items-center space-x-2 px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors"
                            >
                              <ImageIcon className="w-4 h-4" />
                              <span className="text-xs">View</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Scans */}
      <div className="glass-panel p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Scans</h2>
        {loading ? (
          <div className="text-center py-8">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-400">Loading scans...</p>
          </div>
        ) : scans.length === 0 ? (
          <div className="text-center py-12">
            <Globe className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No scans yet. Start your first enumeration above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scans.map((scan) => (
              <div
                key={scan.id}
                className="flex items-center justify-between p-4 bg-dark-200 rounded-lg hover:bg-dark-100 transition-colors cursor-pointer"
                onClick={() => handleViewScan(scan.id)}
              >
                <div className="flex items-center space-x-4">
                  <Globe className="w-5 h-5 text-cyan-400" />
                  <div>
                    <div className="font-semibold text-white">{scan.rootDomain}</div>
                    <div className="text-sm text-gray-400">
                      {scan.totalSubdomains} subdomains • {scan.activeSubdomains} active
                      {scan.duration && ` • ${scan.duration}s`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className={`inline-block px-3 py-1 rounded text-sm font-semibold border ${getStatusBadge(scan.status)}`}>
                    {scan.status}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteScan(scan.id);
                    }}
                    className="p-2 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Screenshot Modal */}
      {selectedScreenshot && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
          onClick={() => setSelectedScreenshot(null)}
        >
          <div className="relative max-w-6xl max-h-full">
            <button
              onClick={() => setSelectedScreenshot(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300"
            >
              <XCircle className="w-8 h-8" />
            </button>
            <img
              src={selectedScreenshot}
              alt="Screenshot"
              className="max-w-full max-h-full rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
