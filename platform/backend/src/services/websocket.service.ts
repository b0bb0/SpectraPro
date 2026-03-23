/**
 * WebSocket Service
 * Manages real-time communication for scan progress updates
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { logger } from '../utils/logger';
import { verifyToken } from '../utils/auth';
import { parse } from 'url';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  tenantId?: string;
  isAlive?: boolean;
}

interface ScanProgressMessage {
  type: 'scan_progress';
  scanId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  currentPhase?: string;
  message?: string;
  vulnFound?: number;
  timestamp: string;
}

interface ScanStartedMessage {
  type: 'scan_started';
  scanId: string;
  target: string;
  timestamp: string;
}

interface ScanCompletedMessage {
  type: 'scan_completed';
  scanId: string;
  status: 'COMPLETED' | 'FAILED';
  vulnFound: number;
  duration: number;
  timestamp: string;
}

interface NucleiOutputMessage {
  type: 'nuclei_output';
  scanId: string;
  output: string;
  timestamp: string;
}

interface BulkScanProgressMessage {
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

interface BulkScanStartedMessage {
  type: 'bulk_scan_started';
  batchId: string;
  totalTargets: number;
  maxConcurrent: number;
  timestamp: string;
}

interface BulkScanCompletedMessage {
  type: 'bulk_scan_completed';
  batchId: string;
  totalTargets: number;
  completed: number;
  failed: number;
  duration: number;
  timestamp: string;
}

interface ConnectionAckMessage {
  type: 'connection_ack';
  message: string;
  timestamp: string;
}

type WebSocketMessage =
  | ScanProgressMessage
  | ScanStartedMessage
  | ScanCompletedMessage
  | NucleiOutputMessage
  | BulkScanProgressMessage
  | BulkScanStartedMessage
  | BulkScanCompletedMessage
  | ConnectionAckMessage;

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<AuthenticatedWebSocket>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize WebSocket server
   */
  initialize(server: Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
    });

    logger.info('✓ WebSocket server initialized on /ws');

    this.wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
      this.handleConnection(ws, req);
    });

    // Start heartbeat to detect dead connections
    this.startHeartbeat();
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: AuthenticatedWebSocket, req: any): void {
    logger.info('New WebSocket connection attempt');

    // 1. Cookie-based auth (httpOnly cookie sent automatically by browser on upgrade)
    const cookieHeader = req.headers['cookie'] || '';
    const cookieToken = cookieHeader
      .split(';')
      .map((c: string) => c.trim())
      .find((c: string) => c.startsWith('token='))
      ?.split('=')
      .slice(1)
      .join('=');

    if (cookieToken) {
      this.authenticateAndRegister(ws, cookieToken);
    } else {
      // 2. Fallback: URL query param (legacy) or first-message auth
      const { query } = parse(req.url || '', true);
      const urlToken = query.token as string;

      if (urlToken) {
        this.authenticateAndRegister(ws, urlToken);
      } else {
        // Wait for auth message
        ws.isAlive = true;
        const authTimeout = setTimeout(() => {
          if (!ws.userId) {
            logger.warn('WebSocket connection rejected: Auth timeout');
            ws.close(1008, 'Authentication timeout');
          }
        }, 5000);

        ws.once('message', (data: Buffer) => {
          clearTimeout(authTimeout);
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'auth' && msg.token) {
              this.authenticateAndRegister(ws, msg.token);
            } else {
              ws.close(1008, 'First message must be auth');
            }
          } catch {
            ws.close(1008, 'Invalid auth message');
          }
        });
      }
    }

    // Handle pong responses for heartbeat
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle client disconnect
    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error:', error);
      this.handleDisconnect(ws);
    });
  }

  /**
   * Authenticate a WebSocket connection and register it
   */
  private authenticateAndRegister(ws: AuthenticatedWebSocket, token: string): void {
    try {
      const decoded = verifyToken(token);
      ws.userId = decoded.userId;
      ws.tenantId = decoded.tenantId;
      ws.isAlive = true;

      // Add to clients map (indexed by tenantId for multi-tenant isolation)
      if (!this.clients.has(ws.tenantId)) {
        this.clients.set(ws.tenantId, new Set());
      }
      this.clients.get(ws.tenantId)!.add(ws);

      logger.info(`WebSocket authenticated: userId=${ws.userId}, tenantId=${ws.tenantId}`);

      // Send welcome message
      this.sendToClient(ws, {
        type: 'connection_ack',
        message: 'Connected to real-time updates',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.warn('WebSocket authentication failed:', error.message);
      ws.close(1008, 'Invalid token');
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(ws: AuthenticatedWebSocket): void {
    if (ws.tenantId && this.clients.has(ws.tenantId)) {
      this.clients.get(ws.tenantId)!.delete(ws);

      // Remove tenant entry if no more clients
      if (this.clients.get(ws.tenantId)!.size === 0) {
        this.clients.delete(ws.tenantId);
      }

      logger.info(`WebSocket disconnected: userId=${ws.userId}, tenantId=${ws.tenantId}`);
    }
  }

  /**
   * Start heartbeat to detect dead connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((tenantClients) => {
        tenantClients.forEach((ws) => {
          if (ws.isAlive === false) {
            logger.info('Terminating dead WebSocket connection');
            return ws.terminate();
          }

          ws.isAlive = false;
          ws.ping();
        });
      });
    }, 30000); // Check every 30 seconds
  }

  /**
   * Send message to specific client
   */
  private sendToClient(ws: AuthenticatedWebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast scan progress to all clients in a tenant
   */
  broadcastScanProgress(
    tenantId: string,
    scanId: string,
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED',
    progress: number,
    currentPhase?: string,
    vulnFound?: number
  ): void {
    const message: ScanProgressMessage = {
      type: 'scan_progress',
      scanId,
      status,
      progress,
      currentPhase,
      vulnFound,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToTenant(tenantId, message);
  }

  /**
   * Broadcast scan started event
   */
  broadcastScanStarted(tenantId: string, scanId: string, target: string): void {
    const message: ScanStartedMessage = {
      type: 'scan_started',
      scanId,
      target,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToTenant(tenantId, message);
  }

  /**
   * Broadcast scan completed event
   */
  broadcastScanCompleted(
    tenantId: string,
    scanId: string,
    status: 'COMPLETED' | 'FAILED',
    vulnFound: number,
    duration: number
  ): void {
    const message: ScanCompletedMessage = {
      type: 'scan_completed',
      scanId,
      status,
      vulnFound,
      duration,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToTenant(tenantId, message);
  }

  /**
   * Broadcast Nuclei output (live streaming)
   */
  broadcastNucleiOutput(tenantId: string, scanId: string, output: string): void {
    const message: NucleiOutputMessage = {
      type: 'nuclei_output',
      scanId,
      output,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToTenant(tenantId, message);
  }

  /**
   * Broadcast bulk scan started event
   */
  broadcastBulkScanStarted(
    tenantId: string,
    batchId: string,
    totalTargets: number,
    maxConcurrent: number
  ): void {
    const message: BulkScanStartedMessage = {
      type: 'bulk_scan_started',
      batchId,
      totalTargets,
      maxConcurrent,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToTenant(tenantId, message);
  }

  /**
   * Broadcast bulk scan progress update
   */
  broadcastBulkScanProgress(
    tenantId: string,
    batchId: string,
    totalTargets: number,
    completed: number,
    failed: number,
    inProgress: number,
    currentBatch: number,
    totalBatches: number,
    recentScans: Array<{
      target: string;
      scanId?: string;
      status: 'completed' | 'failed' | 'running';
      error?: string;
    }>
  ): void {
    const message: BulkScanProgressMessage = {
      type: 'bulk_scan_progress',
      batchId,
      totalTargets,
      completed,
      failed,
      inProgress,
      currentBatch,
      totalBatches,
      recentScans,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToTenant(tenantId, message);
  }

  /**
   * Broadcast bulk scan completed event
   */
  broadcastBulkScanCompleted(
    tenantId: string,
    batchId: string,
    totalTargets: number,
    completed: number,
    failed: number,
    duration: number
  ): void {
    const message: BulkScanCompletedMessage = {
      type: 'bulk_scan_completed',
      batchId,
      totalTargets,
      completed,
      failed,
      duration,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToTenant(tenantId, message);
  }

  /**
   * Broadcast message to all clients in a tenant
   */
  private broadcastToTenant(tenantId: string, message: WebSocketMessage): void {
    const tenantClients = this.clients.get(tenantId);

    if (!tenantClients || tenantClients.size === 0) {
      logger.debug(`No WebSocket clients for tenant ${tenantId}`);
      return;
    }

    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    tenantClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
        sentCount++;
      }
    });

    logger.debug(`Broadcast ${message.type} to ${sentCount} clients in tenant ${tenantId}`);
  }

  /**
   * Get number of connected clients for a tenant
   */
  getClientCount(tenantId: string): number {
    return this.clients.get(tenantId)?.size || 0;
  }

  /**
   * Get total number of connected clients
   */
  getTotalClientCount(): number {
    let total = 0;
    this.clients.forEach((tenantClients) => {
      total += tenantClients.size;
    });
    return total;
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.clients.forEach((tenantClients) => {
      tenantClients.forEach((ws) => {
        ws.close(1001, 'Server shutting down');
      });
    });

    if (this.wss) {
      this.wss.close();
    }

    logger.info('WebSocket server shut down');
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
