/**
 * Reconnaissance Pipeline Routes
 */

import { Router } from 'express';
import { requireAuth, enforceTenantIsolation } from '../middleware/auth.middleware';
import { ReconService } from '../services/recon.service';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { prisma } from '../utils/prisma';

const router = Router();
const reconService = new ReconService();

router.use(requireAuth);
router.use(enforceTenantIsolation);

// Validation schemas
const initializeReconSchema = z.object({
  target: z.string().min(1, 'Target is required'),
  scanId: z.string().min(1, 'Scan ID is required'),
  assetId: z.string().min(1, 'Asset ID is required'),
  enablePassive: z.boolean().optional().default(true),
  enableActive: z.boolean().optional().default(true),
  enableContentDiscovery: z.boolean().optional().default(true),
  enableTechStack: z.boolean().optional().default(true),
});

/**
 * POST /api/recon/initialize
 * Initialize a new reconnaissance session
 */
router.post('/initialize', async (req, res, next) => {
  try {
    const validation = initializeReconSchema.safeParse(req.body);
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

    const { target, scanId, assetId, enablePassive, enableActive, enableContentDiscovery, enableTechStack } = validation.data;
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

    const sessionId = await reconService.initializeRecon({
      target,
      scanId,
      assetId,
      tenantId,
      enablePassive,
      enableActive,
      enableContentDiscovery,
      enableTechStack,
    });

    res.status(201).json({
      success: true,
      data: {
        sessionId,
        target,
        scanId,
        message: 'Reconnaissance session initialized',
      },
    });
  } catch (error: any) {
    logger.error('Failed to initialize recon:', error);
    next(error);
  }
});

// ============================================================================
// Specific Routes (must come BEFORE parameterized routes like /:sessionId)
// ============================================================================

/**
 * GET /api/recon/assets/status
 * Bulk fetch: latest session + phase progress for every asset belonging to the tenant
 */
router.get('/assets/status', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    // Get the latest session per asset using a raw DISTINCT ON query (PostgreSQL)
    const latestSessions: any[] = await prisma.$queryRaw`
      SELECT DISTINCT ON (rs."assetId")
        rs."id", rs."assetId", rs."status", rs."startedAt"
      FROM recon_sessions rs
      WHERE rs."tenantId" = ${tenantId}
      ORDER BY rs."assetId", rs."startedAt" DESC
    `;

    // For each latest session, count total sessions and completed phases
    const statusMap: Record<string, any> = {};
    await Promise.all(
      latestSessions.map(async (s) => {
        const [sessionCount, phaseRuns] = await Promise.all([
          prisma.recon_sessions.count({ where: { assetId: s.assetId, tenantId } }),
          prisma.recon_phase_runs.findMany({
            where: { sessionId: s.id },
            select: { phase: true, status: true },
          }),
        ]);
        const completedPhases = phaseRuns.filter((p: any) => p.status === 'DONE').length;
        const totalPhases = phaseRuns.length;
        const hasRunning = phaseRuns.some((p: any) => p.status === 'RUNNING');

        statusMap[s.assetId] = {
          latestSessionId: s.id,
          latestStatus: s.status,
          lastScannedAt: s.startedAt,
          sessionCount,
          completedPhases,
          totalPhases,
          hasRunning,
        };
      })
    );

    res.json({ success: true, data: statusMap });
  } catch (error: any) {
    logger.error('Failed to get asset session statuses:', error);
    next(error);
  }
});

/**
 * GET /api/recon/asset/:assetId
 * Get the most recent reconnaissance sessions for an asset (newest first)
 */
router.get('/asset/:assetId', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    const sessions = await prisma.recon_sessions.findMany({
      where: { assetId: req.params.assetId, tenantId },
      orderBy: { startedAt: 'desc' },
      take: 5,
      include: { assets: true },
    });

    res.json({
      success: true,
      data: { assetId: req.params.assetId, sessions, totalSessions: sessions.length },
    });
  } catch (error: any) {
    logger.error('Failed to get recon sessions for asset:', error);
    next(error);
  }
});

/**
 * GET /api/recon/scan/:scanId
 * Get all reconnaissance sessions for a scan
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

    const sessions = await reconService.getReconSessionsForScan(req.params.scanId, tenantId);

    res.json({
      success: true,
      data: {
        scanId: req.params.scanId,
        sessions,
        totalSessions: sessions.length,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get recon sessions for scan:', error);
    next(error);
  }
});

/**
 * GET /api/recon/artifacts
 * Get artifacts for a session
 */
