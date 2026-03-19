/**
 * Exposure Module API Routes
 * Subdomain enumeration and attack surface discovery
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, enforceTenantIsolation, requireRole } from '../middleware/auth.middleware';
import { exposureOrchestrationService } from '../services/exposure-orchestration.service';
import { subdomainEnumerationService } from '../services/subdomain-enumeration.service';
import { logger } from '../utils/logger';

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);
router.use(enforceTenantIsolation);

// Validation schemas
const enumerateSchema = z.object({
  domain: z.string().min(3).max(253),
});

/**
 * POST /api/exposure/enumerate
 * Start subdomain enumeration scan
 */
router.post('/enumerate', requireRole('ADMIN', 'ANALYST'), async (req, res, next) => {
  try {
    // Validate request
    const { domain } = enumerateSchema.parse(req.body);

    // Check rate limit
    const canScan = await exposureOrchestrationService.checkRateLimit(req.tenantId!);
    if (!canScan) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Maximum scans per hour exceeded. Please try again later.',
        },
      });
    }

    // Validate domain format
    const validation = subdomainEnumerationService.validateDomain(domain);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DOMAIN',
          message: validation.error || 'Invalid domain format',
        },
      });
    }

    // Start scan
    const scanId = await exposureOrchestrationService.startExposureScan({
      domain: validation.normalized,
      tenantId: req.tenantId!,
      userId: req.user?.userId,
    });

    logger.info(`[EXPOSURE] Scan started: ${scanId} for domain: ${validation.normalized}`);

    res.status(202).json({
      success: true,
      data: {
        scanId,
        status: 'PENDING',
        message: 'Subdomain enumeration started',
      },
    });
  } catch (error: any) {
    logger.error('[EXPOSURE] Enumeration start error:', error);
    next(error);
  }
});

/**
 * GET /api/exposure/scans
 * List exposure scans for tenant
 */
router.get('/scans', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const scans = await exposureOrchestrationService.listScans(req.tenantId!, limit);

    res.json({
      success: true,
      data: scans,
    });
  } catch (error: any) {
    logger.error('[EXPOSURE] List scans error:', error);
    next(error);
  }
});

/**
 * GET /api/exposure/scans/:id
 * Get specific exposure scan with subdomains
 */
router.get('/scans/:id', async (req, res, next) => {
  try {
    const scan = await exposureOrchestrationService.getScanById(
      req.params.id,
      req.tenantId!
    );

    res.json({
      success: true,
      data: scan,
    });
  } catch (error: any) {
    if (error.message === 'Scan not found') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SCAN_NOT_FOUND',
          message: 'Exposure scan not found',
        },
      });
    }

    logger.error('[EXPOSURE] Get scan error:', error);
    next(error);
  }
});

/**
 * POST /api/exposure/scans/:id/kill
 * Terminate a running exposure scan and tracked subprocesses
 */
router.post('/scans/:id/kill', requireRole('ADMIN', 'ANALYST'), async (req, res, next) => {
  try {
    const result = await exposureOrchestrationService.killScan(req.params.id, req.tenantId!, req.user!.userId);

    res.json({
      success: true,
      data: {
        scanId: req.params.id,
        ...result,
      },
    });
  } catch (error: any) {
    if (error.message === 'Scan not found') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SCAN_NOT_FOUND',
          message: 'Exposure scan not found',
        },
      });
    }
    logger.error('[EXPOSURE] Kill scan error:', error);
    next(error);
  }
});

/**
 * DELETE /api/exposure/scans/:id
 * Delete exposure scan
 */
router.delete('/scans/:id', requireRole('ADMIN', 'ANALYST'), async (req, res, next) => {
  try {
    await exposureOrchestrationService.deleteScan(req.params.id, req.tenantId!);

    res.json({
      success: true,
      message: 'Exposure scan deleted successfully',
    });
  } catch (error: any) {
    if (error.message === 'Scan not found') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SCAN_NOT_FOUND',
          message: 'Exposure scan not found',
        },
      });
    }

    logger.error('[EXPOSURE] Delete scan error:', error);
    next(error);
  }
});

/**
 * GET /api/exposure/check-sublist3r
 * Check if Sublist3r is installed
 */
router.get('/check-sublist3r', async (req, res, next) => {
  try {
    const installed = await subdomainEnumerationService.checkSublist3rInstalled();

    res.json({
      success: true,
      data: {
        installed,
        message: installed
          ? 'Sublist3r is installed and ready'
          : 'Sublist3r is not installed. Please install with: pip3 install sublist3r',
      },
    });
  } catch (error: any) {
    logger.error('[EXPOSURE] Check Sublist3r error:', error);
    next(error);
  }
});

/**
 * POST /api/exposure/sync-to-assets
 * Sync existing exposure scan results to asset hierarchy
 */
router.post('/sync-to-assets', requireRole('ADMIN', 'ANALYST'), async (req, res, next) => {
  try {
    const scanId = req.body.scanId as string | undefined;

    logger.info(`[EXPOSURE] Starting sync to assets for tenant ${req.tenantId}, scanId: ${scanId || 'all'}`);

    const results = await exposureOrchestrationService.syncExposureScansToAssets(
      req.tenantId!,
      req.user!.userId,
      scanId
    );

    res.json({
      success: true,
      data: results,
      message: `Successfully synced ${results.scansProcessed} scans. Created ${results.assetsCreated} assets, updated ${results.assetsUpdated}.`,
    });
  } catch (error: any) {
    logger.error('[EXPOSURE] Sync to assets error:', error);
    next(error);
  }
});

export default router;
