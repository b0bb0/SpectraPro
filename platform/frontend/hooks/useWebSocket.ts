/**
 * WebSocket Hook for Real-time Scan Updates
 * Connects to backend WebSocket server and handles real-time events
 */

import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';
import { useWebSocketContext } from '@/contexts/WebSocketContext';

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
 * Hook to connect to WebSocket server and receive real-time scan updates.
 * Uses the singleton WebSocketProvider — all consumers share one connection.
 */
export function useWebSocket(): UseWebSocketReturn {
  return useWebSocketContext();
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
