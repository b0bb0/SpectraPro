/**
 * Report Management Routes
 */

import { Router } from 'express';
import { requireAuth, enforceTenantIsolation } from '../middleware/auth.middleware';
import { AIReportService } from '../services/ai-report.service';
import { pdfReportService } from '../services/pdf-report.service';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

/**
 * GET /api/reports
 * List reports
 */
router.get('/', async (req, res) => {
  res.json({
    success: true,
    data: [],
    message: 'Report generation available',
  });
});

/**
 * POST /api/reports/generate
 * Generate security assessment report
 */
router.post('/generate', async (req, res, next) => {
  try {
    const { name, scanIds, type, format } = req.body;

    if (!name || !scanIds || !Array.isArray(scanIds) || scanIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Report name and scan IDs are required',
        },
      });
    }

    logger.info(`Generating report: ${name} for ${scanIds.length} scans`);

    const reportService = new AIReportService();
    const html = await reportService.generateReport(
      req.tenantId!,
      scanIds,
      name
    );

    // Set response headers for HTML download
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html"`);
    res.send(html);

    logger.info(`Report generated successfully: ${name}`);
  } catch (error: any) {
    logger.error('Report generation failed:', error);
    next(error);
  }
});

/**
 * POST /api/reports/pdf/executive
 * Generate executive summary PDF report
 */
router.post('/pdf/executive', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;

    logger.info(`Generating executive PDF report for tenant ${tenantId}`);

    const fileName = await pdfReportService.generateExecutiveSummary(tenantId, userId);
    const filePath = pdfReportService.getReportPath(tenantId, fileName);

    // Send PDF file
    res.download(filePath, fileName, (err) => {
      if (err) {
        logger.error('Error sending PDF:', err);
        next(err);
      }
    });
  } catch (error: any) {
    logger.error('PDF generation failed:', error);
    next(error);
  }
});

/**
 * POST /api/reports/pdf/detailed
 * Generate detailed vulnerability PDF report
 */
router.post('/pdf/detailed', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;

    // Validate request body
    const schema = z.object({
      assetIds: z.array(z.string()).optional(),
      severities: z.array(z.string()).optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
    });

    const validation = schema.safeParse(req.body);

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

    const options = {
      ...validation.data,
      dateFrom: validation.data.dateFrom ? new Date(validation.data.dateFrom) : undefined,
      dateTo: validation.data.dateTo ? new Date(validation.data.dateTo) : undefined,
    };

    logger.info(`Generating detailed PDF report for tenant ${tenantId}`);

    const fileName = await pdfReportService.generateDetailedReport(tenantId, userId, options);
    const filePath = pdfReportService.getReportPath(tenantId, fileName);

    // Send PDF file
    res.download(filePath, fileName, (err) => {
      if (err) {
        logger.error('Error sending PDF:', err);
        next(err);
      }
    });
  } catch (error: any) {
    logger.error('PDF generation failed:', error);
    next(error);
  }
});

export default router;
