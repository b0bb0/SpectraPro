/**
 * Impact Assessment Routes
 */

import { Router } from 'express';
import { requireAuth, enforceTenantIsolation, requireRole } from '../middleware/auth.middleware';
import { ImpactAssessmentService } from '../services/impact-assessment.service';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = Router();
const impactService = new ImpactAssessmentService();

router.use(requireAuth);
router.use(enforceTenantIsolation);

// Validation schemas
const assessImpactSchema = z.object({
  vulnerabilityId: z.string().min(1, 'Vulnerability ID is required'),
  exploitAttemptId: z.string().min(1, 'Exploit attempt ID is required'),
});

/**
 * POST /api/impact/assess
 * Create impact assessment for a vulnerability (role-gated: ANALYST or ADMIN)
 */
router.post('/assess', requireRole('ANALYST', 'ADMIN'), async (req, res, next) => {
  try {
    const validation = assessImpactSchema.safeParse(req.body);
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

    const { vulnerabilityId, exploitAttemptId } = validation.data;
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

    const assessmentId = await impactService.assessImpact(
      vulnerabilityId,
      exploitAttemptId,
      userId,
      tenantId
    );

    res.status(201).json({
      success: true,
      data: {
        assessmentId,
        vulnerabilityId,
        exploitAttemptId,
        message: 'Impact assessment created',
      },
    });
  } catch (error: any) {
    logger.error('Failed to assess impact:', error);

    if (error.message?.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: error.message,
        },
      });
    }

    if (error.message?.includes('not exploited')) {
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
 * GET /api/impact/vulnerability/:vulnerabilityId
 * Get impact assessment for a vulnerability
 */
router.get('/vulnerability/:vulnerabilityId', async (req, res, next) => {
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

    const assessment = await impactService.getImpactAssessment(
      req.params.vulnerabilityId,
      tenantId
    );

    if (!assessment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Impact assessment not found',
        },
      });
    }

    res.json({
      success: true,
      data: assessment,
    });
  } catch (error: any) {
    logger.error('Failed to get impact assessment:', error);
    next(error);
  }
});

/**
 * GET /api/impact/high-impact
 * Get all high/critical impact assessments
 */
router.get('/high-impact', async (req, res, next) => {
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

    const assessments = await impactService.getHighImpactAssessments(tenantId);

    res.json({
      success: true,
      data: {
        assessments,
        totalCount: assessments.length,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get high impact assessments:', error);
    next(error);
  }
});

export default router;
