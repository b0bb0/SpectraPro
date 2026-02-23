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
        `Enterprise ${scanProfile} scan`
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
      await this.executePhase(scanId, target, ScanPhase.PASSIVE_SIGNALS, 'Detecting exposures');

      const passiveConfig = plan.phases.find(p => p.phase === ScanPhase.PASSIVE_SIGNALS);
      if (passiveConfig) {
        const passiveFindings = await scanOrchestratorService['executePassiveSignalsPhase'](
          scanId,
          target,
          passiveConfig
        );
        consoleService.appendOutput(scanId, `[PASSIVE SIGNALS] Found ${passiveFindings} exposures`);
      }

      // Phase 2: Targeted Scan (AI-driven)
      consoleService.appendOutput(scanId, '\n[TARGETED SCAN] Running AI-powered context-aware security checks...');
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
      }

      // Phase 2.5: Baseline Hygiene (BALANCED and DEEP profiles only)
      const baselineConfig = plan.phases.find(p => p.phase === ScanPhase.BASELINE_HYGIENE);
      if (baselineConfig) {
        consoleService.appendOutput(scanId, '\n[BASELINE HYGIENE] Running deterministic security checks...');
        await this.executePhase(scanId, target, ScanPhase.BASELINE_HYGIENE, 'Checking security hygiene');

        const baselineFindings = await scanOrchestratorService['executeBaselineHygienePhase'](
          scanId,
          target,
          baselineConfig
        );
        consoleService.appendOutput(scanId, `[BASELINE HYGIENE] Found ${baselineFindings} issues`);
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
   * Process Results
   * Parse scan outputs and store vulnerabilities from ALL phases
   * CRITICAL: Aggregates results from baseline, targeted, and other phase files
   */
  private async processResults(
    scanId: string,
    tenantId: string,
    assetId?: string
  ): Promise<void> {
    logger.info(`[ENTERPRISE-SCAN] ${scanId}: Processing and aggregating results from all phases`);
    consoleService.appendOutput(scanId, '[PROCESSING] Aggregating vulnerabilities from all scan phases...');

    const outputDir = path.join(process.cwd(), '..', '..', 'data', 'scans');

    // Find all JSONL output files for this scan
    const phaseFiles = [
      path.join(outputDir, `${scanId}-baseline.jsonl`),
      path.join(outputDir, `${scanId}-targeted.jsonl`),
      path.join(outputDir, `${scanId}-passive.jsonl`),
      path.join(outputDir, `${scanId}-deep.jsonl`),
    ];

    // Aggregate all vulnerabilities from all phases
    const allResults: any[] = [];
    let totalFindings = 0;

    for (const file of phaseFiles) {
      if (fs.existsSync(file)) {
        try {
          const content = fs.readFileSync(file, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const result = JSON.parse(line);
              allResults.push(result);
              totalFindings++;
            } catch (parseError) {
              logger.warn(`[ENTERPRISE-SCAN] ${scanId}: Failed to parse line in ${path.basename(file)}`);
            }
          }

          logger.info(`[ENTERPRISE-SCAN] ${scanId}: Parsed ${lines.length} findings from ${path.basename(file)}`);
        } catch (fileError: any) {
          logger.warn(`[ENTERPRISE-SCAN] ${scanId}: Could not read ${path.basename(file)}: ${fileError.message}`);
        }
      }
    }

    consoleService.appendOutput(scanId, `[PROCESSING] Found ${totalFindings} total findings across all phases`);
    logger.info(`[ENTERPRISE-SCAN] ${scanId}: Total findings aggregated: ${totalFindings}`);

    // Store vulnerabilities in database if assetId is available
    if (assetId && allResults.length > 0) {
      // Get or create system user for automated operations
      const userId = await this.getOrCreateSystemUser(tenantId);

      if (!userId) {
        logger.warn(`[ENTERPRISE-SCAN] ${scanId}: No user found for tenant ${tenantId}, cannot create vulnerabilities`);
        consoleService.appendOutput(scanId, '[WARNING] Cannot store vulnerabilities - no user found');
        return;
      }

      consoleService.appendOutput(scanId, `[PROCESSING] Storing ${allResults.length} vulnerabilities in database...`);

      // Store each vulnerability
      for (const result of allResults) {
        try {
          // Map Nuclei severity to our severity levels
          const severity = this.mapSeverity(result.info?.severity || 'info');

          // Calculate CVSS score
          const cvssScore = result.info?.classification?.['cvss-score'] || this.estimateCvssScore(severity);

          // Get CVE IDs
          const cveIds = result.info?.classification?.['cve-id'] || [];
          const cveId = cveIds.length > 0 ? cveIds[0] : result.info?.name;

          // Check if vulnerability already exists for this asset
          const existing = await prisma.vulnerabilities.findFirst({
            where: {
              assetId,
              cveId: cveId || result.info?.name,
              status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
            },
          });

          if (existing) {
            // Update existing vulnerability
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
            // Create new vulnerability
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
        } catch (vulnError: any) {
          logger.error(`[ENTERPRISE-SCAN] ${scanId}: Failed to store vulnerability: ${vulnError.message}`);
        }
      }

      // Get actual vulnerability counts from database after deduplication
      const actualVulnerabilities = await prisma.vulnerabilities.findMany({
        where: { scanId },
        select: { severity: true },
      });

      const severityCounts = {
        critical: actualVulnerabilities.filter(v => v.severity === 'CRITICAL').length,
        high: actualVulnerabilities.filter(v => v.severity === 'HIGH').length,
        medium: actualVulnerabilities.filter(v => v.severity === 'MEDIUM').length,
        low: actualVulnerabilities.filter(v => v.severity === 'LOW').length,
        info: actualVulnerabilities.filter(v => v.severity === 'INFO').length,
      };

      const actualTotal = actualVulnerabilities.length;

      // Update scan with actual counts from database
      await prisma.scans.update({
        where: { id: scanId },
        data: {
          vulnFound: actualTotal,
          criticalCount: severityCounts.critical,
          highCount: severityCounts.high,
          mediumCount: severityCounts.medium,
          lowCount: severityCounts.low,
          infoCount: severityCounts.info,
        },
      });

      consoleService.appendOutput(scanId, `[PROCESSING] Stored ${actualTotal} unique vulnerabilities: ${severityCounts.critical}C ${severityCounts.high}H ${severityCounts.medium}M ${severityCounts.low}L ${severityCounts.info}I`);
      logger.info(`[ENTERPRISE-SCAN] ${scanId}: Successfully stored ${actualTotal} unique vulnerabilities (${totalFindings} raw findings)`);
    } else {
      // Update scan with counts even if we can't store vulnerabilities
      await prisma.scans.update({
        where: { id: scanId },
        data: {
          vulnFound: totalFindings,
        },
      });
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
