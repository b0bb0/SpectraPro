/**
 * Source Code Scanner Routes
 * Crawl websites, extract JS, find secrets with Ollama LLM.
 */

import { Router } from 'express';
import { requireAuth, enforceTenantIsolation } from '../middleware/auth.middleware';
import { sourceScannerService } from '../services/source-scanner.service';
import { logger } from '../utils/logger';

const router = Router();
router.use(requireAuth);
router.use(enforceTenantIsolation);

/**
 * POST /api/source-scanner/scan
 * Start a new source code scan
 */
router.post('/scan', async (req, res, next) => {
  try {
    const { url, depth, maxPages, includeInline, customPrompt } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Target URL is required' },
      });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid URL format' },
      });
    }

    const scanId = sourceScannerService.startScan({
      url,
      depth: depth || 2,
      maxPages: maxPages || 30,
      includeInline: includeInline !== false,
      customPrompt: customPrompt || undefined,
    });

    logger.info(`Source scan started: ${scanId} for ${url}`);

    res.json({
      success: true,
      data: { scanId, status: 'running' },
    });
  } catch (error: any) {
    logger.error('Failed to start source scan:', error);
    next(error);
  }
});

/**
 * GET /api/source-scanner/scan/:scanId
 * Get scan status and results
 */
router.get('/scan/:scanId', async (req, res, next) => {
  try {
    const { scanId } = req.params;
    const scan = sourceScannerService.getScan(scanId);

    if (!scan) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Scan not found' },
      });
    }

    res.json({ success: true, data: scan });
  } catch (error: any) {
    logger.error('Failed to get scan:', error);
    next(error);
  }
});

/**
 * GET /api/source-scanner/scans
 * List all scans
 */
router.get('/scans', async (req, res, next) => {
  try {
    const scans = sourceScannerService.listScans();
    res.json({ success: true, data: scans });
  } catch (error: any) {
    logger.error('Failed to list scans:', error);
    next(error);
  }
});

export default router;
