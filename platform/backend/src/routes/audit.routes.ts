/**
 * Audit Log Routes (Admin only)
 */

import { Router } from 'express';
import { requireAuth, enforceTenantIsolation, requireRole } from '../middleware/auth.middleware';
import { auditService } from '../services/audit.service';
import { AuditAction } from '@prisma/client';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);
router.use(requireRole('ADMIN'));

/**
 * GET /api/audit
 * List audit logs with filtering
 */
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const action = req.query.action as AuditAction | undefined;
    const resource = req.query.resource as string | undefined;
    const userId = req.query.userId as string | undefined;

    // Parse date range
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (req.query.startDate) {
      startDate = new Date(req.query.startDate as string);
    }

    if (req.query.endDate) {
      endDate = new Date(req.query.endDate as string);
    }

    const result = await auditService.getAuditLogs({
      tenantId: req.tenantId!,
      page,
      limit,
      action,
      resource,
      userId,
      startDate,
      endDate,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/audit/stats
 * Get audit log statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const stats = await auditService.getStats(req.tenantId!, days);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/audit/export
 * Export audit logs to CSV
 */
router.get('/export', async (req, res, next) => {
  try {
    const action = req.query.action as AuditAction | undefined;
    const resource = req.query.resource as string | undefined;
    const userId = req.query.userId as string | undefined;

    // Parse date range
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (req.query.startDate) {
      startDate = new Date(req.query.startDate as string);
    }

    if (req.query.endDate) {
      endDate = new Date(req.query.endDate as string);
    }

    const csv = await auditService.exportToCSV({
      tenantId: req.tenantId!,
      action,
      resource,
      userId,
      startDate,
      endDate,
    });

    // Log the export action
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    await auditService.logExport(
      'AuditLog',
      req.user!.userId,
      req.tenantId!,
      { filters: { action, resource, userId, startDate, endDate } },
      ipAddress,
      userAgent
    );

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${new Date().toISOString()}.csv`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

export default router;