router.get('/artifacts', async (req, res, next) => {
  try {
    const { sessionId, phase } = req.query;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMETERS', message: 'sessionId is required' },
      });
    }

    const where: any = { sessionId: sessionId as string, tenantId };
    if (phase) {
      where.phase = phase;
    }

    const artifacts = await prisma.recon_artifacts.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: artifacts,
    });
  } catch (error: any) {
    logger.error('Failed to get artifacts:', error);
    next(error);
  }
});

// ============================================================================
// Parameterized Routes (must come AFTER specific routes)
// ============================================================================

/**
 * GET /api/recon/:sessionId
 * Get reconnaissance session details
 */
router.get('/:sessionId', async (req, res, next) => {
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

    const session = await reconService.getReconSession(req.params.sessionId, tenantId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Reconnaissance session not found',
        },
      });
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    logger.error('Failed to get recon session:', error);
    next(error);
  }
});

/**
 * GET /api/recon/:sessionId/findings
 * Get reconnaissance findings (optionally filtered by stage)
 */
router.get('/:sessionId/findings', async (req, res, next) => {
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

    const stage = req.query.stage as string | undefined;
    const validStages = ['PASSIVE', 'ACTIVE', 'CONTENT_DISCOVERY', 'TECH_STACK'];

    if (stage && !validStages.includes(stage)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STAGE',
          message: `Invalid stage. Must be one of: ${validStages.join(', ')}`,
        },
      });
    }

    const findings = await reconService.getReconFindings(
      req.params.sessionId,
      tenantId,
      stage as any
    );

    res.json({
      success: true,
      data: {
        sessionId: req.params.sessionId,
        stage: stage || 'ALL',
        findings,
        totalCount: findings.length,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get recon findings:', error);
    next(error);
  }
});

// ============================================================================
// Interactive Recon API Routes
// ============================================================================

/**
 * POST /api/recon/run
 * Run a specific recon phase
 */
router.post('/run', async (req, res, next) => {
  try {
    const { sessionId, phase, parameters } = req.body;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    if (!sessionId || !phase) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMETERS', message: 'sessionId and phase are required' },
      });
    }

    // Get session to verify it exists and belongs to this tenant
    const session = await reconService.getReconSession(sessionId, tenantId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
    }

    // Get target from session's asset
    const rawTarget = session.assets?.url || session.assets?.hostname || session.assets?.ipAddress;
    if (!rawTarget) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_TARGET', message: 'Session has no valid target' },
      });
    }

    const hostTarget = normalizeHostTarget(rawTarget);
    const baseUrlTarget = normalizeBaseUrlTarget(rawTarget);

    // Start phase execution in background
    switch (phase) {
      case 'SUBDOMAINS':
        reconService.runSubdomainEnum(sessionId, hostTarget).catch(err =>
          logger.error(`Subdomain enum failed for session ${sessionId}:`, err)
        );
        break;

      case 'NMAP':
        reconService.runNmap(sessionId, hostTarget).catch(err =>
          logger.error(`Nmap failed for session ${sessionId}:`, err)
        );
        break;

      case 'FEROXBUSTER':
        // Ferox expects a URL, not a bare hostname.
        const baseUrl = parameters?.baseUrl || baseUrlTarget;
        reconService.runFeroxbuster(sessionId, baseUrl, parameters).catch(err =>
          logger.error(`Feroxbuster failed for session ${sessionId}:`, err)
        );
        break;

      case 'AI_ANALYSIS':
        reconService.runLocalAI(sessionId).catch(err =>
          logger.error(`AI analysis failed for session ${sessionId}:`, err)
        );
        break;

      case 'NUCLEI':
        if (!parameters?.targetUrls || !parameters?.tags) {
          return res.status(400).json({
            success: false,
            error: { code: 'MISSING_PARAMETERS', message: 'targetUrls and tags are required for Nuclei phase' },
          });
        }
        reconService.runNuclei(sessionId, parameters.targetUrls, parameters.tags).catch(err =>
          logger.error(`Nuclei failed for session ${sessionId}:`, err)
        );
        break;

      default:
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PHASE', message: 'Invalid phase specified' },
        });
    }

    res.json({
      success: true,
      data: { message: `Phase ${phase} started`, sessionId, phase },
    });
  } catch (error: any) {
    logger.error('Failed to run recon phase:', error);
    next(error);
  }
});

function normalizeHostTarget(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  try {
    if (trimmed.includes('://')) {
      return new URL(trimmed).hostname;
    }
  } catch {
    // fall through to best-effort parsing
  }

  // Strip path/query if a raw URL-like string was stored in hostname.
  const noPath = trimmed.split('/')[0];
  // Strip port if present.
  return noPath.split(':')[0];
}

function normalizeBaseUrlTarget(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  try {
    if (trimmed.includes('://')) return new URL(trimmed).origin;
  } catch {
    // fall through
  }

  // Assume https for bare hosts (most targets here are web assets).
  return `https://${normalizeHostTarget(trimmed)}`;
}

