/**
 * Attack Chain Orchestration Service
 * Auto-populates attack chains from recon → vulnerability → exploit → impact flow
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

export class AttackChainService {
  /**
   * Create attack chain when exploitation succeeds
   */
  async createAttackChain(
    scanId: string,
    reconSessionId: string | null,
    vulnerabilityIds: string[],
    exploitAttemptIds: string[],
    impactSummary: string,
    tenantId: string
  ): Promise<string> {
    const chainId = randomUUID();

    await prisma.attack_chains.create({
      data: {
        id: chainId,
        name: `Attack Chain for Scan ${scanId.substring(0, 8)}`,
        scanId,
        reconSessionId,
        vulnerabilityIds,
        exploitAttemptIds,
        impactSummary,
        tenantId,
        updatedAt: new Date(),
      },
    });

    logger.info(`Attack chain ${chainId} created for scan ${scanId}`);

    return chainId;
  }

  /**
   * Add step to existing attack chain
   */
  async addAttackChainStep(
    attackChainId: string,
    stepType: 'RECON' | 'VULN_DISCOVERY' | 'EXPLOITATION' | 'IMPACT_ASSESSMENT',
    stepData: any,
    tenantId: string
  ): Promise<void> {
    const stepId = randomUUID();

    // Get current step count for step number
    const existingSteps = await prisma.attack_chain_steps.count({
      where: { attackChainId },
    });

    await prisma.attack_chain_steps.create({
      data: {
        id: stepId,
        attackChainId,
        stepNumber: existingSteps + 1,
        stepType,
        stepDescription: `${stepType} step`,
        stepData,
        executedAt: new Date(),
      },
    });

    logger.info(`Attack chain step ${stepType} added to chain ${attackChainId}`);
  }

  /**
   * Get complete attack chain with all steps
   */
  async getAttackChain(attackChainId: string, tenantId: string) {
    return await prisma.attack_chains.findFirst({
      where: { id: attackChainId, tenantId },
      include: {
        attack_chain_steps: {
          orderBy: { stepNumber: 'asc' },
        },
        scans: {
          include: {
            assets: true,
          },
        },
      },
    });
  }

  /**
   * Get all attack chains for a scan
   */
  async getAttackChainsForScan(scanId: string, tenantId: string) {
    return await prisma.attack_chains.findMany({
      where: { scanId, tenantId },
      include: {
        attack_chain_steps: {
          orderBy: { executedAt: 'asc' },
        },
        _count: {
          select: { attack_chain_steps: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update asset timeline with event
   */
  async updateAssetTimeline(
    assetId: string,
    eventType: 'DISCOVERED' | 'VULNERABLE' | 'EXPLOITED' | 'RISK_CHANGED',
    eventData: any,
    tenantId: string
  ): Promise<void> {
    await prisma.asset_timeline.create({
      data: {
        id: randomUUID(),
        assetId,
        eventType,
        eventDescription: `${eventType} event`,
        eventData,
        tenantId,
      },
    });

    logger.info(`Asset timeline event ${eventType} added for asset ${assetId}`);
  }

  /**
   * Track change intelligence between scans
   */
  async trackChangeIntelligence(
    assetId: string,
    changeType: 'NEW_PARAMETERS' | 'NEW_EXPOSURE' | 'TECH_STACK_CHANGE' | 'RISK_DELTA',
    previousValue: any,
    newValue: any,
    riskDelta: number,
    tenantId: string
  ): Promise<void> {
    await prisma.change_intelligence.create({
      data: {
        id: randomUUID(),
        assetId,
        changeType,
        oldValue: JSON.stringify(previousValue),
        newValue: JSON.stringify(newValue),
        changeDescription: `${changeType} detected`,
        riskDelta,
        tenantId,
      },
    });

    logger.info(`Change intelligence ${changeType} tracked for asset ${assetId}, risk delta: ${riskDelta}`);
  }

  /**
   * Compare current scan with previous scan for change detection
   */
  async detectChanges(assetId: string, currentScanId: string, tenantId: string): Promise<void> {
    try {
      // Get current scan recon findings
      const currentFindings = await prisma.recon_findings.findMany({
        where: {
          tenantId,
          recon_sessions: {
            scans: {
              id: currentScanId,
            },
          },
        },
      });

      // Get previous scan for this asset
      const previousScan = await prisma.scans.findFirst({
        where: {
          tenantId,
          assetId,
          id: { not: currentScanId },
          status: 'COMPLETED',
        },
        orderBy: { completedAt: 'desc' },
      });

      if (!previousScan) {
        logger.info(`No previous scan found for asset ${assetId} - skipping change detection`);
        return;
      }

      // Get previous scan recon findings
      const previousFindings = await prisma.recon_findings.findMany({
        where: {
          tenantId,
          recon_sessions: {
            scanId: previousScan.id,
          },
        },
      });

      // Compare parameters
      const currentParams = currentFindings
        .filter((f: any) => f.findingType === 'PARAMETERS')
        .flatMap((f: any) => [...(f.data.getParams || []), ...(f.data.postParams || [])]);

      const previousParams = previousFindings
        .filter((f: any) => f.findingType === 'PARAMETERS')
        .flatMap((f: any) => [...(f.data.getParams || []), ...(f.data.postParams || [])]);

      const newParams = currentParams.filter((p: string) => !previousParams.includes(p));

      if (newParams.length > 0) {
        await this.trackChangeIntelligence(
          assetId,
          'NEW_PARAMETERS',
          { count: previousParams.length, params: previousParams },
          { count: currentParams.length, params: currentParams, newParams },
          newParams.length * 5, // Each new parameter adds 5 points risk
          tenantId
        );
      }

      // Compare endpoints
      const currentEndpoints = currentFindings
        .filter((f: any) => f.findingType === 'ENDPOINTS')
        .flatMap((f: any) => f.data.endpoints || []);

      const previousEndpoints = previousFindings
        .filter((f: any) => f.findingType === 'ENDPOINTS')
        .flatMap((f: any) => f.data.endpoints || []);

      const newEndpoints = currentEndpoints.filter(
        (e: any) => !previousEndpoints.some((pe: any) => pe.url === e.url)
      );

      if (newEndpoints.length > 0) {
        // Check for sensitive new exposures
        const sensitivePatterns = ['/admin', '/backup', '/config', '/.git', '/.env'];
        const sensitiveExposures = newEndpoints.filter((e: any) =>
          sensitivePatterns.some((pattern) => e.url?.toLowerCase().includes(pattern))
        );

        if (sensitiveExposures.length > 0) {
          await this.trackChangeIntelligence(
            assetId,
            'NEW_EXPOSURE',
            { count: previousEndpoints.length },
            { count: currentEndpoints.length, newExposures: sensitiveExposures },
            sensitiveExposures.length * 15, // Sensitive exposures add 15 points each
            tenantId
          );
        }
      }

      logger.info(`Change detection completed for asset ${assetId}`);
    } catch (error: any) {
      logger.error(`Change detection failed for asset ${assetId}:`, error.message);
    }
  }
}
