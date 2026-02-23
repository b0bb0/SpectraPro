/**
 * Kill Switch Routes (Emergency Stop)
 */

import { Router } from 'express';
import { requireAuth, enforceTenantIsolation, requireRole } from '../middleware/auth.middleware';
import { KillSwitchService } from '../services/kill-switch.service';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = Router();
const killSwitchService = new KillSwitchService();

router.use(requireAuth);
router.use(enforceTenantIsolation);

// Validation schemas
const activateSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters — describe why the kill switch is needed'),
});

/**
 * POST /api/kill-switch/activate
 * Activate kill switch (admin-only)
 */
router.post('/activate', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const validation = activateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: validation.error.errors,
        },
      });
    }

    const { reason } = validation.data;
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;

    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_AUTH_DATA',
          message: 'Authentication data not found',
        },
      });
    }

    await killSwitchService.activate(reason, userId, tenantId);

    logger.warn(`Kill switch activated by user ${userId} for tenant ${tenantId}: ${reason}`);

    res.json({
      success: true,
      data: {
        activated: true,
        reason,
        activatedBy: userId,
        message: 'Kill switch activated - all scans stopped',
      },
    });
  } catch (error: any) {
    logger.error('Failed to activate kill switch:', error);
    next(error);
  }
});

/**
 * POST /api/kill-switch/deactivate
 * Deactivate kill switch (admin-only)
 */
router.post('/deactivate', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;

    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_AUTH_DATA',
          message: 'Authentication data not found',
        },
      });
    }

    await killSwitchService.deactivate(userId, tenantId);

    logger.info(`Kill switch deactivated by user ${userId} for tenant ${tenantId}`);

    res.json({
      success: true,
      data: {
        activated: false,
        deactivatedBy: userId,
        message: 'Kill switch deactivated - scanning can resume',
      },
    });
  } catch (error: any) {
    logger.error('Failed to deactivate kill switch:', error);
    next(error);
  }
});

/**
 * GET /api/kill-switch/status
 * Get kill switch status
 */
router.get('/status', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TENANT',
          message: 'Tenant ID not found',
        },
      });
    }

    const isActive = await killSwitchService.isActive(tenantId);
    const status = await killSwitchService.getStatus(tenantId);

    res.json({
      success: true,
      data: {
        isActive,
        ...status,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get kill switch status:', error);
    next(error);
  }
});

export default router;