/**
 * POST /api/recon/cancel
 * Cancel a running recon phase
 */
router.post('/cancel', async (req, res, next) => {
  try {
    const { sessionId, phase } = req.body;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    if (!sessionId || !phase) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMETERS', message: 'sessionId and phase are required' },
      });
    }

    // Kill the process
    await reconService.killProcess(sessionId, phase);

    // Mark phase run as cancelled
    await prisma.recon_phase_runs.updateMany({
      where: { sessionId, phase, status: 'RUNNING' },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage: 'Cancelled by user',
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: { message: 'Phase cancelled', sessionId, phase },
    });
  } catch (error: any) {
    logger.error('Failed to cancel recon phase:', error);
    next(error);
  }
});

/**
 * POST /api/recon/selection
 * Save user selections (ports, services, endpoints, tags)
 */
router.post('/selection', async (req, res, next) => {
  try {
    const {
      sessionId,
      selectedPorts,
      selectedServiceUrls,
      selectedFeroxEndpoints,
      selectedNucleiTargets,
      selectedNucleiTags,
      scopeNotes,
    } = req.body;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMETERS', message: 'sessionId is required' },
      });
    }

    const selection = await prisma.recon_selections.upsert({
      where: { sessionId },
      create: {
        id: require('crypto').randomUUID(),
        sessionId,
        selectedPorts,
        selectedServiceUrls,
        selectedFeroxEndpoints,
        selectedNucleiTargets,
        selectedNucleiTags,
        scopeNotes,
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        selectedPorts,
        selectedServiceUrls,
        selectedFeroxEndpoints,
        selectedNucleiTargets,
        selectedNucleiTags,
        scopeNotes,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: selection,
    });
  } catch (error: any) {
    logger.error('Failed to save selection:', error);
    next(error);
  }
});

/**
 * GET /api/recon/:sessionId/ai-analysis
 * Get AI threat assessment for session
 */
router.get('/:sessionId/ai-analysis', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    const aiDecisions = await prisma.recon_ai_decisions.findMany({
      where: { sessionId, tenantId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    res.json({
      success: true,
      data: aiDecisions[0] || null,
    });
  } catch (error: any) {
    logger.error('Failed to get AI analysis:', error);
    next(error);
  }
});

/**
 * GET /api/recon/:sessionId/phase-runs
 * Get all phase runs for a session
 */
router.get('/:sessionId/phase-runs', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    const phaseRuns = await prisma.recon_phase_runs.findMany({
      where: { sessionId, tenantId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: phaseRuns,
    });
  } catch (error: any) {
    logger.error('Failed to get phase runs:', error);
    next(error);
  }
});

/**
 * GET /api/recon/:sessionId/selection
 * Get user selections for a session
 */
router.get('/:sessionId/selection', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    const selection = await prisma.recon_selections.findUnique({
      where: { sessionId },
    });

    res.json({
      success: true,
      data: selection,
    });
  } catch (error: any) {
    logger.error('Failed to get selection:', error);
    next(error);
  }
});

/**
 * GET /api/recon/:sessionId/screenshots
 * Get all screenshots for a session
 */
router.get('/:sessionId/screenshots', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    const screenshots = await prisma.recon_artifacts.findMany({
      where: {
        sessionId,
        tenantId,
        type: 'screenshot_png',
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: screenshots,
    });
  } catch (error: any) {
    logger.error('Failed to get screenshots:', error);
    next(error);
  }
});

/**
 * GET /api/recon/screenshot/:artifactId
 * Serve a specific screenshot image
 */
router.get('/screenshot/:artifactId', async (req, res, next) => {
  try {
    const { artifactId } = req.params;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    const artifact = await prisma.recon_artifacts.findFirst({
      where: {
        id: artifactId,
        tenantId,
        type: 'screenshot_png',
      },
    });

    if (!artifact) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Screenshot not found' },
      });
    }

    // Serve the image file
    res.sendFile(artifact.storagePath);
  } catch (error: any) {
    logger.error('Failed to serve screenshot:', error);
    next(error);
  }
});

/**
 * POST /api/recon/:sessionId/analyze-endpoints
 * Use Ollama LLM to triage feroxbuster endpoints for Nuclei target selection
 */
router.post('/:sessionId/analyze-endpoints', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant ID not found' },
      });
    }

    // Verify session belongs to tenant
    const session = await prisma.recon_sessions.findFirst({
      where: { id: sessionId, tenantId },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Recon session not found' },
      });
    }

    const analysis = await reconService.analyzeEndpointsWithAI(sessionId);

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error: any) {
    logger.error('Failed to analyze endpoints with AI:', error);
    next(error);
  }
});

export default router;
