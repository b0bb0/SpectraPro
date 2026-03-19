/**
 * Scan Management Routes
 */

import { Router } from 'express';
import { requireAuth, enforceTenantIsolation } from '../middleware/auth.middleware';
import { scanService } from '../services/scan.service';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

// Validation schemas
const startScanSchema = z.object({
  target: z.string().min(1, 'Target is required'),
  scanLevel: z.enum(['light', 'normal', 'extreme'], {
    errorMap: () => ({ message: 'Invalid scan level. Must be light, normal, or extreme' }),
  }),
  deepScanAuthorized: z.boolean().optional().default(false),
  authConfig: z.object({
    method: z.enum(['none', 'basic', 'bearer', 'cookie', 'header', 'form']),
    username: z.string().optional(),
    password: z.string().optional(),
    bearerToken: z.string().optional(),
    cookies: z.record(z.string()).optional(),
    headers: z.record(z.string()).optional(),
    loginUrl: z.string().optional(),
    usernameField: z.string().optional(),
    passwordField: z.string().optional(),
    submitPath: z.string().optional(),
    sessionCookie: z.string().optional(),
  }).optional(),
});

const bulkScanSchema = z.object({
  targets: z.array(z.string().min(1, 'Target cannot be empty')).min(1, 'At least one target is required').max(50, 'Maximum 50 targets allowed'),
  scanLevel: z.enum(['light', 'normal', 'extreme'], {
    errorMap: () => ({ message: 'Invalid scan level. Must be light, normal, or extreme' }),
  }),
  deepScanAuthorized: z.boolean().optional().default(false),
  maxConcurrent: z.number().int().min(1).max(10).optional().default(3),
});

/**
 * GET /api/scans
 * List scans
 */
router.get('/', async (req, res, next) => {
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

    const scans = await scanService.getScans(tenantId);

    res.json({
      success: true,
      data: scans,
    });
  } catch (error: any) {
    logger.error('Failed to get scans:', error);
    next(error);
  }
});

/**
 * GET /api/scans/:id
 * Get scan by ID with vulnerabilities
 */
router.get('/:id', async (req, res, next) => {
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

    const scan = await scanService.getScanById(req.params.id, tenantId);

    if (!scan) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Scan not found',
        },
      });
    }

    res.json({
      success: true,
      data: scan,
    });
  } catch (error: any) {
    logger.error('Failed to get scan:', error);
    next(error);
  }
});

/**
 * POST /api/scans/:id/kill
 * Terminate a running scan and all subprocesses
 */
router.post('/:id/kill', async (req, res, next) => {
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

    const result = await scanService.stopScan(req.params.id, tenantId, userId);

    res.json({
      success: true,
      data: {
        scanId: req.params.id,
        ...result,
      },
    });
  } catch (error: any) {
    logger.error('Failed to kill scan:', error);

    if (error.message === 'Scan not found') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Scan not found',
        },
      });
    }

    next(error);
  }
});

/**
 * POST /api/scans
 * Start a new scan
 */
router.post('/', async (req, res, next) => {
  try {
    // Validate request body
    const validation = startScanSchema.safeParse(req.body);
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

    const { target, scanLevel, deepScanAuthorized, authConfig } = validation.data;
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

    // Start scan
    const result = await scanService.startScan({
      target,
      scanLevel,
      tenantId,
      userId,
      deepScanAuthorized,
      authConfig,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('Failed to start scan:', error);

    // Handle specific errors
    if (error.message.includes('Nuclei is not installed')) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SCANNER_NOT_AVAILABLE',
          message: 'Nuclei scanner is not installed on the server',
        },
      });
    }

    next(error);
  }
});

/**
 * POST /api/scans/bulk
 * Start multiple scans in parallel
 */
router.post('/bulk', async (req, res, next) => {
  try {
    // Validate request body
    const validation = bulkScanSchema.safeParse(req.body);
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

    const { targets, scanLevel, deepScanAuthorized, maxConcurrent } = validation.data;
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

    logger.info(`Starting bulk scan for ${targets.length} targets with ${maxConcurrent} concurrent scans`);

    // Start bulk scan asynchronously
    const bulkScanPromise = scanService.startBulkScan({
      targets,
      scanLevel,
      tenantId,
      userId,
      deepScanAuthorized,
      maxConcurrent,
    });

    // Return immediately with batch ID
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Execute scans in background
    bulkScanPromise
      .then((results) => {
        logger.info(`Bulk scan ${batchId} completed: ${results.completed}/${results.total} successful`);
      })
      .catch((error) => {
        logger.error(`Bulk scan ${batchId} failed:`, error);
      });

    res.status(202).json({
      success: true,
      data: {
        batchId,
        totalTargets: targets.length,
        maxConcurrent,
        message: 'Bulk scan initiated. Scans are running in the background.',
        status: 'INITIATED',
      },
    });
  } catch (error: any) {
    logger.error('Failed to start bulk scan:', error);

    // Handle specific errors
    if (error.message.includes('Nuclei is not installed')) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SCANNER_NOT_AVAILABLE',
          message: 'Nuclei scanner is not installed on the server',
        },
      });
    }

    next(error);
  }
});

/**
 * POST /api/scans/ingest
 * Ingest scan results from external scanners
 */
router.post('/ingest', async (req, res) => {
  res.json({
    success: true,
    message: 'Scan ingestion endpoint - to be implemented',
  });
});

export default router;
