/**
 * Console Routes - Admin only
 * Real-time scan output and system logs
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { consoleService, ScanLog } from '../services/console.service';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

const router = Router();

router.use(requireAuth);
router.use(requireRole('ADMIN')); // Only admins can access console

/**
 * GET /api/console/logs
 * Get all scan console logs — merges in-memory logs with DB scan records
 * so that active/recent scans are always visible even after a server restart.
 */
router.get('/logs', async (req: any, res, next) => {
  try {
    // 1. Get in-memory real-time logs (populated while backend is running)
    const memoryLogs = await consoleService.getAllLogs(req.tenantId);
    const memoryLogScanIds = new Set(memoryLogs.map(l => l.scanId));

    // 2. Fetch recent scans from DB that are NOT already in memory
    const recentDbScans = await prisma.scans.findMany({
      where: {
        tenantId: req.tenantId,
        status: { in: ['RUNNING', 'COMPLETED', 'FAILED'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { assets: { select: { url: true, hostname: true, name: true } } },
    });

    // 3. Convert DB scans that are missing from memory into ScanLog format
    const dbFallbackLogs: ScanLog[] = recentDbScans
      .filter(scan => !memoryLogScanIds.has(scan.id))
      .map(scan => ({
        id: scan.id,
        scanId: scan.id,
        scanName: scan.name,
        command: `nuclei -target ${scan.assets?.url || scan.assets?.hostname || 'unknown'} -profile ${scan.scanProfile || 'BALANCED'}`,
        output: buildOutputFromDbScan(scan),
        status: scan.status === 'RUNNING' ? 'RUNNING' : scan.status,
        startedAt: (scan.startedAt || scan.createdAt).toISOString(),
        completedAt: scan.completedAt?.toISOString(),
        tenantId: scan.tenantId,
      }));

    // 4. Merge: in-memory logs first (they have live output), then DB fallbacks
    const allLogs = [...memoryLogs, ...dbFallbackLogs]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    res.json({
      success: true,
      data: allLogs,
    });
  } catch (error: any) {
    logger.error('Failed to get console logs:', error);
    next(error);
  }
});

/**
 * Build synthetic console output from a DB scan record.
 * This provides a useful summary when the real-time in-memory log is gone.
 */
function buildOutputFromDbScan(scan: any): string[] {
  const lines: string[] = [];
  const target = scan.assets?.url || scan.assets?.hostname || 'unknown';

  lines.push(`$ nuclei -target ${target} -profile ${scan.scanProfile || 'BALANCED'}`);
  lines.push(`[${(scan.startedAt || scan.createdAt).toISOString()}] Starting scan...`);

  if (scan.currentPhase) {
    lines.push(`[INFO] Current phase: ${scan.currentPhase}`);
  }

  if (scan.orchestrationPhase) {
    lines.push(`[INFO] Orchestration phase: ${scan.orchestrationPhase}`);
  }

  if (scan.progress != null && scan.progress > 0) {
    lines.push(`[INFO] Progress: ${scan.progress}%`);
  }

  if (scan.vulnFound != null && scan.vulnFound > 0) {
    lines.push(`[INFO] Vulnerabilities found: ${scan.vulnFound} (Critical: ${scan.criticalCount}, High: ${scan.highCount}, Medium: ${scan.mediumCount}, Low: ${scan.lowCount})`);
  }

  if (scan.errorMessage) {
    lines.push(`[ERROR] ${scan.errorMessage}`);
  }

  if (scan.status === 'COMPLETED') {
    lines.push(`[${scan.completedAt?.toISOString() || 'unknown'}] ✓ Scan completed successfully`);
  } else if (scan.status === 'FAILED') {
    lines.push(`[${scan.completedAt?.toISOString() || 'unknown'}] ✗ Scan failed`);
  } else if (scan.status === 'RUNNING') {
    lines.push('[INFO] Scan is running (real-time output unavailable — server was restarted)');
  }

  return lines;
}

/**
 * GET /api/console/logs/:scanId
 * Get console log for specific scan
 */
router.get('/logs/:scanId', async (req: any, res, next) => {
  try {
    const { scanId } = req.params;
    const log = await consoleService.getLogByScanId(scanId, req.tenantId);

    if (!log) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Log not found',
        },
      });
    }

    res.json({
      success: true,
      data: log,
    });
  } catch (error: any) {
    logger.error('Failed to get scan log:', error);
    next(error);
  }
});

/**
 * DELETE /api/console/logs
 * Clear all console logs
 */
router.delete('/logs', async (req, res, next) => {
  try {
    await consoleService.clearLogs();

    res.json({
      success: true,
      message: 'All logs cleared',
    });
  } catch (error: any) {
    logger.error('Failed to clear logs:', error);
    next(error);
  }
});

export default router;
