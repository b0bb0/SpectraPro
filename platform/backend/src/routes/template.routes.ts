/**
 * Template Routes
 * API endpoints for managing custom Nuclei templates
 */

import { Router } from 'express';
import { templateService } from '../services/template.service';
import { requireAuth, enforceTenantIsolation } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = Router();

// Apply authentication and tenant isolation to all routes
router.use(requireAuth);
router.use(enforceTenantIsolation);

// Zod validation schemas
const createTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
  content: z.string().min(1, 'Template content is required'),
  fileName: z.string().min(1, 'File name is required').regex(/^[a-zA-Z0-9_-]+\.yaml$/, 'File name must end with .yaml'),
});

const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'VALIDATING', 'FAILED']),
});

/**
 * GET /api/templates
 * Get all templates for the authenticated user's tenant
 */
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { status, category, severity } = req.query;

    const templates = await templateService.getTemplates(tenantId, {
      status: status as any,
      category: category as any,
      severity: severity as any,
    });

    res.json({
      success: true,
      data: templates,
    });
  } catch (error: any) {
    logger.error('Failed to fetch templates:', error);
    next(error);
  }
});

/**
 * GET /api/templates/:id
 * Get a specific template by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const template = await templateService.getTemplateById(id, tenantId);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Template not found',
        },
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    logger.error('Failed to fetch template:', error);
    next(error);
  }
});

/**
 * POST /api/templates
 * Create a new custom template
 */
router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const uploadedById = req.user!.userId;

    // Validate request body
    const validation = createTemplateSchema.safeParse(req.body);

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

    const { name, description, content, fileName } = validation.data;

    // Create template
    const template = await templateService.createTemplate({
      name,
      description,
      content,
      fileName,
      tenantId,
      uploadedById,
    });

    res.status(201).json({
      success: true,
      data: template,
      message: 'Template created successfully',
    });
  } catch (error: any) {
    logger.error('Failed to create template:', error);
    next(error);
  }
});

/**
 * POST /api/templates/validate
 * Validate a template without saving it
 */
router.post('/validate', async (req, res, next) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Template content is required',
        },
      });
    }

    const validation = await templateService.validateTemplate(content);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TEMPLATE',
          message: validation.error,
        },
      });
    }

    res.json({
      success: true,
      data: {
        isValid: true,
        metadata: validation.metadata,
      },
      message: 'Template is valid',
    });
  } catch (error: any) {
    logger.error('Failed to validate template:', error);
    next(error);
  }
});

/**
 * PATCH /api/templates/:id/status
 * Update template status (activate/deactivate)
 */
router.patch('/:id/status', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    // Validate request body
    const validation = updateStatusSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid status',
          details: validation.error.errors,
        },
      });
    }

    const { status } = validation.data;

    const template = await templateService.updateTemplateStatus(id, tenantId, status);

    res.json({
      success: true,
      data: template,
      message: 'Template status updated',
    });
  } catch (error: any) {
    logger.error('Failed to update template status:', error);
    next(error);
  }
});

/**
 * DELETE /api/templates/:id
 * Delete a template
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    await templateService.deleteTemplate(id, tenantId);

    res.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error: any) {
    logger.error('Failed to delete template:', error);
    next(error);
  }
});

export default router;
