/**
 * Exposure Orchestration Service
 * Coordinates the complete subdomain enumeration pipeline
 */

import { prisma } from '../utils/prisma';
import { ExposureScanStatus } from '@prisma/client';
import { logger } from '../utils/logger';
import { subdomainEnumerationService } from './subdomain-enumeration.service';
import { activeHostDetectionService } from './active-host-detection.service';
import { screenshotCaptureService } from './screenshot-capture.service';
import { AssetService } from './asset.service';

interface ExposureScanOptions {
  domain: string;
  tenantId: string;
  userId?: string;
}

class ExposureOrchestrationService {
  private assetService: AssetService;

  constructor() {
    this.assetService = new AssetService();
  }
  /**
   * Start a complete exposure scan
   */
  async startExposureScan(options: ExposureScanOptions): Promise<string> {
    const { domain, tenantId, userId } = options;

    // Validate domain
    const validation = subdomainEnumerationService.validateDomain(domain);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid domain');
    }

    const normalizedDomain = validation.normalized;

    logger.info(`[EXPOSURE] Starting scan for ${normalizedDomain}`);

    // Create exposure scan record
    const scan = await prisma.exposure_scans.create({
      data: {
        rootDomain: normalizedDomain,
        status: 'PENDING',
        progress: 0,
        currentPhase: 'Initializing',
        tenantId,
      },
    });

    // Execute scan pipeline asynchronously (non-blocking)
    this.executeScanPipeline(scan.id, normalizedDomain, tenantId, userId).catch((error) => {
      logger.error(`[EXPOSURE ${scan.id}] Pipeline failed:`, error);
      this.updateScanStatus(scan.id, 'FAILED', error.message);
    });

