/**
 * Console Service
 * Manages real-time scan output logs for admin console
 */

import { logger } from '../utils/logger';

export interface ScanLog {
  id: string;
  scanId: string;
  scanName: string;
  command: string;
  output: string[];
  status: string;
  startedAt: string;
  completedAt?: string;
  tenantId: string;
}

class ConsoleService {
  private logs: Map<string, ScanLog> = new Map();
  private maxLogs = 50; // Keep last 50 scans

  /**
   * Create a new log entry for a scan
   */
  createLog(scanId: string, scanName: string, command: string, tenantId: string = ''): ScanLog {
    const log: ScanLog = {
      id: scanId,
      scanId,
      scanName,
      command,
      output: [],
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      tenantId,
    };

    this.logs.set(scanId, log);
    this.pruneOldLogs();

    logger.debug(`Console log created for scan: ${scanId}`);
    return log;
  }

  /**
   * Append output line to a scan log
   */
  appendOutput(scanId: string, line: string): void {
    const log = this.logs.get(scanId);
    if (log) {
      log.output.push(line);
      logger.debug(`Console output appended to scan ${scanId}: ${line.substring(0, 100)}`);
    }
  }

  /**
   * Mark a scan log as completed
   */
  completeLog(scanId: string, status: 'COMPLETED' | 'FAILED' = 'COMPLETED'): void {
    const log = this.logs.get(scanId);
    if (log) {
      log.status = status;
      log.completedAt = new Date().toISOString();
      logger.debug(`Console log completed for scan: ${scanId} with status: ${status}`);
    }
  }

  /**
   * Get all scan logs filtered by tenant
   */
  getAllLogs(tenantId?: string): ScanLog[] {
    const allLogs = Array.from(this.logs.values());
    const filtered = tenantId ? allLogs.filter(log => log.tenantId === tenantId) : allLogs;
    return filtered.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  /**
   * Get log by scan ID with tenant check
   */
  getLogByScanId(scanId: string, tenantId?: string): ScanLog | undefined {
    const log = this.logs.get(scanId);
    if (log && tenantId && log.tenantId !== tenantId) return undefined;
    return log;
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs.clear();
    logger.info('All console logs cleared');
  }

  /**
   * Remove old logs when limit is exceeded
   */
  private pruneOldLogs(): void {
    if (this.logs.size > this.maxLogs) {
      const sortedLogs = this.getAllLogs();
      const toRemove = sortedLogs.slice(this.maxLogs);

      toRemove.forEach(log => {
        this.logs.delete(log.scanId);
      });

      logger.debug(`Pruned ${toRemove.length} old console logs`);
    }
  }
}

export const consoleService = new ConsoleService();
