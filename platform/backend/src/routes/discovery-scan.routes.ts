/**
 * Discovery Scan Routes (Two-Layer Discovery)
 */

import { Router } from 'express';
import { requireAuth, enforceTenantIsolation, requireRole } from '../middleware/auth.middleware';
import { DiscoveryScanService } from '../services/discovery-scan.service';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = Router();
const discoveryScanService = new DiscoveryScanService();

router.use(requireAuth);
router.use(enforceTenantIsolation);

// Validation schemas
const executeScanSchema = z.object({
  scanId: z.string().min(1, 'Scan ID is required'),
  assetId: z.string().min(1, 'Asset ID is required'),
  target: z.string().min(1, 'Target is required'),
  aiContext: z
    .object({
      reconFindings: z.array(z.any()).optional(),
      parameters: z.array(z.string()).optional(),
      endpoints: z.array(z.string()).optional(),
      techStack: z.any().optional(),
    })
    .optional(),
});

const forceExecuteSchema = z.object({
  testResultId: z.string().min(1, 'Test result ID is required'),
  reason: z.string().min(1, 'Reason for force execution is required'),
});

/**
 * POST /api/discovery-scan/execute
 * Execute two-layer discovery scan
 */
router.post('/execute', async (req, res, next) => {
  try {
    const validation = executeScanSchema.safeParse(req.body);
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

    const { scanId, assetId, target, aiContext } = validation.data;
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

    await discoveryScanService.executeTwoLayerScan(
      scanId,
      assetId,
      target,
      tenantId,
      aiContext
    );

    res.status(201).json({
      success: true,
      data: {
        scanId,
        assetId,
        target,
        message: 'Two-layer discovery scan initiated',
      },
    });
  } catch (error: any) {
    logger.error('Failed to execute discovery scan:', error);
    next(error);
  }
});

/**
 * POST /api/discovery-scan/force-execute
 * Force execute a skipped test (role-gated: ANALYST or ADMIN)
 */
router.post('/force-execute', requireRole('ANALYST', 'ADMIN'), async (req, res, next) => {
  try {
    const validation = forceExecuteSchema.safeParse(req.body);
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

    const { testResultId, reason } = validation.data;
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

    await discoveryScanService.forceExecuteSkippedTest(testResultId, tenantId, userId);

    res.json({
      success: true,
      data: {
        testResultId,
        message: 'Test force execution initiated',
      },
    });
  } catch (error: any) {
    logger.error('Failed to force execute test:', error);

    if (error.message?.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: error.message,
        },
      });
    }

    if (error.message?.includes('not skipped')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: error.message,
        },
      });
    }

    next(error);
  }
});

/**
 * GET /api/discovery-scan/:scanId/results
 * Get scan test results (optionally filtered by layer)
 */
router.get('/:scanId/results', async (req, res, next) => {
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

    const layer = req.query.layer as string | undefined;
    const validLayers = ['BASELINE', 'AI_EXPANDED'];

    if (layer && !validLayers.includes(layer)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_LAYER',
          message: `Invalid layer. Must be one of: ${validLayers.join(', ')}`,
        },
      });
    }

    const results = await discoveryScanService.getScanTestResults(
      req.params.scanId,
      tenantId,
      layer as any
    );

    res.json({
      success: true,
      data: {
        scanId: req.params.scanId,
        layer: layer || 'ALL',
        results,
        totalCount: results.length,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get scan test results:', error);
    next(error);
  }
});

/**
 * GET /api/discovery-scan/:scanId/stats
 * Get execution statistics for a scan
 */
router.get('/:scanId/stats', async (req, res, next) => {
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

    const stats = await discoveryScanService.getTestExecutionStats(req.params.scanId, tenantId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    logger.error('Failed to get test execution stats:', error);
    next(error);
  }
});

export default router;
