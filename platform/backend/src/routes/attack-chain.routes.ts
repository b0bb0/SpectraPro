/**
 * Attack Chain Routes
 */

import { Router } from 'express';
import { requireAuth, enforceTenantIsolation } from '../middleware/auth.middleware';
import { AttackChainService } from '../services/attack-chain.service';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = Router();
const attackChainService = new AttackChainService();

router.use(requireAuth);
router.use(enforceTenantIsolation);

// Validation schemas
const createAttackChainSchema = z.object({
  scanId: z.string().min(1, 'Scan ID is required'),
  reconSessionId: z.string().nullable().optional(),
  vulnerabilityIds: z.array(z.string()).optional().default([]),
  exploitAttemptIds: z.array(z.string()).optional().default([]),
  impactSummary: z.string().min(1, 'Impact summary is required'),
});

const addStepSchema = z.object({
  stepType: z.enum(['RECON', 'VULN_DISCOVERY', 'EXPLOITATION', 'IMPACT_ASSESSMENT']),
  stepData: z.any(),
});

const trackChangeSchema = z.object({
  assetId: z.string().min(1, 'Asset ID is required'),
  currentScanId: z.string().min(1, 'Current scan ID is required'),
});

const updateTimelineSchema = z.object({
  assetId: z.string().min(1, 'Asset ID is required'),
  eventType: z.enum(['DISCOVERED', 'VULNERABLE', 'EXPLOITED', 'RISK_CHANGED']),
  eventData: z.any(),
});

/**
 * POST /api/attack-chains
 * Create a new attack chain
 */
router.post('/', async (req, res, next) => {
  try {
    const validation = createAttackChainSchema.safeParse(req.body);
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

    const { scanId, reconSessionId, vulnerabilityIds, exploitAttemptIds, impactSummary } =
      validation.data;
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

    const chainId = await attackChainService.createAttackChain(
      scanId,
      reconSessionId || null,
      vulnerabilityIds,
      exploitAttemptIds,
      impactSummary,
      tenantId
    );

    res.status(201).json({
      success: true,
      data: {
        chainId,
        scanId,
        message: 'Attack chain created',
      },
    });
  } catch (error: any) {
    logger.error('Failed to create attack chain:', error);
    next(error);
  }
});

/**
 * POST /api/attack-chains/:chainId/step
 * Add a step to an existing attack chain
 */
router.post('/:chainId/step', async (req, res, next) => {
  try {
    const validation = addStepSchema.safeParse(req.body);
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

    const { stepType, stepData } = validation.data;
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

    await attackChainService.addAttackChainStep(
      req.params.chainId,
      stepType,
      stepData,
      tenantId
    );

    res.status(201).json({
      success: true,
      data: {
        chainId: req.params.chainId,
        stepType,
        message: 'Attack chain step added',
      },
    });
  } catch (error: any) {
    logger.error('Failed to add attack chain step:', error);
    next(error);
  }
});

/**
 * GET /api/attack-chains/:chainId
 * Get complete attack chain with all steps
 */
router.get('/:chainId', async (req, res, next) => {
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

    const chain = await attackChainService.getAttackChain(req.params.chainId, tenantId);

    if (!chain) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Attack chain not found',
        },
      });
    }

    res.json({
      success: true,
      data: chain,
    });
  } catch (error: any) {
    logger.error('Failed to get attack chain:', error);
    next(error);
  }
});

/**
 * GET /api/attack-chains/scan/:scanId
 * Get all attack chains for a scan
 */
router.get('/scan/:scanId', async (req, res, next) => {
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

    const chains = await attackChainService.getAttackChainsForScan(req.params.scanId, tenantId);

    res.json({
      success: true,
      data: {
        scanId: req.params.scanId,
        chains,
        totalChains: chains.length,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get attack chains for scan:', error);
    next(error);
  }
});

/**
 * POST /api/attack-chains/timeline
 * Update asset timeline with event
 */
router.post('/timeline', async (req, res, next) => {
  try {
    const validation = updateTimelineSchema.safeParse(req.body);
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

    const { assetId, eventType, eventData } = validation.data;
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

    await attackChainService.updateAssetTimeline(assetId, eventType, eventData, tenantId);

    res.status(201).json({
      success: true,
      data: {
        assetId,
        eventType,
        message: 'Asset timeline updated',
      },
    });
  } catch (error: any) {
    logger.error('Failed to update asset timeline:', error);
    next(error);
  }
});

/**
 * POST /api/attack-chains/detect-changes
 * Detect and track changes between scans
 */
router.post('/detect-changes', async (req, res, next) => {
  try {
    const validation = trackChangeSchema.safeParse(req.body);
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

    const { assetId, currentScanId } = validation.data;
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

    await attackChainService.detectChanges(assetId, currentScanId, tenantId);

    res.json({
      success: true,
      data: {
        assetId,
        currentScanId,
        message: 'Change detection completed',
      },
    });
  } catch (error: any) {
    logger.error('Failed to detect changes:', error);
    next(error);
  }
});

export default router;
