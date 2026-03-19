/**
 * WebSocket Hook for Real-time Scan Updates
 * Connects to backend WebSocket server and handles real-time events
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import Cookies from 'js-cookie';
import { API_URL } from '@/lib/api';

export interface ScanProgressEvent {
  type: 'scan_progress';
  scanId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  currentPhase?: string;
  message?: string;
  vulnFound?: number;
  timestamp: string;
}

export interface ScanStartedEvent {
  type: 'scan_started';
  scanId: string;
  target: string;
  timestamp: string;
}

export interface ScanCompletedEvent {
  type: 'scan_completed';
  scanId: string;
  status: 'COMPLETED' | 'FAILED';
  vulnFound: number;
  duration: number;
  timestamp: string;
}

export interface NucleiOutputEvent {
  type: 'nuclei_output';
  scanId: string;
  output: string;
  timestamp: string;
}

export interface BulkScanProgressEvent {
  type: 'bulk_scan_progress';
  batchId: string;
  totalTargets: number;
  completed: number;
  failed: number;
  inProgress: number;
  currentBatch: number;
  totalBatches: number;
  recentScans: Array<{
    target: string;
    scanId?: string;
    status: 'completed' | 'failed' | 'running';
    error?: string;
  }>;
  timestamp: string;
}

export interface BulkScanStartedEvent {
  type: 'bulk_scan_started';
  batchId: string;
  totalTargets: number;
  maxConcurrent: number;
  timestamp: string;
}

export interface BulkScanCompletedEvent {
  type: 'bulk_scan_completed';
  batchId: string;
  totalTargets: number;
  completed: number;
  failed: number;
  duration: number;
  timestamp: string;
}

export type WebSocketEvent =
  | ScanProgressEvent
  | ScanStartedEvent
  | ScanCompletedEvent
  | NucleiOutputEvent
  | BulkScanProgressEvent
  | BulkScanStartedEvent
  | BulkScanCompletedEvent;

export interface UseWebSocketReturn {
  isConnected: boolean;
  lastEvent: WebSocketEvent | null;
  error: string | null;
  reconnect: () => void;
}

/**
 * Hook to connect to WebSocket server and receive real-time scan updates
 */
export function useWebSocket(): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3 seconds

  const connect = useCallback(() => {
    // Get JWT token from cookies
    const token = Cookies.get('token');

    if (!token) {
      setError('No authentication token found');
      setIsConnected(false);
      return;
    }

    // Determine WebSocket URL based on environment
    const wsUrl = API_URL.replace('http', 'ws') + `/ws?token=${token}`;

    try {
      if (process.env.NODE_ENV === 'development') {
        console.log('[WebSocket] Connecting to:', wsUrl.replace(token, 'TOKEN'));
      }

      // Create WebSocket connection
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[WebSocket] Connected');
        }
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0; // Reset reconnect attempts on success
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketEvent;
          if (process.env.NODE_ENV === 'development') {
            console.log('[WebSocket] Received:', data.type, data);
          }
          setLastEvent(data);
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[WebSocket] Failed to parse message:', err);
          }
        }
      };

      ws.onerror = (event) => {
        if (process.env.NODE_ENV === 'development') {
          console.error('[WebSocket] Error:', event);
        }
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[WebSocket] Disconnected:', event.code, event.reason);
        }
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect if not intentional close
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          if (process.env.NODE_ENV === 'development') {
            console.log(
              `[WebSocket] Reconnecting... (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
            );
          }

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError('Failed to connect after multiple attempts');
        }
      };

      wsRef.current = ws;
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[WebSocket] Connection failed:', err);
      }
      setError(err.message);
      setIsConnected(false);
    }
  }, []);

  const reconnect = useCallback(() => {
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual reconnect');
      wsRef.current = null;
    }

    // Clear any pending reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Reset reconnect attempts
    reconnectAttemptsRef.current = 0;

    // Reconnect
    connect();
  }, [connect]);

  // Connect on mount
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
      }
    };
  }, [connect]);

  return {
    isConnected,
    lastEvent,
    error,
    reconnect,
  };
}

/**
 * Hook to listen for specific scan updates
 * Filters events for a specific scan ID
 */
export function useScanUpdates(scanId: string | null) {
  const { isConnected, lastEvent, error, reconnect } = useWebSocket();
  const [scanProgress, setScanProgress] = useState<ScanProgressEvent | null>(null);
  const [scanStatus, setScanStatus] = useState<'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | null>(null);

  useEffect(() => {
    if (!lastEvent || !scanId) return;

    // Filter events for this specific scan
    if ('scanId' in lastEvent && lastEvent.scanId === scanId) {
      if (lastEvent.type === 'scan_progress') {
        setScanProgress(lastEvent);
        setScanStatus(lastEvent.status);
      } else if (lastEvent.type === 'scan_completed') {
        setScanStatus(lastEvent.status);
      } else if (lastEvent.type === 'scan_started') {
        setScanStatus('RUNNING');
      }
    }
  }, [lastEvent, scanId]);

  return {
    isConnected,
    scanProgress,
    scanStatus,
    error,
    reconnect,
  };
}

/**
 * Hook to listen for bulk scan updates
 * Monitors progress of bulk/multi-target scans
 */
export function useBulkScanUpdates() {
  const { isConnected, lastEvent, error, reconnect } = useWebSocket();
  const [bulkProgress, setBulkProgress] = useState<BulkScanProgressEvent | null>(null);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!lastEvent) return;

    // Handle bulk scan events
    if (lastEvent.type === 'bulk_scan_started') {
      setCurrentBatchId(lastEvent.batchId);
      setIsRunning(true);
      if (process.env.NODE_ENV === 'development') {
        console.log('[Bulk Scan] Started:', lastEvent);
      }
    } else if (lastEvent.type === 'bulk_scan_progress') {
      // Update progress for current batch
      setBulkProgress(lastEvent);
      if (process.env.NODE_ENV === 'development') {
        console.log('[Bulk Scan] Progress:', lastEvent);
      }
    } else if (lastEvent.type === 'bulk_scan_completed') {
      setIsRunning(false);
      if (process.env.NODE_ENV === 'development') {
        console.log('[Bulk Scan] Completed:', lastEvent);
      }
    }
  }, [lastEvent]);

  return {
    isConnected,
    bulkProgress,
    currentBatchId,
    isRunning,
    error,
    reconnect,
  };
}
