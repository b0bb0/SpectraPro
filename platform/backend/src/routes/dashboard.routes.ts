/**
 * Dashboard Analytics Routes
 */

import { Router } from 'express';
import { requireAuth, enforceTenantIsolation } from '../middleware/auth.middleware';
import { DashboardService } from '../services/dashboard.service';

const router = Router();
const dashboardService = new DashboardService();

// Apply authentication to all dashboard routes
router.use(requireAuth);
router.use(enforceTenantIsolation);

/**
 * GET /api/dashboard/metrics
 * Get key performance indicators
 */
router.get('/metrics', async (req, res, next) => {
  try {
    const timeRange = req.query.range as string || '30d';
    const metrics = await dashboardService.getMetrics(req.tenantId!, timeRange);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/risk-trend
 * Get risk trend over time
 */
router.get('/risk-trend', async (req, res, next) => {
  try {
    const timeRange = req.query.range as string || '30d';
    const trend = await dashboardService.getRiskTrend(req.tenantId!, timeRange);

    res.json({
      success: true,
      data: trend,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/severity-distribution
 * Get vulnerability severity distribution
 */
router.get('/severity-distribution', async (req, res, next) => {
  try {
    const distribution = await dashboardService.getSeverityDistribution(req.tenantId!);

    res.json({
      success: true,
      data: distribution,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/assets-by-category
 * Get assets grouped by type/category
 */
router.get('/assets-by-category', async (req, res, next) => {
  try {
    const categories = await dashboardService.getAssetsByCategory(req.tenantId!);

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/top-vulnerabilities
 * Get most critical vulnerabilities
 */
router.get('/top-vulnerabilities', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const topVulns = await dashboardService.getTopVulnerabilities(req.tenantId!, limit);

    res.json({
      success: true,
      data: topVulns,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/recent-scans
 * Get recent scan activity
 */
router.get('/recent-scans', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const scans = await dashboardService.getRecentScans(req.tenantId!, limit);

    res.json({
      success: true,
      data: scans,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
