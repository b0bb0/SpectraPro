/**
 * Attack Surface Graph Routes
 */

import { Router } from 'express';
import { requireAuth, enforceTenantIsolation } from '../middleware/auth.middleware';
import { graphService } from '../services/graph.service';
import { logger } from '../utils/logger';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

/**
 * GET /api/graph
 * Get attack surface graph data
 */
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    logger.info(`Generating attack surface graph for tenant: ${tenantId}`);
    const graphData = await graphService.generateGraph(tenantId);

    res.json({
      success: true,
      data: graphData,
    });
  } catch (error: any) {
    logger.error('Failed to generate graph:', error);
    next(error);
  }
});

/**
 * GET /api/graph/threat-paths
 * Analyze critical threat paths
 */
router.get('/threat-paths', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    logger.info(`Analyzing threat paths for tenant: ${tenantId}`);
    const threatPaths = await graphService.analyzeThreatPaths(tenantId);

    res.json({
      success: true,
      data: threatPaths,
    });
  } catch (error: any) {
    logger.error('Failed to analyze threat paths:', error);
    next(error);
  }
});

/**
 * GET /api/graph/targets
 * Get list of assets for target selection
 */
router.get('/targets', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    logger.info(`Fetching target assets for tenant: ${tenantId}`);
    const targets = await graphService.getTargetAssets(tenantId);

    res.json({
      success: true,
      data: targets,
    });
  } catch (error: any) {
    logger.error('Failed to fetch target assets:', error);
    next(error);
  }
});

/**
 * GET /api/graph/radial/:assetId
 * Get radial graph for a specific asset
 */
router.get('/radial/:assetId', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const assetId = req.params.assetId;

    logger.info(`Generating radial graph for asset: ${assetId}`);
    const graphData = await graphService.generateAssetRadialGraph(tenantId, assetId);

    res.json({
      success: true,
      data: graphData,
    });
  } catch (error: any) {
    logger.error('Failed to generate radial graph:', error);
    next(error);
  }
});

export default router;