    return scan.id;
  }

  /**
   * Execute the complete scan pipeline
   */
  private async executeScanPipeline(
    scanId: string,
    domain: string,
    tenantId: string,
    userId?: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Phase 1: Subdomain Enumeration
      logger.info(`[EXPOSURE ${scanId}] Phase 1: Enumeration`);
      await this.updateScanStatus(scanId, 'ENUMERATING', null, 10, 'Enumerating subdomains');

      const enumeration = await subdomainEnumerationService.enumerateSubdomains(domain, scanId);

      if (enumeration.count === 0) {
        logger.warn(`[EXPOSURE ${scanId}] No subdomains found`);
        await this.updateScanStatus(scanId, 'COMPLETED', null, 100, 'Completed');
        await prisma.exposure_scans.update({
          where: { id: scanId },
          data: {
            completedAt: new Date(),
            duration: Math.round((Date.now() - startTime) / 1000),
          },
        });
        return;
      }

      logger.info(`[EXPOSURE ${scanId}] Found ${enumeration.count} subdomains`);

      // Update total count
      await prisma.exposure_scans.update({
        where: { id: scanId },
        data: {
          totalSubdomains: enumeration.count,
        },
      });

      // Store subdomains in database
      await prisma.subdomains.createMany({
        data: enumeration.subdomains.map((subdomain) => ({
          exposureScanId: scanId,
          subdomain,
          tenantId,
          isActive: false,
        })),
      });

      // Phase 2: Active Host Detection
      logger.info(`[EXPOSURE ${scanId}] Phase 2: Active Detection`);
      await this.updateScanStatus(scanId, 'DETECTING', null, 30, 'Checking active hosts');

      const activeResults = await activeHostDetectionService.checkSubdomainsBatch(
        enumeration.subdomains
      );

      // Update subdomain records with active status
      for (const result of activeResults) {
        await prisma.subdomains.updateMany({
          where: {
            exposureScanId: scanId,
            subdomain: result.subdomain,
          },
          data: {
            isActive: result.isActive,
            protocol: result.protocol,
            ipAddress: result.ipAddress,
            statusCode: result.statusCode,
            responseTime: result.responseTime,
          },
        });
      }

      const activeSubdomains = activeResults.filter((r) => r.isActive);
      const activeCount = activeSubdomains.length;

      logger.info(`[EXPOSURE ${scanId}] ${activeCount} active subdomains detected`);

      // Update active count
      await prisma.exposure_scans.update({
        where: { id: scanId },
        data: {
          activeSubdomains: activeCount,
        },
      });

      if (activeCount === 0) {
        logger.info(`[EXPOSURE ${scanId}] No active subdomains, completing scan`);
        await this.updateScanStatus(scanId, 'COMPLETED', null, 100, 'Completed');
        await prisma.exposure_scans.update({
          where: { id: scanId },
          data: {
            completedAt: new Date(),
            duration: Math.round((Date.now() - startTime) / 1000),
          },
        });
        return;
      }

      // Phase 3: Screenshot Capture
      logger.info(`[EXPOSURE ${scanId}] Phase 3: Screenshot Capture`);
      await this.updateScanStatus(scanId, 'CAPTURING', null, 60, 'Capturing screenshots');

      const screenshotTargets = activeSubdomains.map((result) => ({
        subdomain: result.subdomain,
        protocol: result.protocol || 'https',
      }));

      const screenshotResults = await screenshotCaptureService.captureScreenshotsBatch(
        screenshotTargets,
        scanId
      );

      // Update subdomain records with screenshots
      for (const result of screenshotResults) {
        if (result.success && result.screenshotUrl) {
          await prisma.subdomains.updateMany({
            where: {
              exposureScanId: scanId,
              subdomain: result.subdomain,
            },
            data: {
              screenshotUrl: result.screenshotUrl,
              screenshotCapturedAt: new Date(),
            },
          });
        }
      }

      const successCount = screenshotResults.filter((r) => r.success).length;
      logger.info(`[EXPOSURE ${scanId}] Captured ${successCount}/${activeCount} screenshots`);

      // Phase 4: Create Assets for Active Subdomains
      logger.info(`[EXPOSURE ${scanId}] Phase 4: Creating Assets`);
      await this.updateScanStatus(scanId, 'DETECTING', null, 80, 'Creating assets');

      // Find or create parent domain asset
      const parentAssetResult = await this.assetService.findOrCreateAsset(
        tenantId,
        userId || 'system', // Use userId if available, otherwise 'system' for automated tasks
        {
          name: domain,
          type: 'DOMAIN',
          identifier: domain,
          hostname: domain,
          environment: 'PRODUCTION',
          criticality: 'MEDIUM',
        },
        'exposure'
      );

      // Create assets for each active subdomain
      let createdAssets = 0;
      for (const activeSubdomain of activeSubdomains) {
        try {
          await this.assetService.findOrCreateAsset(
            tenantId,
            userId || 'system',
            {
              name: activeSubdomain.subdomain,
              type: 'DOMAIN',
              identifier: activeSubdomain.subdomain,
              hostname: activeSubdomain.subdomain,
              ipAddress: activeSubdomain.ipAddress || undefined,
              url: activeSubdomain.protocol ? `${activeSubdomain.protocol}://${activeSubdomain.subdomain}` : undefined,
              parentAssetId: parentAssetResult.asset.id,
              environment: 'PRODUCTION',
              criticality: 'MEDIUM',
            },
            'exposure'
          );
          createdAssets++;
        } catch (error: any) {
          logger.error(`[EXPOSURE ${scanId}] Failed to create asset for ${activeSubdomain.subdomain}:`, error);
        }
      }

      logger.info(`[EXPOSURE ${scanId}] Created/updated ${createdAssets} assets from ${activeCount} active subdomains`);

      // Phase 5: Finalization
      logger.info(`[EXPOSURE ${scanId}] Phase 5: Finalization`);
      await this.updateScanStatus(scanId, 'COMPLETED', null, 100, 'Completed');

      const duration = Math.round((Date.now() - startTime) / 1000);

      await prisma.exposure_scans.update({
        where: { id: scanId },
        data: {
          completedAt: new Date(),
          duration,
        },
      });

      logger.info(`[EXPOSURE ${scanId}] Scan completed in ${duration}s`);
    } catch (error: any) {
      logger.error(`[EXPOSURE ${scanId}] Pipeline error:`, error);
      await this.updateScanStatus(scanId, 'FAILED', error.message);

      const duration = Math.round((Date.now() - startTime) / 1000);
      await prisma.exposure_scans.update({
        where: { id: scanId },
        data: {
          completedAt: new Date(),
          duration,
        },
      });
    }
  }

  /**
   * Update scan status
   */
  private normalizeStatus(status: string): ExposureScanStatus {
    const normalized = status.toUpperCase();
    if (['PENDING', 'ENUMERATING', 'DETECTING', 'CAPTURING', 'COMPLETED', 'FAILED'].includes(normalized)) {
      return normalized as ExposureScanStatus;
    }
    // Map legacy/invalid states to closest valid state
    if (normalized === 'PROCESSING' || normalized === 'RUNNING') return ExposureScanStatus.DETECTING;
    return ExposureScanStatus.DETECTING;
  }

  private async updateScanStatus(
    scanId: string,
    status: string,
    errorMessage: string | null = null,
    progress: number = 0,
    currentPhase: string | null = null
  ): Promise<void> {
    const safeStatus = this.normalizeStatus(status);
    await prisma.exposure_scans.update({
      where: { id: scanId },
      data: {
        status: safeStatus,
        progress,
        currentPhase,
        errorMessage,
        ...(safeStatus === 'ENUMERATING' && { startedAt: new Date() }),
      },
    });
  }

  /**
   * Get scan by ID
   */
  async getScanById(scanId: string, tenantId: string): Promise<any> {
    const scan = await prisma.exposure_scans.findFirst({
      where: {
        id: scanId,
        tenantId,
      },
      include: {
        subdomains: {
          orderBy: [
            { isActive: 'desc' },
            { subdomain: 'asc' },
          ],
        },
      },
    });

    if (!scan) {
      throw new Error('Scan not found');
    }

    return scan;
  }

  /**
   * List scans for tenant
   */
  async listScans(tenantId: string, limit: number = 50): Promise<any[]> {
    return prisma.exposure_scans.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        _count: {
          select: {
            subdomains: true,
          },
        },
      },
    });
  }

  /**
   * Kill an in-flight exposure scan and terminate known subprocesses
   */
  async killScan(scanId: string, tenantId: string, userId: string): Promise<{ status: string; killedProcesses: number }> {
    const scan = await prisma.exposure_scans.findFirst({
      where: { id: scanId, tenantId },
      select: { id: true, status: true },
    });

    if (!scan) {
      throw new Error('Scan not found');
    }

    if (scan.status === 'COMPLETED' || scan.status === 'FAILED') {
      return { status: scan.status, killedProcesses: 0 };
    }

    let killedProcesses = 0;
    if (subdomainEnumerationService.killProcess(scanId)) {
      killedProcesses += 1;
    }

    await prisma.exposure_scans.update({
      where: { id: scanId },
      data: {
        status: 'FAILED',
        progress: 100,
        currentPhase: 'Terminated by user',
        errorMessage: 'Exposure scan terminated by user',
        completedAt: new Date(),
      },
    });

    return { status: 'FAILED', killedProcesses };
  }

  /**
   * Delete scan and associated data
   */
  async deleteScan(scanId: string, tenantId: string): Promise<void> {
    const scan = await prisma.exposure_scans.findFirst({
      where: {
        id: scanId,
        tenantId,
      },
      include: {
        subdomains: {
          where: {
            screenshotUrl: {
              not: null,
            },
          },
          select: {
            screenshotUrl: true,
          },
        },
      },
    });

    if (!scan) {
      throw new Error('Scan not found');
    }

    // Delete screenshots
    for (const subdomain of scan.subdomains) {
      if (subdomain.screenshotUrl) {
        await screenshotCaptureService.deleteScreenshot(subdomain.screenshotUrl);
      }
    }

    // Delete scan (cascade will delete subdomains)
    await prisma.exposure_scans.delete({
      where: { id: scanId },
    });

    logger.info(`[EXPOSURE] Deleted scan ${scanId}`);
  }

  /**
   * Check rate limit
   */
  async checkRateLimit(tenantId: string): Promise<boolean> {
    const maxScansPerHour = parseInt(process.env.EXPOSURE_MAX_SCANS_PER_HOUR || '5');
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentScans = await prisma.exposure_scans.count({
      where: {
        tenantId,
        createdAt: {
          gte: oneHourAgo,
        },
      },
    });

    return recentScans < maxScansPerHour;
  }

  /**
   * Sync existing exposure scan results to assets
   * Converts subdomains from completed scans into asset hierarchy
   */
  async syncExposureScansToAssets(tenantId: string, userId: string, scanId?: string) {
    const results = {
      scansProcessed: 0,
      assetsCreated: 0,
      assetsUpdated: 0,
      errors: [] as string[],
    };

    try {
      // Find completed scans to sync
      const scansToSync = await prisma.exposure_scans.findMany({
        where: {
          tenantId,
          status: 'COMPLETED',
          ...(scanId && { id: scanId }),
        },
        include: {
          subdomains: {
            where: {
              isActive: true,
            },
          },
        },
      });

      logger.info(`[EXPOSURE SYNC] Found ${scansToSync.length} scans to sync for tenant ${tenantId}`);

      for (const scan of scansToSync) {
        try {
          results.scansProcessed++;

          // Create or find parent domain asset
          const parentAssetResult = await this.assetService.findOrCreateAsset(
            tenantId,
            userId,
            {
              name: scan.rootDomain,
              type: 'DOMAIN',
              identifier: scan.rootDomain,
              hostname: scan.rootDomain,
              environment: 'PRODUCTION',
              criticality: 'MEDIUM',
            },
            'exposure'
          );

          if (parentAssetResult.isNew) {
            results.assetsCreated++;
          } else {
            results.assetsUpdated++;
          }

          // Create assets for each active subdomain
          for (const subdomain of scan.subdomains) {
            try {
              const subdomainAssetResult = await this.assetService.findOrCreateAsset(
                tenantId,
                userId,
                {
                  name: subdomain.subdomain,
                  type: 'DOMAIN',
                  identifier: subdomain.subdomain,
                  hostname: subdomain.subdomain,
                  ipAddress: subdomain.ipAddress || undefined,
                  url: subdomain.protocol ? `${subdomain.protocol}://${subdomain.subdomain}` : undefined,
                  parentAssetId: parentAssetResult.asset.id,
                  environment: 'PRODUCTION',
                  criticality: 'MEDIUM',
                },
                'exposure'
              );

              if (subdomainAssetResult.isNew) {
                results.assetsCreated++;
              } else {
                results.assetsUpdated++;
              }
            } catch (error: any) {
              logger.error(`[EXPOSURE SYNC] Failed to create asset for subdomain ${subdomain.subdomain}:`, error);
              results.errors.push(`Failed to sync subdomain ${subdomain.subdomain}: ${error.message}`);
            }
          }

          logger.info(`[EXPOSURE SYNC] Synced scan ${scan.id} with ${scan.subdomains.length} active subdomains`);
        } catch (error: any) {
          logger.error(`[EXPOSURE SYNC] Failed to sync scan ${scan.id}:`, error);
          results.errors.push(`Failed to sync scan ${scan.id}: ${error.message}`);
        }
      }

      logger.info(`[EXPOSURE SYNC] Completed: ${results.assetsCreated} created, ${results.assetsUpdated} updated`);
      return results;
    } catch (error: any) {
      logger.error('[EXPOSURE SYNC] Sync failed:', error);
      throw error;
    }
  }
}

export const exposureOrchestrationService = new ExposureOrchestrationService();
