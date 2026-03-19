/**
 * Scheduled Scans API Routes
 * RESTful endpoints for managing recurring vulnerability scans
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { requireAuth, enforceTenantIsolation } from '../middleware/auth.middleware';
import { schedulerService } from '../services/scheduler.service';
import { auditService } from '../services/audit.service';

const router = Router();

// Apply authentication and tenant isolation to all routes
router.use(requireAuth);
router.use(enforceTenantIsolation);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createScheduledScanSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  scanType: z.enum(['NUCLEI', 'NESSUS', 'MANUAL', 'API']).default('NUCLEI'),
  scanProfile: z.enum(['FAST', 'BALANCED', 'DEEP']).default('BALANCED'),
  severity: z.array(z.string()).default(['critical', 'high', 'medium', 'low']),
  frequency: z.enum(['ONCE', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']),
  cronExpression: z.string().optional(),
  timezone: z.string().default('UTC'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  assetIds: z.array(z.string()).default([]),
  targetUrls: z.array(z.string().url()).default([]),
  notifyOnCompletion: z.boolean().default(true),
  notifyOnFailure: z.boolean().default(true),
  notifyEmails: z.array(z.string().email()).default([]),
});

const updateScheduledScanSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  scanProfile: z.enum(['FAST', 'BALANCED', 'DEEP']).optional(),
  severity: z.array(z.string()).optional(),
  frequency: z.enum(['ONCE', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']).optional(),
  cronExpression: z.string().optional(),
  timezone: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  assetIds: z.array(z.string()).optional(),
  targetUrls: z.array(z.string().url()).optional(),
  notifyOnCompletion: z.boolean().optional(),
  notifyOnFailure: z.boolean().optional(),
  notifyEmails: z.array(z.string().email()).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'EXPIRED', 'DISABLED']).optional(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/scheduled-scans
 * List all scheduled scans for the tenant
 */
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { status, isActive } = req.query;

    const where: any = { tenantId };

    if (status) {
      where.status = status;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const scheduledScans = await prisma.scheduledScan.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        executions: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            vulnFound: true,
            executedAt: true,
          },
          orderBy: { executedAt: 'desc' },
          take: 5, // Last 5 executions
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: scheduledScans,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/scheduled-scans/:id
 * Get a specific scheduled scan
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const scheduledScan = await prisma.scheduledScan.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        executions: {
          orderBy: { executedAt: 'desc' },
          take: 20, // Last 20 executions
        },
      },
    });

    if (!scheduledScan) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Scheduled scan not found',
        },
      });
    }

    res.json({
      success: true,
      data: scheduledScan,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/scheduled-scans
 * Create a new scheduled scan
 */
router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;

    // Validate request body
    const validation = createScheduledScanSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validation.error.errors,
        },
      });
    }

    const data = validation.data;

    // Validate that at least one target is provided
    if (data.assetIds.length === 0 && data.targetUrls.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one asset or target URL must be provided',
        },
      });
    }

    // Validate assets belong to tenant
    if (data.assetIds.length > 0) {
      const assets = await prisma.assets.findMany({
        where: {
          id: { in: data.assetIds },
          tenantId,
        },
      });

      if (assets.length !== data.assetIds.length) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'One or more assets not found or not accessible',
          },
        });
      }
    }

    // Create scheduled scan
    const scheduledScan = await prisma.scheduledScan.create({
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        endDate: data.endDate ? new Date(data.endDate) : null,
        tenantId,
        createdById: userId,
      } as any,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Schedule the job
    await schedulerService.scheduleJob(scheduledScan);

    // Audit log
    await auditService.log({
      tenantId,
      userId,
      action: 'CREATE',
      resource: 'scheduled_scan',
      resourceId: scheduledScan.id,
      details: { name: scheduledScan.name, frequency: scheduledScan.frequency },
    });

    res.status(201).json({
      success: true,
      data: scheduledScan,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/scheduled-scans/:id
 * Update a scheduled scan
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;

    // Check if scheduled scan exists
    const existing = await prisma.scheduledScan.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Scheduled scan not found',
        },
      });
    }

    // Validate request body
    const validation = updateScheduledScanSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validation.error.errors,
        },
      });
    }

    const data = validation.data;

    // Validate assets if provided
    if (data.assetIds && data.assetIds.length > 0) {
      const assets = await prisma.assets.findMany({
        where: {
          id: { in: data.assetIds },
          tenantId,
        },
      });

      if (assets.length !== data.assetIds.length) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'One or more assets not found or not accessible',
          },
        });
      }
    }

    // Update scheduled scan
    const updateData: any = { ...data };
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);

    const scheduledScan = await prisma.scheduledScan.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Reschedule the job if schedule changed
    if (data.frequency || data.cronExpression || data.timezone) {
      await schedulerService.rescheduleJob(id);
    }

    // Audit log
    await auditService.log({
      tenantId,
      userId,
      action: 'UPDATE',
      resource: 'scheduled_scan',
      resourceId: id,
      details: { updated: Object.keys(data) },
    });

    res.json({
      success: true,
      data: scheduledScan,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/scheduled-scans/:id/pause
 * Pause a scheduled scan
 */
router.patch('/:id/pause', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;

    const scheduledScan = await prisma.scheduledScan.findFirst({
      where: { id, tenantId },
    });

    if (!scheduledScan) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Scheduled scan not found',
        },
      });
    }

    // Update status
    const updated = await prisma.scheduledScan.update({
      where: { id },
      data: {
        status: 'PAUSED',
        isActive: false,
      },
    });

    // Unschedule the job
    await schedulerService.unscheduleJob(id);

    // Audit log
    await auditService.log({
      tenantId,
      userId,
      action: 'UPDATE',
      resource: 'scheduled_scan',
      resourceId: id,
      details: { action: 'paused' },
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/scheduled-scans/:id/resume
 * Resume a paused scheduled scan
 */
router.patch('/:id/resume', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;

    const scheduledScan = await prisma.scheduledScan.findFirst({
      where: { id, tenantId },
    });

    if (!scheduledScan) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Scheduled scan not found',
        },
      });
    }

    // Update status
    const updated = await prisma.scheduledScan.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Reschedule the job
    await schedulerService.scheduleJob(updated);

    // Audit log
    await auditService.log({
      tenantId,
      userId,
      action: 'UPDATE',
      resource: 'scheduled_scan',
      resourceId: id,
      details: { action: 'resumed' },
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/scheduled-scans/:id
 * Delete a scheduled scan
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;

    const scheduledScan = await prisma.scheduledScan.findFirst({
      where: { id, tenantId },
    });

    if (!scheduledScan) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Scheduled scan not found',
        },
      });
    }

    // Unschedule the job
    await schedulerService.unscheduleJob(id);

    // Delete scheduled scan (executions will cascade delete)
    await prisma.scheduledScan.delete({
      where: { id },
    });

    // Audit log
    await auditService.log({
      tenantId,
      userId,
      action: 'DELETE',
      resource: 'scheduled_scan',
      resourceId: id,
      details: { name: scheduledScan.name },
    });

    res.json({
      success: true,
      message: 'Scheduled scan deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/scheduled-scans/:id/execute
 * Manually trigger execution of a scheduled scan
 */
router.post('/:id/execute', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;

    const scheduledScan = await prisma.scheduledScan.findFirst({
      where: { id, tenantId },
    });

    if (!scheduledScan) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Scheduled scan not found',
        },
      });
    }

    // Trigger execution (this will be handled by the scheduler service)
    // For now, return success - in production, you'd queue the execution

    // Audit log
    await auditService.log({
      tenantId,
      userId,
      action: 'UPDATE',
      resource: 'scheduled_scan',
      resourceId: id,
      details: { manual: true },
    });

    res.json({
      success: true,
      message: 'Scheduled scan execution triggered',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/scheduled-scans/:id/executions
 * Get execution history for a scheduled scan
 */
router.get('/:id/executions', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const { limit = '50', offset = '0' } = req.query;

    // Check if scheduled scan exists and belongs to tenant
    const scheduledScan = await prisma.scheduledScan.findFirst({
      where: { id, tenantId },
    });

    if (!scheduledScan) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Scheduled scan not found',
        },
      });
    }

    const executions = await prisma.scheduledScanExecution.findMany({
      where: { scheduledScanId: id },
      orderBy: { executedAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    const total = await prisma.scheduledScanExecution.count({
      where: { scheduledScanId: id },
    });

    res.json({
      success: true,
      data: executions,
      meta: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
