/**
 * Asset Management Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, enforceTenantIsolation, requireRole } from '../middleware/auth.middleware';
import { AssetService } from '../services/asset.service';

const router = Router();
const assetService = new AssetService();

// Apply authentication to all routes
router.use(requireAuth);
router.use(enforceTenantIsolation);

// Validation schemas
const createAssetSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['DOMAIN', 'IP', 'APPLICATION', 'API', 'CLOUD_RESOURCE', 'NETWORK_DEVICE']),
  environment: z.enum(['PRODUCTION', 'STAGING', 'DEVELOPMENT', 'TEST']).optional(),
  criticality: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  identifier: z.string().optional(),
  ipAddress: z.string().optional(),
  ipAddresses: z.array(z.string()).optional(),
  hostname: z.string().optional(),
  url: z.string().url().optional(),
  services: z.array(z.string()).optional(),
  parentAssetId: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  owner: z.string().optional(),
  source: z.array(z.string()).optional(),
});

const updateAssetSchema = createAssetSchema.partial();

const bulkCreateSchema = z.object({
  assets: z.array(createAssetSchema),
  source: z.string().optional(),
});

const promoteFromExposureSchema = z.object({
  subdomain: z.string().min(1),
  parentDomain: z.string().optional(),
});

/**
 * GET /api/assets
 * List assets with filtering and pagination
 */
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = req.query.search as string;
    const type = req.query.type as string;
    const environment = req.query.environment as string;
    const criticality = req.query.criticality as string;

    const result = await assetService.listAssets(req.tenantId!, {
      page,
      limit,
      search,
      type,
      environment,
      criticality,
    });

    res.json({
      success: true,
      data: result.assets,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/assets/stats
 * Get asset statistics for dashboard
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await assetService.getAssetStats(req.tenantId!);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/assets/:id
 * Get asset details
 */
router.get('/:id', async (req, res, next) => {
  try {
    const asset = await assetService.getAssetById(req.params.id, req.tenantId!);

    res.json({
      success: true,
      data: asset,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/assets
 * Create new asset
 */
router.post('/', requireRole('ADMIN', 'ANALYST'), async (req, res, next) => {
  try {
    const data = createAssetSchema.parse(req.body);

    const asset = await assetService.createAsset(
      req.tenantId!,
      req.user!.userId,
      data as any
    );

    res.status(201).json({
      success: true,
      data: asset,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/assets/:id
 * Update asset
 */
router.put('/:id', requireRole('ADMIN', 'ANALYST'), async (req, res, next) => {
  try {
    const data = updateAssetSchema.parse(req.body);

    const asset = await assetService.updateAsset(
      req.params.id,
      req.tenantId!,
      data
    );

    res.json({
      success: true,
      data: asset,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/assets/:id
 * Delete asset
 */
router.delete('/:id', requireRole('ADMIN', 'ANALYST'), async (req, res, next) => {
  try {
    await assetService.deleteAsset(req.params.id, req.tenantId!);

    res.json({
      success: true,
      message: 'Asset deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/assets/:id/vulnerabilities
 * Get vulnerabilities for specific asset
 */
router.get('/:id/vulnerabilities', async (req, res, next) => {
  try {
    const vulnerabilities = await assetService.getAssetVulnerabilities(
      req.params.id,
      req.tenantId!
    );

    res.json({
      success: true,
      data: vulnerabilities,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/assets/:id/scans
 * Get scan history for asset
 */
router.get('/:id/scans', async (req, res, next) => {
  try {
    const scans = await assetService.getAssetScans(
      req.params.id,
      req.tenantId!
    );

    res.json({
      success: true,
      data: scans,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/assets/:id/hierarchy
 * Get asset hierarchy (parent and children)
 */
router.get('/:id/hierarchy', async (req, res, next) => {
  try {
    const hierarchy = await assetService.getAssetHierarchy(
      req.params.id,
      req.tenantId!
    );

    res.json({
      success: true,
      data: hierarchy,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/assets/bulk
 * Bulk create assets
 */
router.post('/bulk', requireRole('ADMIN', 'ANALYST'), async (req, res, next) => {
  try {
    const { assets, source } = bulkCreateSchema.parse(req.body);

    const results = await assetService.bulkCreateAssets(
      req.tenantId!,
      req.user!.userId,
      assets as any,
      source
    );

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/assets/promote
 * Promote subdomain from exposure to full asset
 */
router.post('/promote', requireRole('ADMIN', 'ANALYST'), async (req, res, next) => {
  try {
    const { subdomain, parentDomain } = promoteFromExposureSchema.parse(req.body);

    const asset = await assetService.promoteFromExposure(
      req.tenantId!,
      req.user!.userId,
      subdomain,
      parentDomain
    );

    res.json({
      success: true,
      data: asset,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
