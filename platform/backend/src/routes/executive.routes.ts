/**
 * Executive Dashboard Routes
 * Rapid7-style executive metrics and insights
 */

import { Router } from 'express';
import { requireAuth, enforceTenantIsolation } from '../middleware/auth.middleware';
import { executiveDashboardService } from '../services/executive-dashboard.service';
import { logger } from '../utils/logger';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

/**
 * GET /api/executive/metrics
 * Get comprehensive executive dashboard metrics
 */
router.get('/metrics', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const metrics = await executiveDashboardService.getExecutiveMetrics(tenantId);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    logger.error('Failed to get executive metrics:', error);
    next(error);
  }
});

/**
 * POST /api/executive/recalculate
 * Recalculate all risk scores
 */
router.post('/recalculate', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    await executiveDashboardService.updateAllRiskScores(tenantId);

    res.json({
      success: true,
      message: 'Risk scores updated successfully',
    });
  } catch (error: any) {
    logger.error('Failed to recalculate risk scores:', error);
    next(error);
  }
});

/**
 * GET /api/executive/risk-trend
 * Get risk trend data for charting
 */
router.get('/risk-trend', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const { days = 30 } = req.query;

    const metrics = await executiveDashboardService.getExecutiveMetrics(tenantId);

    res.json({
      success: true,
      data: metrics.riskTrend,
    });
  } catch (error: any) {
    logger.error('Failed to get risk trend:', error);
    next(error);
  }
});

export default router;
