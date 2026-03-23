/**
 * Scan Integration Service
 * Integrates orchestrator with existing scan workflow
 */

import { scanOrchestratorService } from './scan-orchestrator.service';
import { executiveDashboardService } from './executive-dashboard.service';
import { ScanProfile, ScanPhase } from '../types/scan-orchestration.types';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { consoleService } from './console.service';
import { AssetService } from './asset.service';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

interface EnhancedScanOptions {
  target: string;
  scanProfile: ScanProfile;
  tenantId: string;
  userId: string;
  assetId?: string;
}

class ScanIntegrationService {
  /**
   * Execute Enterprise Scan
   * Multi-phase orchestrated scanning
   */
  async executeEnterpriseScan(scanId: string, options: EnhancedScanOptions): Promise<void> {
    const { target, scanProfile, tenantId, assetId } = options;

    logger.info(`[ENTERPRISE-SCAN] ${scanId}: Starting ${scanProfile} scan for ${target}`);

    try {
      // Create console log
      const scan = await prisma.scans.findUnique({ where: { id: scanId } });
      consoleService.createLog(
        scanId,
        scan?.name || 'Enterprise Scan',
        `Enterprise ${scanProfile} scan`,
        tenantId
      );

      // Update scan to RUNNING
      await prisma.scans.update({
        where: { id: scanId },
        data: {
          status: 'RUNNING',
          scanProfile,
          orchestrationPhase: 'PREFLIGHT',
          currentPhase: 'Initializing scan',
          progress: 0,
          startedAt: new Date(),
        },
      });

      // Generate scan plan
      const asset = assetId ? await prisma.assets.findUnique({
        where: { id: assetId },
        select: { criticality: true },
      }) : null;

      const plan = await scanOrchestratorService.generateScanPlan(
        scanId,
        target,
        scanProfile,
        asset?.criticality
      );

      logger.info(`[ENTERPRISE-SCAN] ${scanId}: Plan generated with ${plan.phases.length} phases`);

      // Phase 0: Preflight
      await this.executePhase(scanId, target, ScanPhase.PREFLIGHT, 'Initializing scan');

      // Phase 1: Discovery
      consoleService.appendOutput(scanId, '\n[DISCOVERY PHASE] Starting technology fingerprinting...');
      await this.executePhase(scanId, target, ScanPhase.DISCOVERY, 'Analyzing attack surface');

      const discoveryConfig = plan.phases.find(p => p.phase === ScanPhase.DISCOVERY);
      if (!discoveryConfig) {
        throw new Error('Discovery phase not found in plan');
      }

      // Execute discovery and get asset context
      const assetContext = await scanOrchestratorService['executeDiscoveryPhase'](
        scanId,
        target,
        discoveryConfig
      );

      // Store asset context
      await prisma.scans.update({
        where: { id: scanId },
        data: {
          assetContext: assetContext as any,
        },
      });

      consoleService.appendOutput(
        scanId,
        `[DISCOVERY] Technologies detected: ${JSON.stringify(assetContext.technologies)}`
      );

      // Phase 1.5: Passive Signals (always required)
      consoleService.appendOutput(scanId, '\n[PASSIVE SIGNALS] Detecting exposures...');
      try {
        await this.executePhase(scanId, target, ScanPhase.PASSIVE_SIGNALS, 'Detecting exposures');

        const passiveConfig = plan.phases.find(p => p.phase === ScanPhase.PASSIVE_SIGNALS);
        if (passiveConfig) {
          const passiveFindings = await scanOrchestratorService['executePassiveSignalsPhase'](
            scanId,
            target,
            passiveConfig
          );
          consoleService.appendOutput(scanId, `[PASSIVE SIGNALS] Found ${passiveFindings} exposures`);
          if (passiveFindings > 0 && assetId) {
            await this.processPhaseResults(scanId, tenantId, assetId, 'passive');
          }
        }
      } catch (passiveErr: any) {
        logger.warn(`[ENTERPRISE-SCAN] ${scanId}: Passive phase failed, continuing: ${passiveErr.message}`);
        consoleService.appendOutput(scanId, `[PASSIVE SIGNALS] Skipped due to error: ${passiveErr.message}`);
      }

      // Phase 2: Targeted Scan (AI-driven)
      consoleService.appendOutput(scanId, '\n[TARGETED SCAN] Running AI-powered context-aware security checks...');
      try {
        await this.executePhase(scanId, target, ScanPhase.TARGETED_SCAN, 'Assessing vulnerabilities');

        const targetedConfig = plan.phases.find(p => p.phase === ScanPhase.TARGETED_SCAN);
        if (targetedConfig) {
          const findings = await scanOrchestratorService['executeTargetedPhase'](
            scanId,
            target,
            assetContext,
            targetedConfig
          );

          consoleService.appendOutput(scanId, `[TARGETED SCAN] Found ${findings} vulnerabilities`);
          if (findings > 0 && assetId) {
            await this.processPhaseResults(scanId, tenantId, assetId, 'targeted');
          }
        }
      } catch (targetedErr: any) {
        logger.warn(`[ENTERPRISE-SCAN] ${scanId}: Targeted phase failed, continuing: ${targetedErr.message}`);
        consoleService.appendOutput(scanId, `[TARGETED SCAN] Skipped due to error: ${targetedErr.message}`);
      }

      // Phase 2.5: Baseline Hygiene (BALANCED and DEEP profiles only)
      const baselineConfig = plan.phases.find(p => p.phase === ScanPhase.BASELINE_HYGIENE);
      if (baselineConfig) {
        try {
          consoleService.appendOutput(scanId, '\n[BASELINE HYGIENE] Running deterministic security checks...');
          await this.executePhase(scanId, target, ScanPhase.BASELINE_HYGIENE, 'Checking security hygiene');

          const baselineFindings = await scanOrchestratorService['executeBaselineHygienePhase'](
            scanId,
            target,
            baselineConfig
          );
          consoleService.appendOutput(scanId, `[BASELINE HYGIENE] Found ${baselineFindings} issues`);
          if (baselineFindings > 0 && assetId) {
            await this.processPhaseResults(scanId, tenantId, assetId, 'baseline');
          }
        } catch (baselineErr: any) {
          logger.warn(`[ENTERPRISE-SCAN] ${scanId}: Baseline phase failed, continuing: ${baselineErr.message}`);
          consoleService.appendOutput(scanId, `[BASELINE HYGIENE] Skipped due to error: ${baselineErr.message}`);
        }
      }

      // Phase 3: Deep Scan (DEEP profile only, requires explicit authorization)
      const deepConfig = plan.phases.find(p => p.phase === ScanPhase.DEEP_SCAN);

      // Get authorization from scan record
      const deepScanAuthorized = scan?.deepScanAuthorized || false;

      if (deepConfig && deepScanAuthorized) {
        consoleService.appendOutput(scanId, '\n[DEEP SCAN] Running aggressive security analysis...');
        await this.executePhase(scanId, target, ScanPhase.DEEP_SCAN, 'Deep security analysis');
        // Deep scan implementation would be called here when implemented
        consoleService.appendOutput(scanId, '[DEEP SCAN] Phase 3 execution not yet implemented');
      } else if (deepConfig && !deepScanAuthorized) {
        consoleService.appendOutput(scanId, '\n[DEEP SCAN] Skipped - explicit authorization required');
        logger.info(`[ENTERPRISE-SCAN] ${scanId}: Deep scan skipped (authorization required)`);
      }

      // Phase 4: Correlation (always required)
      consoleService.appendOutput(scanId, '\n[CORRELATION] Deduplicating and scoring findings...');
      await this.executePhase(scanId, target, ScanPhase.CORRELATION, 'Correlating findings');

      await scanOrchestratorService['executeCorrelationPhase'](scanId, tenantId);

      // Parse and store results
      await this.processResults(scanId, tenantId, assetId);

      // Update asset metadata (scan count, last scan time)
      if (assetId) {
        const assetService = new AssetService();
        await assetService.linkAssetToScan(assetId, scanId);
      }

      // Complete scan
      await prisma.scans.update({
        where: { id: scanId },
        data: {
          status: 'COMPLETED',
          orchestrationPhase: 'COMPLETED',
          currentPhase: 'Scan completed',
          progress: 100,
          completedAt: new Date(),
        },
      });

      consoleService.appendOutput(scanId, '\n[COMPLETED] Scan finished successfully');
      consoleService.completeLog(scanId, 'COMPLETED');

      // Update risk scores
      if (assetId) {
        await executiveDashboardService.calculateAssetRiskScore(assetId);
      }

      logger.info(`[ENTERPRISE-SCAN] ${scanId}: Completed successfully`);

    } catch (error: any) {
      logger.error(`[ENTERPRISE-SCAN] ${scanId}: Failed: ${error.message}`);

      await prisma.scans.update({
        where: { id: scanId },
        data: {
          status: 'FAILED',
          orchestrationPhase: 'FAILED',
          currentPhase: 'Scan failed',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });

      consoleService.appendOutput(scanId, `\n[ERROR] Scan failed: ${error.message}`);
      consoleService.completeLog(scanId, 'FAILED');

      throw error;
    }
  }

  /**
   * Execute Phase
   * Update scan state and progress
   */
  private async executePhase(
    scanId: string,
    target: string,
    phase: ScanPhase,
    displayName: string
  ): Promise<void> {
    await prisma.scans.update({
      where: { id: scanId },
      data: {
        orchestrationPhase: phase,
        currentPhase: displayName,
        progress: this.getPhaseProgress(phase),
      },
    });

    logger.info(`[ENTERPRISE-SCAN] ${scanId}: ${phase} phase started`);
  }

  /**
   * Get Phase Progress
   * Map phases to progress percentages
   */
  private getPhaseProgress(phase: ScanPhase): number {
    switch (phase) {
      case ScanPhase.PREFLIGHT: return 5;
      case ScanPhase.DISCOVERY: return 15;
      case ScanPhase.PASSIVE_SIGNALS: return 25;
      case ScanPhase.TARGETED_SCAN: return 50;
      case ScanPhase.BASELINE_HYGIENE: return 70;
      case ScanPhase.DEEP_SCAN: return 85;
      case ScanPhase.CORRELATION: return 95;
      case ScanPhase.PROCESSING: return 98;
      case ScanPhase.COMPLETED: return 100;
      default: return 0;
    }
  }

  /**
   * Upsert a single Nuclei finding into the database
   */
  private async upsertVulnerability(
    result: any,
    scanId: string,
    tenantId: string,
    assetId: string,
    userId: string
  ): Promise<void> {
    const severity = this.mapSeverity(result.info?.severity || 'info');
    const cvssScore = result.info?.classification?.['cvss-score'] || this.estimateCvssScore(severity);
    const cveIds = result.info?.classification?.['cve-id'] || [];
    const cveId = cveIds.length > 0 ? cveIds[0] : result.info?.name;

    const existing = await prisma.vulnerabilities.findFirst({
      where: {
        assetId,
        cveId: cveId || result.info?.name,
        status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
      },
    });

    if (existing) {
      await prisma.vulnerabilities.update({
        where: { id: existing.id },
        data: {
          lastSeen: new Date(),
          scanId,
          targetUrl: result.matched_at || result.host,
          rawResponse: result.response || null,
          curlCommand: result['curl-command'] || null,
        },
      });
    } else {
      await prisma.vulnerabilities.create({
        data: {
          id: randomUUID(),
          tenantId,
          assetId,
          scanId,
          title: result.info?.name || 'Unknown vulnerability',
          description: result.info?.description || `Detected by template: ${result['template-id']}`,
          severity,
          cvssScore,
          cveId: cveId || result.info?.name,
          status: 'OPEN',
          firstSeen: new Date(),
          lastSeen: new Date(),
          tags: result.info?.tags || [],
          detectionMethod: 'Nuclei',
          templateId: result['template-id'],
          matcher: result['matcher-name'] || '',
          targetUrl: result.matched_at || result.host,
          rawResponse: result.response || null,
          curlCommand: result['curl-command'] || null,
          createdById: userId,
          updatedAt: new Date(),
        },
      });
    }
  }

  /**
   * Update scan severity counts from the database
   */
  private async updateScanVulnCounts(scanId: string): Promise<void> {
    const vulns = await prisma.vulnerabilities.findMany({
      where: { scanId },
      select: { severity: true },
    });

    const counts = vulns.reduce((acc, v) => {
      acc[v.severity] = (acc[v.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    await prisma.scans.update({
      where: { id: scanId },
      data: {
        vulnFound: vulns.length,
        criticalCount: counts['CRITICAL'] || 0,
        highCount: counts['HIGH'] || 0,
        mediumCount: counts['MEDIUM'] || 0,
        lowCount: counts['LOW'] || 0,
        infoCount: counts['INFO'] || 0,
      },
    });
  }

  /**
   * Parse JSONL findings from a file
   */
  private parsePhaseFile(filePath: string, scanId: string): any[] {
    if (!fs.existsSync(filePath)) return [];

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      const results: any[] = [];

      for (const line of lines) {
        try {
          results.push(JSON.parse(line));
        } catch (parseError) {
          logger.warn(`[ENTERPRISE-SCAN] ${scanId}: Failed to parse line in ${path.basename(filePath)}`);
        }
      }

      logger.info(`[ENTERPRISE-SCAN] ${scanId}: Parsed ${results.length} findings from ${path.basename(filePath)}`);
      return results;
    } catch (fileError: any) {
      logger.warn(`[ENTERPRISE-SCAN] ${scanId}: Could not read ${path.basename(filePath)}: ${fileError.message}`);
      return [];
    }
  }

  /**
   * Process Results
   * Final aggregation pass — only counts findings from phases not yet saved,
   * then does a final severity count update from the database.
   */
  private async processResults(
    scanId: string,
    tenantId: string,
    assetId?: string
  ): Promise<void> {
    logger.info(`[ENTERPRISE-SCAN] ${scanId}: Final results aggregation`);
    consoleService.appendOutput(scanId, '[PROCESSING] Final aggregation of all scan phases...');

    const outputDir = path.join(process.cwd(), '..', '..', 'data', 'scans');

    // Only process phase files that were NOT incrementally saved (e.g. deep scan)
    const unprocessedPhases = ['deep'];
    let totalNewFindings = 0;

    if (assetId) {
      const userId = await this.getOrCreateSystemUser(tenantId);

      if (userId) {
        for (const phase of unprocessedPhases) {
          const results = this.parsePhaseFile(
            path.join(outputDir, `${scanId}-${phase}.jsonl`),
            scanId
          );
          for (const result of results) {
            try {
              await this.upsertVulnerability(result, scanId, tenantId, assetId, userId);
              totalNewFindings++;
            } catch (vulnError: any) {
              logger.error(`[ENTERPRISE-SCAN] ${scanId}: Failed to store vulnerability: ${vulnError.message}`);
            }
          }
        }
      }
    }

    // Final severity count update from DB (authoritative)
    await this.updateScanVulnCounts(scanId);

    const vulnCount = await prisma.vulnerabilities.count({ where: { scanId } });
    consoleService.appendOutput(scanId, `[PROCESSING] Final count: ${vulnCount} unique vulnerabilities`);
    logger.info(`[ENTERPRISE-SCAN] ${scanId}: Final aggregation complete — ${vulnCount} vulnerabilities`);
  }

  /**
   * Process results from a single phase file incrementally
   * Saves findings to DB so they appear on the scan page during execution
   */
  private async processPhaseResults(
    scanId: string,
    tenantId: string,
    assetId: string,
    phaseName: 'passive' | 'targeted' | 'baseline' | 'deep'
  ): Promise<void> {
    const outputDir = path.join(process.cwd(), '..', '..', 'data', 'scans');
    const results = this.parsePhaseFile(
      path.join(outputDir, `${scanId}-${phaseName}.jsonl`),
      scanId
    );

    if (results.length === 0) return;

    try {
      const userId = await this.getOrCreateSystemUser(tenantId);
      if (!userId) return;

      for (const result of results) {
        try {
          await this.upsertVulnerability(result, scanId, tenantId, assetId, userId);
        } catch (vulnError: any) {
          logger.error(`[ENTERPRISE-SCAN] ${scanId}: Failed to store vulnerability: ${vulnError.message}`);
        }
      }

      await this.updateScanVulnCounts(scanId);

      logger.info(`[ENTERPRISE-SCAN] ${scanId}: Incrementally saved ${results.length} findings from ${phaseName} phase`);
    } catch (error: any) {
      logger.warn(`[ENTERPRISE-SCAN] ${scanId}: Failed to incrementally process ${phaseName}: ${error.message}`);
    }
  }

  /**
   * Map Nuclei severity to our severity levels
   */
  private mapSeverity(nucleiSeverity: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' {
    const severity = nucleiSeverity.toLowerCase();
    switch (severity) {
      case 'critical': return 'CRITICAL';
      case 'high': return 'HIGH';
      case 'medium': return 'MEDIUM';
      case 'low': return 'LOW';
      case 'info':
      case 'informational':
      default: return 'INFO';
    }
  }

  /**
   * Estimate CVSS score from severity
   */
  private estimateCvssScore(severity: string): number {
    switch (severity.toUpperCase()) {
      case 'CRITICAL': return 9.5;
      case 'HIGH': return 7.5;
      case 'MEDIUM': return 5.0;
      case 'LOW': return 3.0;
      case 'INFO': return 0.0;
      default: return 0.0;
    }
  }

  /**
   * Get or create a system user for automated operations
   */
  private async getOrCreateSystemUser(tenantId: string): Promise<string | null> {
    // Try to find an admin user
    let user = await prisma.users.findFirst({
      where: { tenantId, role: 'ADMIN', isActive: true },
      select: { id: true },
    });

    if (user) {
      return user.id;
    }

    // Fall back to any active user
    user = await prisma.users.findFirst({
      where: { tenantId, isActive: true },
      select: { id: true },
    });

    return user?.id || null;
  }
}

export const scanIntegrationService = new ScanIntegrationService();
