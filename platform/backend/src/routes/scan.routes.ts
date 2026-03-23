/**
 * Scan Management Routes
 */

import { Router } from 'express';
import { requireAuth, enforceTenantIsolation } from '../middleware/auth.middleware';
import { scanService } from '../services/scan.service';
import { AssetService } from '../services/asset.service';
import { prisma } from '../utils/prisma';
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
 * Ingest scan results from the Python CLI scanner or external tools.
 * Accepts Nuclei JSONL results and creates a scan record with vulnerabilities.
 */
const ingestSchema = z.object({
  target: z.string().min(1),
  scanLevel: z.enum(['light', 'normal', 'extreme']).default('normal'),
  results: z.array(z.object({
    'template-id': z.string(),
    info: z.object({
      name: z.string(),
      severity: z.string(),
      description: z.string().optional().default(''),
      tags: z.array(z.string()).optional().default([]),
      classification: z.object({
        'cvss-score': z.number().optional(),
        'cve-id': z.array(z.string()).optional(),
      }).optional(),
    }),
    host: z.string().optional().default(''),
    matched_at: z.string().optional().default(''),
    request: z.string().optional(),
    response: z.string().optional(),
    'curl-command': z.string().optional(),
    'matcher-name': z.string().optional(),
  })).default([]),
});

router.post('/ingest', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user?.userId;

    const validation = ingestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', details: validation.error.issues },
      });
    }

    const { target, scanLevel, results } = validation.data;

    // Create scan record
    const scan = await prisma.scans.create({
      data: {
        name: `CLI Ingest - ${target}`,
        type: 'NUCLEI',
        status: 'COMPLETED',
        targetCount: 1,
        vulnFound: results.length,
        criticalCount: results.filter(r => r.info.severity.toLowerCase() === 'critical').length,
        highCount: results.filter(r => r.info.severity.toLowerCase() === 'high').length,
        mediumCount: results.filter(r => r.info.severity.toLowerCase() === 'medium').length,
        lowCount: results.filter(r => r.info.severity.toLowerCase() === 'low').length,
        infoCount: results.filter(r => r.info.severity.toLowerCase() === 'info').length,
        startedAt: new Date(),
        completedAt: new Date(),
        tenantId,
      },
    });

    // Find or create asset for this target
    const assetService = new AssetService();
    const normalizedTarget = target.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(normalizedTarget);
    const assetResult = await assetService.findOrCreateAsset(
      tenantId,
      userId || 'system',
      { name: normalizedTarget, type: isIp ? 'IP' : 'DOMAIN', url: target },
      'cli-ingest'
    );
    const asset = assetResult.asset;

    // Store vulnerabilities using the existing service method
    if (results.length > 0) {
      await scanService.ingestVulnerabilities(results as any, scan.id, tenantId, asset.id);
    }

    // Link asset to scan
    await prisma.scans.update({
      where: { id: scan.id },
      data: { assetId: asset.id },
    });

    res.status(201).json({
      success: true,
      data: {
        scanId: scan.id,
        assetId: asset.id,
        vulnerabilitiesIngested: results.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
