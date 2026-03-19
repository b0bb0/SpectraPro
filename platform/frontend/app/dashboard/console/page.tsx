'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Terminal, Play, Trash2, Download, AlertCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { API_URL } from '@/lib/api';

interface ScanLog {
  id: string;
  scanId: string;
  scanName: string;
  command: string;
  output: string[];
  status: string;
  startedAt: string;
  completedAt?: string;
}

export default function ConsolePage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { lastEvent, isConnected } = useWebSocket();

  const isAdmin = user?.role === 'ADMIN';

  /**
   * Fetch console logs from backend.
   * Uses two strategies:
   * 1. Primary: GET /api/console/logs (in-memory logs + DB fallback)
   * 2. Fallback: GET /api/scans (if primary returns empty, synthesize logs from scan records)
   */
  const fetchLogs = useCallback(async () => {
    try {
      // Strategy 1: Console logs endpoint (has real-time output)
      const consoleRes = await fetch(`${API_URL}/api/console/logs`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (consoleRes.ok) {
        const consoleData = await consoleRes.json();
        if (consoleData.success && consoleData.data?.length > 0) {
          setLogs(consoleData.data);
          setError(null);

          if (!selectedLog) {
            const runningLog = consoleData.data.find((log: ScanLog) => log.status === 'RUNNING');
            setSelectedLog(runningLog?.id || consoleData.data[0].id);
          }
          return;
        }
      }

      // Strategy 2: Fall back to scans endpoint (always has DB data)
      const scansRes = await fetch(`${API_URL}/api/scans`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (scansRes.ok) {
        const scansData = await scansRes.json();
        const scans = scansData.success ? scansData.data : scansData;

        if (Array.isArray(scans) && scans.length > 0) {
          // Convert scan records to console log format
          const scanLogs: ScanLog[] = scans
            .filter((scan: any) => ['RUNNING', 'COMPLETED', 'FAILED'].includes(scan.status))
            .slice(0, 50)
            .map((scan: any) => ({
              id: scan.id,
              scanId: scan.id,
              scanName: scan.name || 'Scan',
              command: `nuclei -target ${scan.assets?.url || scan.assets?.hostname || 'unknown'} -profile ${scan.scanProfile || 'BALANCED'}`,
              output: buildOutputFromScan(scan),
              status: scan.status,
              startedAt: scan.startedAt || scan.createdAt,
              completedAt: scan.completedAt,
            }));

          setLogs(scanLogs);
          setError(null);

          if (!selectedLog && scanLogs.length > 0) {
            const runningLog = scanLogs.find((log) => log.status === 'RUNNING');
            setSelectedLog(runningLog?.id || scanLogs[0].id);
          }
          return;
        }
      }

      // Both strategies returned no data
      setLogs([]);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      setError('Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  }, [selectedLog]);

  // Build synthetic console output from a scan record
  function buildOutputFromScan(scan: any): string[] {
    const lines: string[] = [];
    const target = scan.assets?.url || scan.assets?.hostname || 'unknown';

    lines.push(`$ nuclei -target ${target} -profile ${scan.scanProfile || 'BALANCED'}`);
    lines.push(`[${new Date(scan.startedAt || scan.createdAt).toISOString()}] Starting scan...`);

    if (scan.currentPhase) {
      lines.push(`[INFO] Current phase: ${scan.currentPhase}`);
    }

    if (scan.progress != null && scan.progress > 0) {
      lines.push(`[INFO] Progress: ${scan.progress}%`);
    }

    if (scan.vulnFound != null && scan.vulnFound > 0) {
      lines.push(`[INFO] Vulnerabilities found: ${scan.vulnFound} (Critical: ${scan.criticalCount || 0}, High: ${scan.highCount || 0}, Medium: ${scan.mediumCount || 0}, Low: ${scan.lowCount || 0})`);
    }

    if (scan.errorMessage) {
      lines.push(`[ERROR] ${scan.errorMessage}`);
    }

    if (scan.status === 'COMPLETED') {
      lines.push(`[${new Date(scan.completedAt).toISOString()}] ✓ Scan completed successfully`);
    } else if (scan.status === 'FAILED') {
      lines.push(`[${scan.completedAt ? new Date(scan.completedAt).toISOString() : 'unknown'}] ✗ Scan failed`);
    } else if (scan.status === 'RUNNING') {
      lines.push('[INFO] Scan is running...');
    }

    return lines;
  }

  useEffect(() => {
    if (isAdmin) {
      fetchLogs();
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, fetchLogs]);

  // Handle WebSocket events for real-time updates
  useEffect(() => {
    if (!lastEvent) return;

    if (lastEvent.type === 'scan_progress' || lastEvent.type === 'scan_completed' || lastEvent.type === 'scan_started') {
      fetchLogs();
    }
  }, [lastEvent, fetchLogs]);

  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, selectedLog, autoScroll]);

  const clearLogs = async () => {
    if (!confirm('Are you sure you want to clear all console logs?')) return;

    try {
      const response = await fetch(`${API_URL}/api/console/logs`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (response.ok) {
        setLogs([]);
        setSelectedLog(null);
      }
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  const downloadLog = () => {
    const log = logs.find(l => l.id === selectedLog);
    if (!log) return;

    const content = `Scan: ${log.scanName}\nCommand: ${log.command}\nStarted: ${log.startedAt}\nCompleted: ${log.completedAt || 'In Progress'}\n\n${log.output.join('\n')}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-log-${log.scanId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="glass-panel p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400">Only administrators can access the Console.</p>
        </div>
      </div>
    );
  }

  const selectedLogData = logs.find(l => l.id === selectedLog);

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-6 h-6 text-white" />
            </div>
            <span>System Console</span>
          </h1>
          <p className="text-gray-400">Real-time Nuclei scan output and system logs</p>
        </div>
        <div className="flex items-center space-x-3">
          {/* WebSocket status indicator */}
          <div className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-dark-200">
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-green-400" />
                <span className="text-xs text-green-400">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-500">Polling</span>
              </>
            )}
          </div>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`btn-secondary px-4 py-2 ${autoScroll ? 'bg-green-500/20 border-green-500/30' : ''}`}
          >
            Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
          </button>
          <button onClick={downloadLog} className="btn-secondary px-4 py-2 flex items-center space-x-2" disabled={!selectedLog}>
            <Download className="w-4 h-4" />
            <span>Download</span>
          </button>
          <button onClick={clearLogs} className="btn-secondary px-4 py-2 flex items-center space-x-2">
            <Trash2 className="w-4 h-4" />
            <span>Clear Logs</span>
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
          <button onClick={fetchLogs} className="text-red-400 hover:text-red-300">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar - Scan List */}
        <div className="col-span-3">
          <div className="glass-panel p-4 space-y-2">
            <h3 className="text-sm font-semibold text-white mb-3">Active Scans</h3>
            {loading ? (
              <div className="text-center text-gray-500 py-8">Loading...</div>
            ) : logs.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No scans running</p>
              </div>
            ) : (
              logs.map((log) => (
                <button
                  key={log.id}
                  onClick={() => setSelectedLog(log.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedLog === log.id
                      ? 'bg-green-500/20 border-2 border-green-500/50'
                      : 'bg-dark-200 hover:bg-dark-100 border-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    {log.status === 'RUNNING' ? (
                      <Play className="w-3 h-3 text-green-400 animate-pulse" />
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-gray-500" />
                    )}
                    <span className="text-white text-sm font-medium truncate">
                      {log.scanName}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{new Date(log.startedAt).toLocaleTimeString()}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {log.output.length} lines
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Terminal Output */}
        <div className="col-span-9">
          <div className="glass-panel overflow-hidden" style={{ height: '700px' }}>
            {/* Terminal Header */}
            <div className="bg-dark-300 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="ml-4 text-sm text-gray-400 font-mono">
                  {selectedLogData?.scanName || 'No scan selected'}
                </span>
              </div>
              {selectedLogData?.status === 'RUNNING' && (
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                  <span className="text-xs text-green-400 font-mono">RUNNING</span>
                </div>
              )}
            </div>

            {/* Terminal Body */}
            <div
              ref={terminalRef}
              className="p-4 font-mono text-sm overflow-y-auto bg-black"
              style={{ height: 'calc(100% - 48px)' }}
            >
              {!selectedLogData ? (
                <div className="text-gray-500 text-center py-20">
                  <Terminal className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p>Select a scan from the sidebar to view output</p>
                </div>
              ) : (
                <>
                  {/* Command Line */}
                  <div className="mb-4 pb-4 border-b border-gray-800">
                    <p className="text-green-400">$ {selectedLogData.command}</p>
                    <p className="text-gray-500 text-xs mt-1">
                      Started at {new Date(selectedLogData.startedAt).toLocaleString()}
                    </p>
                  </div>

                  {/* Output Lines */}
                  <div className="space-y-1">
                    {selectedLogData.output.map((line, index) => (
                      <div key={index} className="flex">
                        <span className="text-gray-600 w-12 flex-shrink-0 text-right mr-4">
                          {index + 1}
                        </span>
                        <span
                          className={`flex-1 ${
                            line.includes('ERROR') || line.includes('error')
                              ? 'text-red-400'
                              : line.includes('WARN') || line.includes('warn')
                              ? 'text-yellow-400'
                              : line.includes('SUCCESS') || line.includes('[✓]')
                              ? 'text-green-400'
                              : line.includes('[INF]') || line.includes('INFO')
                              ? 'text-blue-400'
                              : 'text-gray-300'
                          }`}
                        >
                          {line}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Status Footer */}
                  {selectedLogData.completedAt && (
                    <div className="mt-6 pt-4 border-t border-gray-800">
                      <p className="text-green-400">
                        ✓ Scan completed at {new Date(selectedLogData.completedAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
