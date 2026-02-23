/**
 * Console Routes - Admin only
 * Real-time scan output and system logs
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { consoleService } from '../services/console.service';
import { logger } from '../utils/logger';

const router = Router();

router.use(requireAuth);
router.use(requireRole('ADMIN')); // Only admins can access console

/**
 * GET /api/console/logs
 * Get all scan console logs
 */
router.get('/logs', async (req: any, res, next) => {
  try {
    const logs = await consoleService.getAllLogs(req.tenantId);

    res.json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    logger.error('Failed to get console logs:', error);
    next(error);
  }
});

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
