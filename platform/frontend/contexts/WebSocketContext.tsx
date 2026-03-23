'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { API_URL } from '@/lib/api';
import type { WebSocketEvent } from '@/hooks/useWebSocket';

interface WebSocketContextValue {
  isConnected: boolean;
  lastEvent: WebSocketEvent | null;
  error: string | null;
  reconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  isConnected: false,
  lastEvent: null,
  error: null,
  reconnect: () => {},
});

export function useWebSocketContext() {
  return useContext(WebSocketContext);
}

/**
 * Singleton WebSocket provider — shares one connection across all consumers
 */
export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  const connect = useCallback(() => {
    // Don't create duplicate connections
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Build WS URL — the browser sends the httpOnly 'token' cookie automatically on the upgrade request
    const base = API_URL || window.location.origin;
    const wsUrl = base.replace(/^http/, 'ws') + '/ws';

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketEvent;
          setLastEvent(data);
        } catch {}
      };

      ws.onerror = () => {
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        wsRef.current = null;

        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(connect, reconnectDelay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError('Failed to connect after multiple attempts');
        }
      };

      wsRef.current = ws;
    } catch (err: any) {
      setError(err.message);
      setIsConnected(false);
    }
  }, []);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual reconnect');
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close(1000, 'Provider unmounted');
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider value={{ isConnected, lastEvent, error, reconnect }}>
      {children}
    </WebSocketContext.Provider>
  );
}
