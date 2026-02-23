/**
 * Scan Service
 * Handles vulnerability scanning operations using Nuclei
 */

import { ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { Severity, ScanProfile } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { consoleService } from './console.service';
import { scanIntegrationService } from './scan-integration.service';
import { AIAnalysisService } from './ai-analysis.service';
import { AssetService } from './asset.service';
import { websocketService } from './websocket.service';
import { scanOrchestratorService } from './scan-orchestrator.service';

interface ScanOptions {
  target: string;
  scanLevel: 'light' | 'normal' | 'extreme';
  scanProfile?: ScanProfile; // NEW: Enterprise orchestration profile
  tenantId: string;
  userId: string;
  assetId?: string;
  useOrchestration?: boolean; // NEW: Flag to use enterprise orchestration
  deepScanAuthorized?: boolean; // Authorization for aggressive deep scan
  authConfig?: any; // Authentication configuration for authenticated scanning
}

interface NucleiResult {
  template: string;
  'template-id': string;
  'template-path': string;
  info: {
    name: string;
    author: string[];
    tags: string[];
    description: string;
    severity: string;
    reference?: string[];
    classification?: {
      'cvss-metrics'?: string;
      'cvss-score'?: number;
      'cve-id'?: string[];
      'cwe-id'?: string[];
    };
  };
  type: string;
  host: string;
  matched_at: string;
  extracted_results?: string[];
  ip?: string;
  timestamp: string;
  'curl-command'?: string;
  'matcher-name'?: string;
  metadata?: Record<string, any>;
  request?: string; // HTTP request
  response?: string; // HTTP response (raw)
}

export class ScanService {
  private outputDir: string;
  private activeLegacyProcesses = new Map<string, ChildProcess>();

  constructor() {
    this.outputDir = path.join(process.cwd(), '..', '..', 'data', 'scans');
    this.ensureOutputDir();
  }

  private ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Check if Nuclei is installed
   */
  async checkNucleiInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn('which', ['nuclei']);
      process.on('close', (code) => {
        resolve(code === 0);
      });
    });
  }

  /**
   * Start a vulnerability scan
   */
  async startScan(options: ScanOptions): Promise<any> {
    const { target, scanLevel, scanProfile, tenantId, userId, useOrchestration = true, deepScanAuthorized = false, authConfig } = options;

    logger.info(`Starting ${scanLevel} scan on target: ${target} (orchestration: ${useOrchestration}, deepScanAuth: ${deepScanAuthorized})`);

    // Check if Nuclei is installed
    const nucleiInstalled = await this.checkNucleiInstalled();
    if (!nucleiInstalled) {
      throw new Error('Nuclei is not installed. Please install Nuclei to perform scans.');
    }

    // Find or create asset
    const asset = await this.findOrCreateAsset(target, tenantId, userId);

    // Map scanLevel to scanProfile if not provided
    const profile = scanProfile || this.mapScanLevelToProfile(scanLevel);

    // Create scan record
    const config = this.getScanConfig(scanLevel);
    const scan = await prisma.scans.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: `${profile} Scan - ${target}`,
        type: 'NUCLEI',
        status: 'PENDING',
        scanProfile: profile as any,
        assetId: asset.id,
        targetCount: 1,
        severity: config.severity,
        deepScanAuthorized,
        authConfig: authConfig || null, // Store authentication configuration
        updatedAt: new Date(),
      },
    });

    // Use enterprise orchestration if enabled
    if (useOrchestration) {
      logger.info(`[SCAN ${scan.id}] Using enterprise orchestration with ${profile} profile`);

      // Start orchestrated scan in background
      scanIntegrationService.executeEnterpriseScan(scan.id, {
        target,
        scanProfile: profile as any,
        tenantId,
        userId,
        assetId: asset.id,
      }).catch((error) => {
        logger.error(`[SCAN ${scan.id}] Enterprise scan failed:`, error);
      });
    } else {
      // Fallback to legacy scan
      logger.info(`[SCAN ${scan.id}] Using legacy scan execution`);

      await prisma.scans.update({
        where: { id: scan.id },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      this.executeScan(scan.id, target, scanLevel, tenantId, asset.id)
      .catch((error) => {
        logger.error(`Scan ${scan.id} failed:`, error);
        this.updateScanStatus(scan.id, 'FAILED', error.message);
      });
    }

    return {
      scanId: scan.id,
      status: useOrchestration ? 'PENDING' : 'RUNNING',
      message: 'Scan started successfully',
    };
  }

  /**
   * Map legacy scan level to enterprise scan profile
   */
  private mapScanLevelToProfile(scanLevel: string): ScanProfile {
    switch (scanLevel) {
      case 'light':
        return 'FAST';
      case 'normal':
        return 'BALANCED';
      case 'extreme':
        return 'DEEP';
      default:
        return 'BALANCED';
    }
  }

  /**
   * Get scan configuration based on level
   */
  private getScanConfig(scanLevel: string): Record<string, any> {
    switch (scanLevel) {
      case 'light':
        return {
          severity: ['high', 'critical'],
          rateLimit: 300,
          timeout: 5,
          description: 'Quick scan with high/critical vulnerabilities only',
        };
      case 'normal':
        return {
          severity: ['info', 'low', 'medium', 'high', 'critical'],
          rateLimit: 300,
          timeout: 5,
          description: 'Standard scan with comprehensive checks',
        };
      case 'extreme':
        return {
          severity: ['info', 'low', 'medium', 'high', 'critical'],
          rateLimit: 300,
          timeout: 5,
          description: 'Full aggressive scan with all templates',
        };
      default:
        return {
          severity: ['medium', 'high', 'critical'],
          rateLimit: 150,
          timeout: 10,
          description: 'Standard scan',
        };
    }
  }

  /**
   * Execute Nuclei scan
   */
  private async executeScan(
    scanId: string,
    target: string,
    scanLevel: string,
    tenantId: string,
    assetId: string
  ): Promise<void> {
    const config = this.getScanConfig(scanLevel);
    const outputFile = path.join(this.outputDir, `${scanId}.jsonl`);

    // Get templates path from environment
    const templatesPath = process.env.NUCLEI_TEMPLATES_PATH || '';

    // Build Nuclei command with optimized flags
    const args = [
      '-u', target,
      '-severity', config.severity.join(','),
      '-jsonl',
      '-irr', // Include request/response in output
      '-no-interactsh', // Disable interactsh for faster scanning
      '-rate-limit', config.rateLimit.toString(),
      '-c', '100', // Concurrency
      '-bulk-size', '50', // Bulk size
      '-timeout', config.timeout.toString(),
      '-retries', '1',
      '-stats',
      '-stats-interval', '2', // Stats update every 2 seconds
      '-o', outputFile,
    ];

    // Add template path if configured
    if (templatesPath) {
      args.push('-t', path.join(templatesPath, 'http/'));
    } else {
      args.push('-t', 'http/');
    }

    // For extreme scans, add more aggressive options
    if (scanLevel === 'extreme') {
      args.push('-headless'); // Enable headless checks
    }

    logger.info(`[SCAN ${scanId}] Executing nuclei with args: ${args.join(' ')}`);

    // Create console log for admin monitoring
    const scan = await prisma.scans.findUnique({ where: { id: scanId } });
    const command = `nuclei ${args.join(' ')}`;
    consoleService.createLog(scanId, scan?.name || 'Unknown Scan', command);
    consoleService.appendOutput(scanId, `$ ${command}`);
    consoleService.appendOutput(scanId, `[${new Date().toISOString()}] Starting scan...`);

    // Update scan status to RUNNING with initial progress
    await prisma.scans.update({
      where: { id: scanId },
      data: {
        status: 'RUNNING',
        currentPhase: 'Initializing',
        progress: 0,
      },
    });

    logger.info(`[SCAN ${scanId}] Status updated to RUNNING with progress 0%`);

    // Broadcast scan started via WebSocket
    websocketService.broadcastScanStarted(tenantId, scanId, target);
    websocketService.broadcastScanProgress(tenantId, scanId, 'RUNNING', 0, 'Initializing');

    return new Promise((resolve, reject) => {
      // Spawn with unbuffered output
      const nucleiProcess = spawn('nuclei', args, {
        detached: process.platform !== 'win32',
        env: { ...process.env, PYTHONUNBUFFERED: '1', TERM: 'dumb' },
      });
      this.activeLegacyProcesses.set(scanId, nucleiProcess);
      let errorOutput = '';

      nucleiProcess.stdout.on('data', async (data) => {
        // Send output to console - capture all lines including progress updates
        const output = data.toString();

        // Split only on newlines, keep carriage returns for progress tracking
        // Don't filter aggressively - we want to see all stats output
        const lines = output.split('\n');

        for (const line of lines) {
          if (!line) continue; // Skip completely empty strings

          // Strip ANSI escape codes but keep the line content
          const cleanLine = line.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').trim();

          // Capture all non-empty output including JSON stats and progress
          if (cleanLine) {
            consoleService.appendOutput(scanId, cleanLine);

            // Try to parse as JSON to extract percent field
            try {
              const jsonData = JSON.parse(cleanLine);
              if (jsonData.percent !== undefined) {
                const percent = parseInt(jsonData.percent, 10);
                const matched = parseInt(jsonData.matched, 10) || 0;
                const templates = parseInt(jsonData.templates, 10) || 0;
                const rps = parseInt(jsonData.rps, 10) || 0;

                // Update scan progress immediately
                await prisma.scans.update({
                  where: { id: scanId },
                  data: {
                    progress: Math.min(percent, 99), // Cap at 99% until completion
                    currentPhase: `Scanning - ${matched} vulnerabilities found`,
                    templatesRun: templates,
                  },
                }).catch((err) => {
                  logger.error(`[SCAN ${scanId}] Failed to update progress: ${err.message}`);
                });

                logger.info(`[SCAN ${scanId}] Progress: ${percent}% - ${matched} matches - ${rps} req/s`);

                // Broadcast progress via WebSocket
                websocketService.broadcastScanProgress(
                  tenantId,
                  scanId,
                  'RUNNING',
                  Math.min(percent, 99),
                  `Scanning - ${matched} vulnerabilities found`,
                  matched
                );
              }
            } catch (e) {
              // Not JSON, skip
            }
          }
        }
      });

      nucleiProcess.stderr.on('data', async (data) => {
        const output = data.toString();
        errorOutput += output;

        // Send stderr output to console - capture all lines including stats
        // Split only on newlines to preserve progress updates
        const lines = output.split('\n');

        for (const line of lines) {
          if (!line) continue; // Skip completely empty strings

          // Strip ANSI escape codes but keep the line content
          const cleanLine = line.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').trim();

          // Capture all non-empty output including JSON stats and progress
          if (cleanLine) {
            consoleService.appendOutput(scanId, cleanLine);

            // Try to parse as JSON to extract percent field
            try {
              const jsonData = JSON.parse(cleanLine);
              if (jsonData.percent !== undefined) {
                const percent = parseInt(jsonData.percent, 10);
                const matched = parseInt(jsonData.matched, 10) || 0;
                const templates = parseInt(jsonData.templates, 10) || 0;
                const rps = parseInt(jsonData.rps, 10) || 0;

                // Update scan progress immediately
                await prisma.scans.update({
                  where: { id: scanId },
                  data: {
                    progress: Math.min(percent, 99), // Cap at 99% until completion
                    currentPhase: `Scanning - ${matched} vulnerabilities found`,
                    templatesRun: templates,
                  },
                }).catch((err) => {
                  logger.error(`[SCAN ${scanId}] Failed to update progress: ${err.message}`);
                });

                logger.info(`[SCAN ${scanId}] Progress: ${percent}% - ${matched} matches - ${rps} req/s`);

                // Broadcast progress via WebSocket
                websocketService.broadcastScanProgress(
                  tenantId,
                  scanId,
                  'RUNNING',
                  Math.min(percent, 99),
                  `Scanning - ${matched} vulnerabilities found`,
                  matched
                );
              }
            } catch (e) {
              // Not JSON, skip
            }
          }
        }
      });

      nucleiProcess.on('close', async (code) => {
        this.activeLegacyProcesses.delete(scanId);
        logger.info(`[SCAN ${scanId}] Nuclei process exited with code ${code}`);

        try {
          // Update status to processing
          logger.info(`[SCAN ${scanId}] Updating to Processing Results (95%)`);
          await prisma.scans.update({
            where: { id: scanId },
            data: {
              currentPhase: 'Processing Results',
              progress: 95,
            },
          });

          // Broadcast processing status via WebSocket
          websocketService.broadcastScanProgress(tenantId, scanId, 'RUNNING', 95, 'Processing Results');

          // Parse results
          const results = await this.parseResults(outputFile);
          logger.info(`Parsed ${results.length} vulnerabilities`);

          // Store vulnerabilities in database
          await this.storeVulnerabilities(results, scanId, tenantId, assetId);

          // Count vulnerabilities by severity
          const vulnCounts = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
          };

          for (const result of results) {
            const sev = result.info.severity.toLowerCase();
            if (sev === 'critical') vulnCounts.critical++;
            else if (sev === 'high') vulnCounts.high++;
            else if (sev === 'medium') vulnCounts.medium++;
            else if (sev === 'low') vulnCounts.low++;
            else if (sev === 'info') vulnCounts.info++;
          }

          // Update scan status
          logger.info(`[SCAN ${scanId}] Completing scan - found ${results.length} vulnerabilities`);
          await prisma.scans.update({
            where: { id: scanId },
            data: {
              status: 'COMPLETED',
              currentPhase: 'Completed',
              progress: 100,
              completedAt: new Date(),
              vulnFound: results.length,
              criticalCount: vulnCounts.critical,
              highCount: vulnCounts.high,
              mediumCount: vulnCounts.medium,
              lowCount: vulnCounts.low,
              infoCount: vulnCounts.info,
              rawOutput: `Scan output saved to: ${outputFile}`,
            },
          });
          logger.info(`[SCAN ${scanId}] Scan marked as COMPLETED successfully`);

          // Calculate scan duration
          const scan = await prisma.scans.findUnique({ where: { id: scanId } });
          const duration = scan?.startedAt
            ? Math.round((Date.now() - new Date(scan.startedAt).getTime()) / 1000)
            : 0;

          // Broadcast completion via WebSocket
          websocketService.broadcastScanCompleted(tenantId, scanId, 'COMPLETED', results.length, duration);
          websocketService.broadcastScanProgress(tenantId, scanId, 'COMPLETED', 100, 'Completed', results.length);

          // Update console log
          consoleService.appendOutput(scanId, '');
          consoleService.appendOutput(scanId, `[${new Date().toISOString()}] ✓ Scan completed successfully`);
          consoleService.appendOutput(scanId, `Found ${results.length} vulnerabilities (Critical: ${vulnCounts.critical}, High: ${vulnCounts.high}, Medium: ${vulnCounts.medium}, Low: ${vulnCounts.low}, Info: ${vulnCounts.info})`);
          consoleService.completeLog(scanId, 'COMPLETED');

          // Update asset last scanned
          await prisma.assets.update({
            where: { id: assetId },
            data: { lastScanAt: new Date() },
          });

          // Trigger AI analysis for vulnerabilities (non-blocking)
          this.triggerAIAnalysis(scanId, tenantId).catch((error: any) => {
            logger.error(`[SCAN ${scanId}] AI analysis failed:`, error.message);
          });

          resolve();
        } catch (error: any) {
          logger.error(`Failed to process scan results: ${error.message}`);
          consoleService.appendOutput(scanId, '');
          consoleService.appendOutput(scanId, `[${new Date().toISOString()}] ✗ Scan failed: ${error.message}`);
          consoleService.completeLog(scanId, 'FAILED');
          await this.updateScanStatus(scanId, 'FAILED', error.message);
          reject(error);
        }
      });

      nucleiProcess.on('error', async (error) => {
        this.activeLegacyProcesses.delete(scanId);
        logger.error(`Nuclei process error: ${error.message}`);
        consoleService.appendOutput(scanId, '');
        consoleService.appendOutput(scanId, `[${new Date().toISOString()}] ✗ Process error: ${error.message}`);
        consoleService.completeLog(scanId, 'FAILED');
        await this.updateScanStatus(scanId, 'FAILED', error.message);
        reject(error);
      });
    });
  }

  /**
   * Stop a running scan and terminate all tracked subprocesses
   */
  async stopScan(scanId: string, tenantId: string, userId: string): Promise<{ killedProcesses: number; status: string }> {
    const scan = await prisma.scans.findFirst({
      where: { id: scanId, tenantId },
      select: { id: true, status: true },
    });

    if (!scan) {
      throw new Error('Scan not found');
    }

    if (scan.status !== 'RUNNING' && scan.status !== 'PENDING') {
      return {
        killedProcesses: 0,
        status: scan.status,
      };
    }

    let killedProcesses = 0;

    const legacyProcess = this.activeLegacyProcesses.get(scanId);
    if (legacyProcess) {
      this.killProcessTree(legacyProcess, 'SIGTERM');
      this.activeLegacyProcesses.delete(scanId);
      killedProcesses += 1;
    }

    killedProcesses += scanOrchestratorService.killScanProcesses(scanId);

    await prisma.scans.update({
      where: { id: scanId },
      data: {
        status: 'FAILED',
        currentPhase: 'Scan terminated by user',
        errorMessage: 'Scan terminated by user request',
        completedAt: new Date(),
        killRequested: true,
        killRequestedAt: new Date(),
        killRequestedById: userId,
        progress: 100,
      },
    });

    websocketService.broadcastScanProgress(tenantId, scanId, 'FAILED', 100, 'Terminated by user', 0);
    websocketService.broadcastScanCompleted(tenantId, scanId, 'FAILED', 0, 0);
    consoleService.appendOutput(scanId, `[${new Date().toISOString()}] Scan terminated by user`);
    consoleService.completeLog(scanId, 'FAILED');

    return {
      killedProcesses,
      status: 'FAILED',
    };
  }

  private killProcessTree(proc: ChildProcess, signal: NodeJS.Signals): void {
    if (!proc?.pid) return;
    try {
      if (process.platform !== 'win32') {
        process.kill(-proc.pid, signal);
      }
    } catch {
      // Fall back to direct kill below
    }
    try {
      proc.kill(signal);
    } catch {
      // ignore kill errors
    }
  }

  /**
   * Parse Nuclei JSONL results
   */
  private async parseResults(outputFile: string): Promise<NucleiResult[]> {
    const results: NucleiResult[] = [];

    if (!fs.existsSync(outputFile)) {
      logger.warn(`Output file not found: ${outputFile}`);
      return results;
    }

    const content = fs.readFileSync(outputFile, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      try {
        const result = JSON.parse(line) as NucleiResult;
        results.push(result);
      } catch (error) {
        logger.warn(`Failed to parse line: ${line.substring(0, 100)}`);
      }
    }

    return results;
  }

  /**
   * Store vulnerabilities in database
   */
  private async storeVulnerabilities(
    results: NucleiResult[],
    scanId: string,
    tenantId: string,
    assetId: string
  ): Promise<void> {
    // Get a user for creating vulnerabilities - prefer ADMIN, fall back to any active user
    let userId = await this.getOrCreateSystemUser(tenantId);
    
    if (!userId) {
      logger.warn(`No user found for tenant ${tenantId}, cannot create vulnerabilities`);
      return;
    }

    for (const result of results) {
      try {
        // Map Nuclei severity to our severity levels
        const severity = this.mapSeverity(result.info.severity);

        // Calculate CVSS score
        const cvssScore = result.info.classification?.['cvss-score'] || this.estimateCvssScore(severity);

        // Get CVE IDs
        const cveIds = result.info.classification?.['cve-id'] || [];
        const cveId = cveIds.length > 0 ? cveIds[0] : null;

        // Check if vulnerability already exists for this asset
        const existing = await prisma.vulnerabilities.findFirst({
          where: {
            assetId,
            cveId: cveId || result.info.name,
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

          // Create new evidence for this scan iteration
          if (result.request) {
            await prisma.evidence.create({
              data: {
                vulnerabilityId: existing.id,
                type: 'http_request',
                description: `HTTP Request (re-detected on ${new Date().toLocaleDateString()})`,
                content: result.request,
                mimeType: 'text/plain',
              },
            });
          }

          if (result.response) {
            await prisma.evidence.create({
              data: {
                vulnerabilityId: existing.id,
                type: 'http_response',
                description: `HTTP Response (re-detected on ${new Date().toLocaleDateString()})`,
                content: result.response,
                mimeType: 'text/plain',
              },
            });
          }
        } else {
          // Create new vulnerability
          const vuln = await prisma.vulnerabilities.create({
            data: {
              tenantId,
              assetId,
              scanId,
              title: result.info.name,
              description: result.info.description || `Detected by template: ${result['template-id']}`,
              severity,
              cvssScore,
              cveId: cveId || result.info.name,
              status: 'OPEN',
              firstSeen: new Date(),
              lastSeen: new Date(),
              tags: result.info.tags || [],
              detectionMethod: 'Nuclei',
              templateId: result['template-id'],
              matcher: result['matcher-name'] || '',
              targetUrl: result.matched_at || result.host,
              rawResponse: result.response || null,
              curlCommand: result['curl-command'] || null,
              createdById: userId,
            },
          });

          // Create evidence records for HTTP request/response
          if (result.request) {
            await prisma.evidence.create({
              data: {
                vulnerabilityId: vuln.id,
                type: 'http_request',
                description: 'HTTP Request that triggered the vulnerability',
                content: result.request,
                mimeType: 'text/plain',
              },
            });
          }

          if (result.response) {
            await prisma.evidence.create({
              data: {
                vulnerabilityId: vuln.id,
                type: 'http_response',
                description: 'HTTP Response showing the vulnerability',
                content: result.response,
                mimeType: 'text/plain',
              },
            });
          }

          // Add curl command as evidence if available
          if (result['curl-command']) {
            await prisma.evidence.create({
              data: {
                vulnerabilityId: vuln.id,
                type: 'log',
                description: 'cURL command to reproduce the vulnerability',
                content: result['curl-command'],
                mimeType: 'text/plain',
              },
            });
          }
        }
      } catch (error: any) {
        logger.error(`Failed to store vulnerability: ${error.message}`);
      }
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

  /**
   * Map Nuclei severity to our severity levels
   */
  private mapSeverity(nucleiSeverity: string): Severity {
    const severityMap: Record<string, Severity> = {
      info: 'INFO',
      low: 'LOW',
      medium: 'MEDIUM',
      high: 'HIGH',
      critical: 'CRITICAL',
    };
    return severityMap[nucleiSeverity.toLowerCase()] || 'MEDIUM';
  }

  /**
   * Estimate CVSS score based on severity
   */
  private estimateCvssScore(severity: string): number {
    const scoreMap: Record<string, number> = {
      informational: 0.0,
      low: 3.5,
      medium: 5.5,
      high: 7.5,
      critical: 9.5,
    };
    return scoreMap[severity] || 5.0;
  }

  /**
   * Find or create asset
   */
  private async findOrCreateAsset(target: string, tenantId: string, userId: string): Promise<any> {
    // Normalize target (remove protocol, trailing slashes)
    const normalizedTarget = target.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Use AssetService for proper deduplication
    const assetService = new AssetService();

    // Determine if it's an IP or hostname
    const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalizedTarget);

    const result = await assetService.findOrCreateAsset(
      tenantId,
      userId,
      {
        name: normalizedTarget,
        type: isIp ? 'IP' : 'DOMAIN',
        identifier: normalizedTarget,
        hostname: isIp ? undefined : normalizedTarget,
        ipAddress: isIp ? normalizedTarget : undefined,
        criticality: 'MEDIUM',
      },
      'scan'
    );

    return result.asset;
  }

  /**
   * Update scan status
   */
  private async updateScanStatus(scanId: string, status: string, error?: string): Promise<void> {
    const scan = await prisma.scans.update({
      where: { id: scanId },
      data: {
        status: status as any,
        completedAt: new Date(),
        errorMessage: error,
      },
    });

    // Broadcast failure via WebSocket if status is FAILED
    if (status === 'FAILED' && scan.tenantId) {
      const duration = scan.startedAt
        ? Math.round((Date.now() - new Date(scan.startedAt).getTime()) / 1000)
        : 0;
      websocketService.broadcastScanCompleted(scan.tenantId, scanId, 'FAILED', 0, duration);
      websocketService.broadcastScanProgress(scan.tenantId, scanId, 'FAILED', 100, 'Failed', 0);
    }
  }

  /**
   * Get scan by ID
   */
  async getScanById(scanId: string, tenantId: string): Promise<any> {
    return prisma.scans.findFirst({
      where: {
        id: scanId,
        tenantId,
      },
      include: {
        assets: {
          select: {
            id: true,
            name: true,
            hostname: true,
            ipAddress: true,
            type: true,
          },
        },
        vulnerabilities: {
          select: {
            id: true,
            title: true,
            description: true,
            severity: true,
            cvssScore: true,
            cveId: true,
            status: true,
            firstSeen: true,
          },
          orderBy: {
            cvssScore: 'desc',
          },
        },
        _count: {
          select: {
            vulnerabilities: true,
          },
        },
      },
    });
  }

  /**
   * Get all scans for tenant
   */
  async getScans(tenantId: string, limit: number = 50): Promise<any> {
    return prisma.scans.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        assets: {
          select: {
            id: true,
            name: true,
            hostname: true,
            ipAddress: true,
            type: true,
          },
        },
        _count: {
          select: {
            vulnerabilities: true,
          },
        },
      },
    });
  }

  /**
   * Trigger AI analysis for vulnerabilities from a completed scan
   */
  private async triggerAIAnalysis(scanId: string, tenantId: string): Promise<void> {
    try {
      logger.info(`[SCAN ${scanId}] Starting AI analysis for vulnerabilities`);

      // Fetch vulnerabilities from this scan
      const vulnerabilities = await prisma.vulnerabilities.findMany({
        where: {
          scanId,
          tenantId,
        },
        include: {
          assets: {
            select: {
              name: true,
              type: true,
              environment: true,
              criticality: true,
            },
          },
        },
      });

      if (vulnerabilities.length === 0) {
        logger.info(`[SCAN ${scanId}] No vulnerabilities to analyze`);
        return;
      }

      logger.info(`[SCAN ${scanId}] Analyzing ${vulnerabilities.length} vulnerabilities with AI`);

      // Instantiate AI service and analyze
      const aiService = new AIAnalysisService();
      await aiService.analyzeMultipleVulnerabilities(vulnerabilities);

      logger.info(`[SCAN ${scanId}] AI analysis completed successfully`);
    } catch (error: any) {
      logger.error(`[SCAN ${scanId}] AI analysis error: ${error.message}`);
      // Don't throw - AI analysis failure shouldn't fail the scan
    }
  }

  /**
   * Start multiple scans in parallel (bulk scan)
   */
  async startBulkScan(options: {
    targets: string[];
    scanLevel: 'light' | 'normal' | 'extreme';
    tenantId: string;
    userId: string;
    deepScanAuthorized?: boolean;
    maxConcurrent?: number;
  }): Promise<{
    total: number;
    completed: number;
    failed: number;
    results: Array<{
      target: string;
      status: 'completed' | 'failed';
      scanId?: string;
      error?: string;
    }>;
  }> {
    const { targets, scanLevel, tenantId, userId, deepScanAuthorized = false, maxConcurrent = 3 } = options;

    // Generate unique batch ID for this bulk scan operation
    const batchId = `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalBatches = Math.ceil(targets.length / maxConcurrent);
    const startTime = Date.now();

    logger.info(`Starting bulk scan: ${targets.length} targets with ${maxConcurrent} concurrent scans (batchId: ${batchId})`);

    // Broadcast bulk scan started event
    websocketService.broadcastBulkScanStarted(tenantId, batchId, targets.length, maxConcurrent);

    const results: Array<{
      target: string;
      status: 'completed' | 'failed';
      scanId?: string;
      error?: string;
    }> = [];

    let completed = 0;
    let failed = 0;
    const recentScans: Array<{
      target: string;
      scanId?: string;
      status: 'completed' | 'failed' | 'running';
      error?: string;
    }> = [];

    // Process scans in batches to limit concurrency
    for (let i = 0; i < targets.length; i += maxConcurrent) {
      const batch = targets.slice(i, i + maxConcurrent);
      const currentBatch = Math.floor(i / maxConcurrent) + 1;

      logger.info(`Processing batch ${currentBatch}/${totalBatches}: ${batch.length} targets`);

      // Broadcast progress for batch start
      websocketService.broadcastBulkScanProgress(
        tenantId,
        batchId,
        targets.length,
        completed,
        failed,
        batch.length,
        currentBatch,
        totalBatches,
        recentScans.slice(-10) // Send last 10 recent scans
      );

      // Start all scans in this batch concurrently
      const batchPromises = batch.map(async (target) => {
        // Add to recent scans as "running"
        const scanEntry: {
          target: string;
          status: 'completed' | 'failed' | 'running';
          scanId?: string;
          error?: string;
        } = {
          target,
          status: 'running' as const,
        };
        recentScans.push(scanEntry);

        // Broadcast progress with running scan
        websocketService.broadcastBulkScanProgress(
          tenantId,
          batchId,
          targets.length,
          completed,
          failed,
          batch.length,
          currentBatch,
          totalBatches,
          recentScans.slice(-10)
        );

        try {
          const result = await this.startScan({
            target,
            scanLevel,
            tenantId,
            userId,
            deepScanAuthorized,
          });

          completed++;

          // Update scan entry to completed
          scanEntry.status = 'completed';
          scanEntry.scanId = result.scanId;

          // Broadcast progress update
          websocketService.broadcastBulkScanProgress(
            tenantId,
            batchId,
            targets.length,
            completed,
            failed,
            batch.length - 1,
            currentBatch,
            totalBatches,
            recentScans.slice(-10)
          );

          return {
            target,
            status: 'completed' as const,
            scanId: result.scanId,
          };
        } catch (error: any) {
          failed++;
          logger.error(`Bulk scan failed for ${target}:`, error.message);

          // Update scan entry to failed
          scanEntry.status = 'failed';
          scanEntry.error = error.message;

          // Broadcast progress update
          websocketService.broadcastBulkScanProgress(
            tenantId,
            batchId,
            targets.length,
            completed,
            failed,
            batch.length - 1,
            currentBatch,
            totalBatches,
            recentScans.slice(-10)
          );

          return {
            target,
            status: 'failed' as const,
            error: error.message,
          };
        }
      });

      // Wait for all scans in this batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      logger.info(`Batch ${currentBatch}/${totalBatches} completed: ${completed} successful, ${failed} failed`);
    }

    const duration = Date.now() - startTime;

    logger.info(`Bulk scan completed: ${completed}/${targets.length} successful, ${failed} failed (${duration}ms)`);

    // Broadcast bulk scan completed event
    websocketService.broadcastBulkScanCompleted(
      tenantId,
      batchId,
      targets.length,
      completed,
      failed,
      duration
    );

    return {
      total: targets.length,
      completed,
      failed,
      results,
    };
  }
}

export const scanService = new ScanService();
