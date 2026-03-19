import { Router } from 'express';
import { z } from 'zod';
import { IntegrationAuthType, IntegrationType } from '@prisma/client';
import { requireAuth, enforceTenantIsolation } from '../middleware/auth.middleware';
import { integrationsService } from '../services/integrations.service';
import { shodanAssessmentService } from '../services/shodan-assessment.service';
import { nmapAssessmentService } from '../services/nmap-assessment.service';
import { logger } from '../utils/logger';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

const createIntegrationSchema = z.object({
  name: z.string().min(1),
  provider: z.string().optional(),
  type: z.nativeEnum(IntegrationType).default(IntegrationType.HTTP_JSON),
  endpointUrl: z.string().url().optional(),
  query: z.string().optional(),
  authType: z.nativeEnum(IntegrationAuthType).default(IntegrationAuthType.NONE),
  authValue: z.string().optional(),
  customHeaderName: z.string().optional(),
});

const shodanAssessSchema = z.object({
  target: z.string().min(1, 'target is required'),
});

const nmapAssessSchema = z.object({
  target: z.string().min(1, 'target is required'),
});

router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    const integrations = await integrationsService.list(tenantId);
    res.json({ success: true, data: integrations });
  } catch (error) {
    logger.error('Failed to list integrations:', error);
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;
    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_AUTH_DATA', message: 'Authentication data not found' },
      });
    }

    const parsed = createIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.errors[0];
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: firstIssue?.message || 'Validation failed',
          details: parsed.error.errors,
        },
      });
    }

    const resolvedEndpointUrl =
      parsed.data.type === IntegrationType.SHODAN
        ? 'https://api.shodan.io/shodan/host/search'
        : parsed.data.endpointUrl;

    if (!resolvedEndpointUrl) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'endpointUrl is required for HTTP_JSON integrations' },
      });
    }

    if (parsed.data.type === IntegrationType.SHODAN) {
      if (!parsed.data.query) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'query is required for SHODAN integrations' },
        });
      }
      if (!parsed.data.authValue) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Shodan API key is required' },
        });
      }
    } else if (parsed.data.authType !== IntegrationAuthType.NONE && !parsed.data.authValue) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'authValue is required when authType is not NONE' },
      });
    }

    const integration = await integrationsService.create({
      name: parsed.data.name,
      provider: parsed.data.provider,
      type: parsed.data.type,
      endpointUrl: resolvedEndpointUrl,
      query: parsed.data.query,
      authType: parsed.data.type === IntegrationType.SHODAN ? IntegrationAuthType.API_KEY : parsed.data.authType,
      authValue: parsed.data.authValue,
      customHeaderName: parsed.data.customHeaderName,
      tenantId,
      userId,
    });

    res.status(201).json({ success: true, data: integration });
  } catch (error) {
    logger.error('Failed to create integration:', error);
    next(error);
  }
});

const updateIntegrationSchema = z.object({
  name: z.string().min(1).optional(),
  authValue: z.string().optional(),
  query: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.put('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    const parsed = updateIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Validation failed' },
      });
    }

    const integration = await integrationsService.update(req.params.id, tenantId, parsed.data);
    res.json({ success: true, data: integration });
  } catch (error: any) {
    if (error.message === 'Integration not found') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Integration not found' },
      });
    }
    logger.error('Failed to update integration:', error);
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    await integrationsService.delete(req.params.id, tenantId);
    res.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Integration not found') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Integration not found' },
      });
    }
    logger.error('Failed to delete integration:', error);
    next(error);
  }
});

router.post('/:id/sync', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    const result = await integrationsService.sync(req.params.id, tenantId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message === 'Integration not found') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Integration not found' },
      });
    }
    logger.error('Failed to sync integration:', error);
    next(error);
  }
});

router.get('/:id/records', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500);
    const records = await integrationsService.getRecords(req.params.id, tenantId, limit);
    res.json({ success: true, data: records });
  } catch (error) {
    logger.error('Failed to fetch integration records:', error);
    next(error);
  }
});

router.post('/shodan/assess', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    const parsed = shodanAssessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message || 'Validation failed',
          details: parsed.error.errors,
        },
      });
    }

    const result = await shodanAssessmentService.assessTarget(tenantId, parsed.data.target);
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message?.includes('No SHODAN integration API key')) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_SHODAN_KEY', message: error.message },
      });
    }
    logger.error('Failed to assess Shodan target:', error);
    next(error);
  }
});

router.post('/nmap/assess', async (req, res, next) => {
  try {
    const parsed = nmapAssessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message || 'Validation failed',
          details: parsed.error.errors,
        },
      });
    }

    const result = await nmapAssessmentService.assessTarget(parsed.data.target);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Failed to assess Nmap target:', error);
    next(error);
  }
});

export default router;
