import { Router } from 'express';
import { z } from 'zod';
import { roeService } from '../services/roe.service';
import { requireAuth, enforceTenantIsolation, requireRole } from '../middleware/auth.middleware';
import { ROEStatus, ScanMethod } from '@prisma/client';

const router = Router();

// Auth + tenant guard for all ROE routes
router.use(requireAuth);
router.use(enforceTenantIsolation);

// Schemas
const createSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  scopeDomains: z.array(z.string()).default([]),
  scopeIPs: z.array(z.string()).default([]),
  scopeUrls: z.array(z.string()).default([]),
  excludedTargets: z.array(z.string()).default([]),
  allowedMethods: z.array(z.nativeEnum(ScanMethod)).default([ScanMethod.BASELINE]),
  validationEnabled: z.boolean().default(false),
  validationRequiresApproval: z.boolean().default(true),
  validationMaxAttempts: z.number().int().min(1).default(3),
  validationTimeout: z.number().int().min(1).default(300),
  maxRequestsPerSecond: z.number().int().min(1).default(150),
  maxConcurrentScans: z.number().int().min(1).default(3),
  allowedStartTime: z.string().optional(),
  allowedEndTime: z.string().optional(),
  allowedDaysOfWeek: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date(),
});

const updateSchema = createSchema.partial().extend({ status: z.nativeEnum(ROEStatus).optional() });

// GET /api/roe - List all ROEs for tenant
router.get('/', async (req, res, next) => {
  try {
    const roes = await roeService.getAllROEs(req.tenantId!);
    res.json({ success: true, data: roes });
  } catch (err) {
    next(err);
  }
});

// GET /api/roe/active - Active ROEs
router.get('/active', async (req, res, next) => {
  try {
    const roes = await roeService.getActiveROEs(req.tenantId!);
    res.json({ success: true, data: roes });
  } catch (err) {
    next(err);
  }
});

// POST /api/roe - Create (ADMIN/ANALYST)
router.post('/', requireRole('ADMIN', 'ANALYST'), async (req, res, next) => {
  try {
    const parsed = createSchema.parse(req.body);
    const roe = await roeService.createROE({
      ...parsed,
      tenantId: req.tenantId!,
      createdById: req.user!.userId,
    } as any);
    res.status(201).json({ success: true, data: roe });
  } catch (err) {
    next(err);
  }
});

// GET /api/roe/:id - Details
router.get('/:id', async (req, res, next) => {
  try {
    const roe = await roeService.getROE(req.params.id, req.tenantId!);
    res.json({ success: true, data: roe });
  } catch (err) {
    next(err);
  }
});

// PUT /api/roe/:id - Update (ADMIN only)
router.put('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = updateSchema.parse(req.body);
    const roe = await roeService.updateROE(req.params.id, req.tenantId!, parsed);
    res.json({ success: true, data: roe });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/roe/:id - Delete (ADMIN only)
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await roeService.deleteROE(req.params.id, req.tenantId!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/roe/:id/approve - Approve (ADMIN only)
router.post('/:id/approve', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const roe = await roeService.approveROE(req.params.id, req.user!.userId, req.tenantId!);
    res.json({ success: true, data: roe });
  } catch (err) {
    next(err);
  }
});

// POST /api/roe/:id/revoke - Revoke (ADMIN only)
router.post('/:id/revoke', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const reason = (req.body?.reason as string) || 'Revoked by user';
    const roe = await roeService.revokeROE(req.params.id, reason, req.user!.userId, req.tenantId!);
    res.json({ success: true, data: roe });
  } catch (err) {
    next(err);
  }
});

// GET /api/roe/:id/validate - Check time window and validity
router.get('/:id/validate', async (req, res, next) => {
  try {
    const isValid = await roeService.validateTimeWindow(req.params.id, req.tenantId!);
    res.json({ success: true, data: { isValid } });
  } catch (err) {
    next(err);
  }
});

// POST /api/roe/validate-target - Check if a target is within scope
router.post('/validate-target', async (req, res, next) => {
  try {
    const { target, roeId } = req.body;
    if (!target || !roeId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'target and roeId are required' } });
    }
    const isValid = await roeService.validateTarget(target, roeId, req.tenantId!);
    res.json({ success: true, data: { isValid } });
  } catch (err) {
    next(err);
  }
});

export default router;
