/**
 * Reconnaissance Service
 * Implements multi-stage reconnaissance pipeline with artifact persistence
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';
import dns from 'dns/promises';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { parseStringPromise } from 'xml2js';
import puppeteer from 'puppeteer';
import { AttackChainService } from './attack-chain.service';
import { subdomainEnumerationService } from './subdomain-enumeration.service';
import { screenshotCaptureService } from './screenshot-capture.service';

const execAsync = promisify(exec);

interface ReconSessionConfig {
  scanId: string;
  assetId: string;
  target: string;
  tenantId: string;
  enablePassive?: boolean;
  enableActive?: boolean;
  enableContentDiscovery?: boolean;
  enableTechStack?: boolean;
}

export class ReconService {
  // Process registry: sessionId-phase -> { phase, process, timeout }
  private processes = new Map<string, {
    phase: string;
    process: ChildProcess;
    timeout?: NodeJS.Timeout;
  }>();

  /**
   * Register process for tracking and kill-switch support
   */
  private async registerProcess(sessionId: string, phase: string, proc: ChildProcess): Promise<void> {
    const key = `${sessionId}-${phase}`;
    this.processes.set(key, {
      phase,
      process: proc,
    });

    // Store PID in database
    if (proc.pid) {
      await prisma.recon_phase_runs.updateMany({
        where: { sessionId, phase: phase as any, status: 'RUNNING' },
        data: { processId: proc.pid },
      });

      logger.info(`Registered process PID ${proc.pid} for session ${sessionId}, phase ${phase}`);
    }
  }

  /**
   * Kill process for specific session/phase
   */
  async killProcess(sessionId: string, phase: string): Promise<void> {
    const key = `${sessionId}-${phase}`;
    const entry = this.processes.get(key);

    if (entry && entry.process && !entry.process.killed) {
      logger.info(`Killing process for session ${sessionId}, phase ${phase}`);

      // Graceful SIGTERM first
      entry.process.kill('SIGTERM');

      // Force SIGKILL after 5 seconds if still running
      setTimeout(() => {
        if (entry.process && !entry.process.killed) {
          logger.warn(`Force killing process for session ${sessionId}, phase ${phase}`);
          entry.process.kill('SIGKILL');
        }
      }, 5000);

      this.processes.delete(key);
    }
  }

  /**
   * Kill all processes for a session
   */
  async killAllProcesses(sessionId: string): Promise<void> {
    logger.info(`Killing all processes for session ${sessionId}`);

    const keys = Array.from(this.processes.keys()).filter(k => k.startsWith(sessionId));

    for (const key of keys) {
      const phase = key.split('-')[1];
      await this.killProcess(sessionId, phase);
    }
  }

  /**
   * Initialize a new reconnaissance session
   */
  async initializeRecon(config: ReconSessionConfig): Promise<string> {
    const sessionId = randomUUID();

    await prisma.recon_sessions.create({
      data: {
        id: sessionId,
        scanId: config.scanId,
        assetId: config.assetId,
        status: 'RUNNING',
        passiveStatus: config.enablePassive !== false ? 'QUEUED' : 'DONE',
        activeStatus: config.enableActive !== false ? 'QUEUED' : 'DONE',
        contentStatus: config.enableContentDiscovery !== false ? 'QUEUED' : 'DONE',
        techStackStatus: config.enableTechStack !== false ? 'QUEUED' : 'DONE',
        startedAt: new Date(),
        tenantId: config.tenantId,
        updatedAt: new Date(),
      },
    });

    logger.info(`Recon session ${sessionId} initialized for ${config.target}`);

    // Execute recon stages asynchronously
    this.executeReconPipeline(sessionId, config).catch((error) => {
      logger.error(`Recon session ${sessionId} failed:`, error);
      this.markSessionFailed(sessionId, error.message);
    });

    return sessionId;
  }

  /**
   * Execute the full reconnaissance pipeline
   */
  private async executeReconPipeline(sessionId: string, config: ReconSessionConfig): Promise<void> {
    try {
      // Stage 1: Passive Reconnaissance
      if (config.enablePassive !== false) {
        await this.updateStageStatus(sessionId, 'PASSIVE', 'RUNNING');
        await this.runPassiveRecon(sessionId, config);
        await this.updateStageStatus(sessionId, 'PASSIVE', 'DONE');
      }

      // Stage 2: Active Reconnaissance
      if (config.enableActive !== false) {
        await this.updateStageStatus(sessionId, 'ACTIVE', 'RUNNING');
        await this.runActiveRecon(sessionId, config);
        await this.updateStageStatus(sessionId, 'ACTIVE', 'DONE');
      }

      // Stage 3: Content Discovery
      if (config.enableContentDiscovery !== false) {
        await this.updateStageStatus(sessionId, 'CONTENT_DISCOVERY', 'RUNNING');
        await this.runContentDiscovery(sessionId, config);
        await this.updateStageStatus(sessionId, 'CONTENT_DISCOVERY', 'DONE');
      }

      // Stage 4: Tech Stack Inference
      if (config.enableTechStack !== false) {
        await this.updateStageStatus(sessionId, 'TECH_STACK', 'RUNNING');
        await this.runTechStackInference(sessionId, config);
        await this.updateStageStatus(sessionId, 'TECH_STACK', 'DONE');
      }

      // Mark session as completed
      await prisma.recon_sessions.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          duration: this.calculateDuration(sessionId),
          updatedAt: new Date(),
        },
      });

      // Create attack chain after recon completes
      try {
        const attackChainService = new AttackChainService();
        const chainId = await attackChainService.createAttackChain(
          config.scanId,
          sessionId,
          [], // No vulnerabilities yet
          [], // No exploits yet
          'Reconnaissance completed',
          config.tenantId
        );

        // Get recon findings count
        const findingsCount = await prisma.recon_findings.count({
          where: { reconSessionId: sessionId },
        });

        // Add recon step to attack chain
        await attackChainService.addAttackChainStep(
          chainId,
          'RECON',
          {
            stage: 'completed',
            findingsCount,
            sessionId,
          },
          config.tenantId
        );

        // Update asset timeline
        await attackChainService.updateAssetTimeline(
          config.assetId,
          'DISCOVERED',
          {
            scanId: config.scanId,
            reconSessionId: sessionId,
            findingsCount,
          },
          config.tenantId
        );

        logger.info(`Attack chain ${chainId} created for recon session ${sessionId}`);
      } catch (error) {
        logger.error('Failed to create attack chain:', error);
        // Don't fail the whole recon if attack chain creation fails
      }

      logger.info(`Recon session ${sessionId} completed successfully`);
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Stage 1: Passive Reconnaissance
   * - DNS enumeration
   * - CT logs
   * - ASN data
   * - WHOIS data
   */
  private async runPassiveRecon(sessionId: string, config: ReconSessionConfig): Promise<void> {
    const target = config.target;

    // DNS Enumeration
    try {
      const dnsRecords = await this.getDNSRecords(target);
      await this.storeFinding(sessionId, 'PASSIVE', 'DNS_RECORDS', 'DNS Resolver', dnsRecords, 1.0);
    } catch (error) {
      logger.warn(`DNS enumeration failed for ${target}:`, error);
    }

    // CT Logs (Certificate Transparency)
    try {
      const ctLogs = await this.getCTLogs(target);
      await this.storeFinding(sessionId, 'PASSIVE', 'CT_LOGS', 'crt.sh', ctLogs, 0.95);
    } catch (error) {
      logger.warn(`CT logs query failed for ${target}:`, error);
    }

    // ASN Data
    try {
      const asnData = await this.getASNData(target);
      await this.storeFinding(sessionId, 'PASSIVE', 'ASN_DATA', 'Team Cymru', asnData, 0.9);
    } catch (error) {
      logger.warn(`ASN lookup failed for ${target}:`, error);
    }

    // WHOIS Data
    try {
      const whoisData = await this.getWHOISData(target);
      await this.storeFinding(sessionId, 'PASSIVE', 'WHOIS_DATA', 'WHOIS', whoisData, 0.85);
    } catch (error) {
      logger.warn(`WHOIS lookup failed for ${target}:`, error);
    }
  }

  /**
   * Stage 2: Active Reconnaissance
   * - HTTP probing
   * - Port scanning
   * - TLS fingerprinting
   * - Service detection
   */
  private async runActiveRecon(sessionId: string, config: ReconSessionConfig): Promise<void> {
    const target = config.target;

    // HTTP Probing
    try {
      const httpProbe = await this.probeHTTP(target);
      await this.storeFinding(sessionId, 'ACTIVE', 'HTTP_PROBE', 'HTTP Client', httpProbe, 1.0);
    } catch (error) {
      logger.warn(`HTTP probing failed for ${target}:`, error);
    }

    // Port Scanning (top ports only for speed)
    let openPorts: any[] = [];
    try {
      const portScan = await this.scanTopPorts(target);
      await this.storeFinding(sessionId, 'ACTIVE', 'PORT_SCAN', 'Nmap', portScan, 0.95);
      openPorts = portScan.openPorts || [];
    } catch (error) {
      logger.warn(`Port scanning failed for ${target}:`, error);
    }

    // Service Detection (on discovered open ports)
    if (openPorts.length > 0) {
      try {
        const services = await this.detectServices(target, openPorts);
        await this.storeFinding(sessionId, 'ACTIVE', 'SERVICE_DETECTION', 'Nmap', services, 0.9);
      } catch (error) {
        logger.warn(`Service detection failed for ${target}:`, error);
      }
    }

    // TLS Fingerprinting
    try {
      const tlsFingerprint = await this.fingerprintTLS(target);
      await this.storeFinding(sessionId, 'ACTIVE', 'TLS_FINGERPRINT', 'TLS Scanner', tlsFingerprint, 0.9);
    } catch (error) {
      logger.warn(`TLS fingerprinting failed for ${target}:`, error);
    }
  }

  /**
   * Stage 3: Content Discovery
   * - URL crawling
   * - Parameter extraction
   * - Endpoint discovery
   * - Hidden directories
   */
  private async runContentDiscovery(sessionId: string, config: ReconSessionConfig): Promise<void> {
    const target = config.target;

    // URL Crawling
    let crawledUrls: string[] = [];
    try {
      const crawlResult = await this.crawlTarget(target);
      await this.storeFinding(sessionId, 'CONTENT_DISCOVERY', 'CRAWLED_URLS', 'Web Crawler', crawlResult, 1.0);
      crawledUrls = crawlResult.urls || [];
    } catch (error) {
      logger.warn(`URL crawling failed for ${target}:`, error);
    }

    // Endpoint Discovery (Feroxbuster)
    let discoveredEndpoints: string[] = [];
    try {
      const endpoints = await this.discoverEndpoints(target);
      await this.storeFinding(sessionId, 'CONTENT_DISCOVERY', 'ENDPOINTS', 'Endpoint Mapper', endpoints, 0.85);

      // Combine endpoint and directory URLs
      discoveredEndpoints = [
        ...(endpoints.endpoints || []).map((e: any) => e.url),
        ...(endpoints.directories || []).map((d: any) => d.url),
      ];
    } catch (error) {
      logger.warn(`Endpoint discovery failed for ${target}:`, error);
    }

    // Parameter Extraction (combine crawled + discovered URLs)
    const allUrls = [...new Set([...crawledUrls, ...discoveredEndpoints])];
    if (allUrls.length > 0) {
      try {
        const parameters = await this.extractParameters(target, allUrls);
        await this.storeFinding(sessionId, 'CONTENT_DISCOVERY', 'PARAMETERS', 'Parameter Extractor', parameters, 0.9);
      } catch (error) {
        logger.warn(`Parameter extraction failed for ${target}:`, error);
      }
    }

    // Behavioral Signals
    try {
      const signals = await this.collectBehavioralSignals(target, crawledUrls);
      await this.storeFinding(sessionId, 'CONTENT_DISCOVERY', 'BEHAVIORAL_SIGNALS', 'Behavioral Analyzer', signals, 0.85);
    } catch (error) {
      logger.warn(`Behavioral signal collection failed for ${target}:`, error);
    }
  }

  /**
   * Stage 4: Tech Stack Inference
   * - Framework detection
   * - Language identification
   * - Authentication type
   * - Security headers
   */
  private async runTechStackInference(sessionId: string, config: ReconSessionConfig): Promise<void> {
    const target = config.target;

    // Framework Detection
    try {
      const framework = await this.detectFramework(target);
      await this.storeFinding(sessionId, 'TECH_STACK', 'FRAMEWORK', 'Framework Detector', framework, 0.85);
    } catch (error) {
      logger.warn(`Framework detection failed for ${target}:`, error);
    }

    // Language Identification
    try {
      const language = await this.identifyLanguage(target);
      await this.storeFinding(sessionId, 'TECH_STACK', 'LANGUAGE', 'Language Identifier', language, 0.8);
    } catch (error) {
      logger.warn(`Language identification failed for ${target}:`, error);
    }

    // Authentication Type
    try {
      const authType = await this.detectAuthType(target);
      await this.storeFinding(sessionId, 'TECH_STACK', 'AUTH_TYPE', 'Auth Detector', authType, 0.75);
    } catch (error) {
      logger.warn(`Auth type detection failed for ${target}:`, error);
    }

    // Security Headers
    try {
      const securityHeaders = await this.analyzeSecurityHeaders(target);
      await this.storeFinding(sessionId, 'TECH_STACK', 'SECURITY_HEADERS', 'Header Analyzer', securityHeaders, 1.0);
    } catch (error) {
      logger.warn(`Security header analysis failed for ${target}:`, error);
    }
  }

  // ============================================================================
  // Helper Methods for Reconnaissance Techniques
  // ============================================================================

  private async getDNSRecords(target: string): Promise<any> {
    const results: any = { target, records: {} };

    try {
      results.records.A = await dns.resolve4(target);
    } catch (e) {}

    try {
      results.records.AAAA = await dns.resolve6(target);
    } catch (e) {}

    try {
      results.records.MX = await dns.resolveMx(target);
    } catch (e) {}

    try {
      results.records.TXT = await dns.resolveTxt(target);
    } catch (e) {}

    try {
      results.records.NS = await dns.resolveNs(target);
    } catch (e) {}

    results.timestamp = new Date().toISOString();
    return results;
  }

  private async getCTLogs(domain: string): Promise<any> {
    // Placeholder: In production, query crt.sh API or similar
    return {
      domain,
      source: 'crt.sh',
      certificates: [],
      subdomains: [],
      timestamp: new Date().toISOString(),
    };
  }

  private async getASNData(target: string): Promise<any> {
    // Placeholder: In production, query Team Cymru or similar
    return {
      target,
      asn: null,
      org: null,
      country: null,
      timestamp: new Date().toISOString(),
    };
  }

  private async getWHOISData(target: string): Promise<any> {
    // Placeholder: In production, use whois library
    return {
      target,
      registrar: null,
      createdDate: null,
      expiryDate: null,
      timestamp: new Date().toISOString(),
    };
  }

  private async probeHTTP(target: string): Promise<any> {
    // Placeholder: In production, use got or axios with detailed probing
    return {
      target,
      reachable: false,
      statusCode: null,
      redirects: [],
      headers: {},
      timestamp: new Date().toISOString(),
    };
  }

  private async scanTopPorts(target: string): Promise<any> {
    const tmpDir = os.tmpdir();
    const outputFile = path.join(tmpDir, `nmap-${randomUUID()}.xml`);

    try {
      // Use -sT (TCP connect scan) instead of -sS (SYN scan) to avoid requiring root
      // -Pn: Skip host discovery
      // -n: No DNS resolution
      // --top-ports 1000: Scan top 1000 ports
      // -oX: XML output
      const nmapCmd = `nmap -sT -Pn -n --top-ports 1000 -oX "${outputFile}" ${target}`;

      logger.info(`Executing Nmap scan: ${nmapCmd}`);

      // Execute Nmap with 5 minute timeout
      await execAsync(nmapCmd, { timeout: 300000 });

      // Read and parse XML output
      const xmlContent = await fs.readFile(outputFile, 'utf-8');
      const result = await parseStringPromise(xmlContent);

      // Extract port information
      const ports: any[] = [];
      const host = result?.nmaprun?.host?.[0];

      if (host && host.ports && host.ports[0].port) {
        for (const portData of host.ports[0].port) {
          const portInfo = {
            port: parseInt(portData.$.portid, 10),
            protocol: portData.$.protocol || 'tcp',
            state: portData.state?.[0]?.$.state || 'unknown',
            service: portData.service?.[0]?.$.name || 'unknown',
            version: portData.service?.[0]?.$.product
              ? `${portData.service[0].$.product} ${portData.service[0].$.version || ''}`.trim()
              : null,
          };

          ports.push(portInfo);
        }
      }

      // Clean up temp file
      await fs.unlink(outputFile).catch(() => {});

      logger.info(`Nmap scan completed: ${ports.filter(p => p.state === 'open').length} open ports found`);

      return {
        target,
        openPorts: ports.filter(p => p.state === 'open'),
        closedPorts: ports.filter(p => p.state === 'closed'),
        filteredPorts: ports.filter(p => p.state === 'filtered'),
        totalScanned: ports.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      // Clean up temp file on error
      await fs.unlink(outputFile).catch(() => {});

      // Check if Nmap is not installed
      if (error.message.includes('command not found') || error.message.includes('not recognized')) {
        logger.error('Nmap is not installed. Please install Nmap: apt install nmap (Linux) or brew install nmap (macOS)');
        throw new Error('Nmap is not installed on this system');
      }

      logger.error(`Nmap scan failed for ${target}:`, error.message);
      throw error;
    }
  }

  private async detectServices(target: string, openPorts: any[]): Promise<any> {
    const tmpDir = os.tmpdir();
    const outputFile = path.join(tmpDir, `nmap-services-${randomUUID()}.xml`);

    try {
      // Extract port numbers from openPorts array
      const portList = openPorts.map(p => p.port).join(',');

      if (!portList) {
        return {
          target,
          services: [],
          timestamp: new Date().toISOString(),
        };
      }

      // Use -sV for service version detection
      // -p<ports>: Only scan specified ports
      // -oX: XML output
      const nmapCmd = `nmap -sV -Pn -n -p${portList} -oX "${outputFile}" ${target}`;

      logger.info(`Executing Nmap service detection: ${nmapCmd}`);

      // Execute Nmap with 5 minute timeout
      await execAsync(nmapCmd, { timeout: 300000 });

      // Read and parse XML output
      const xmlContent = await fs.readFile(outputFile, 'utf-8');
      const result = await parseStringPromise(xmlContent);

      // Extract detailed service information
      const services: any[] = [];
      const host = result?.nmaprun?.host?.[0];

      if (host && host.ports && host.ports[0].port) {
        for (const portData of host.ports[0].port) {
          const serviceInfo: any = {
            port: parseInt(portData.$.portid, 10),
            protocol: portData.$.protocol || 'tcp',
            state: portData.state?.[0]?.$.state || 'unknown',
            service: portData.service?.[0]?.$.name || 'unknown',
            product: portData.service?.[0]?.$.product || null,
            version: portData.service?.[0]?.$.version || null,
            extraInfo: portData.service?.[0]?.$.extrainfo || null,
            osType: portData.service?.[0]?.$.ostype || null,
            cpe: [],
          };

          // Extract CPE (Common Platform Enumeration) identifiers
          if (portData.service?.[0]?.cpe) {
            serviceInfo.cpe = portData.service[0].cpe.map((c: any) => c._);
          }

          // Build full version string
          if (serviceInfo.product) {
            let fullVersion = serviceInfo.product;
            if (serviceInfo.version) {
              fullVersion += ` ${serviceInfo.version}`;
            }
            if (serviceInfo.extraInfo) {
              fullVersion += ` (${serviceInfo.extraInfo})`;
            }
            serviceInfo.fullVersion = fullVersion;
          }

          services.push(serviceInfo);
        }
      }

      // Clean up temp file
      await fs.unlink(outputFile).catch(() => {});

      logger.info(`Service detection completed: ${services.length} services identified`);

      return {
        target,
        services,
        totalServices: services.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      // Clean up temp file on error
      await fs.unlink(outputFile).catch(() => {});

      logger.error(`Service detection failed for ${target}:`, error.message);
      throw error;
    }
  }

  private async fingerprintTLS(target: string): Promise<any> {
    // Placeholder: In production, use TLS fingerprinting library
    return {
      target,
      tlsVersion: null,
      cipherSuites: [],
      certificate: {},
      timestamp: new Date().toISOString(),
    };
  }

  private async crawlTarget(target: string): Promise<any> {
    const maxDepth = 3;
    const maxPages = 100;
    const visitedUrls = new Set<string>();
    const discoveredUrls: string[] = [];
    const queue: Array<{ url: string; depth: number }> = [{ url: target, depth: 0 }];

    let browser;

    try {
      // Launch headless browser
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      const page = await browser.newPage();

      // Set realistic User-Agent
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Parse target URL to get base domain
      const targetUrl = new URL(target.startsWith('http') ? target : `https://${target}`);
      const baseDomain = targetUrl.hostname;

      logger.info(`Starting web crawl of ${target} (max depth: ${maxDepth}, max pages: ${maxPages})`);

      while (queue.length > 0 && visitedUrls.size < maxPages) {
        const { url, depth } = queue.shift()!;

        // Skip if already visited or depth exceeded
        if (visitedUrls.has(url) || depth > maxDepth) {
          continue;
        }

        try {
          // Mark as visited
          visitedUrls.add(url);
          discoveredUrls.push(url);

          logger.debug(`Crawling: ${url} (depth: ${depth})`);

          // Navigate to page with timeout
          await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 10000,
          });

          // Wait a bit for JavaScript to execute
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Extract all links
          // @ts-ignore - document and DOM types exist in browser context
          const links = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a[href]'));
            const forms = Array.from(document.querySelectorAll('form[action]'));

            const urls: string[] = [];

            // Extract href from anchors
            anchors.forEach((a) => {
              const href = (a as HTMLAnchorElement).href;
              if (href) urls.push(href);
            });

            // Extract action from forms
            forms.forEach((form) => {
              const action = (form as HTMLFormElement).action;
              if (action) urls.push(action);
            });

            return urls;
          });

          // Filter and queue links
          for (const link of links) {
            try {
              const linkUrl = new URL(link);

              // Only follow links on the same domain
              if (linkUrl.hostname === baseDomain) {
                const normalizedLink = `${linkUrl.protocol}//${linkUrl.host}${linkUrl.pathname}`;

                if (!visitedUrls.has(normalizedLink)) {
                  queue.push({ url: normalizedLink, depth: depth + 1 });
                }
              }
            } catch {
              // Invalid URL, skip
            }
          }
        } catch (error) {
          logger.warn(`Failed to crawl ${url}:`, error);
          // Continue with next URL
        }
      }

      await browser.close();

      logger.info(`Web crawl completed: ${discoveredUrls.length} pages crawled`);

      return {
        target,
        urls: discoveredUrls,
        totalPages: discoveredUrls.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      if (browser) {
        await browser.close().catch(() => {});
      }

      logger.error(`Web crawling failed for ${target}:`, error.message);

      return {
        target,
        urls: discoveredUrls,
        totalPages: discoveredUrls.length,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async extractParameters(target: string, urls: string[]): Promise<any> {
    const getParams = new Set<string>();
    const postParams = new Set<string>();
    const jsonParams = new Set<string>();

    // Mandatory baseline parameters (ALWAYS TESTED)
    const MANDATORY_PARAMS = [
      'id',
      'user',
      'userid',
      'username',
      'search',
      'q',
      'query',
      'page',
      'pagesize',
      'limit',
      'file',
      'path',
      'url',
      'redirect',
      'next',
      'callback',
    ];

    // Add mandatory parameters to GET
    MANDATORY_PARAMS.forEach((param) => getParams.add(param));

    try {
      // Launch browser for form extraction
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      // Process each URL (limit to first 50 for performance)
      const urlsToProcess = urls.slice(0, 50);

      for (const url of urlsToProcess) {
        try {
          // Extract GET parameters from URL query string
          const urlObj = new URL(url);
          urlObj.searchParams.forEach((_, key) => {
            getParams.add(key);
          });

          // Visit page to extract forms and analyze API endpoints
          try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });

            // Extract form input parameters
            // @ts-ignore - document exists in browser context
            const formParams = await page.evaluate(() => {
              const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
              return inputs
                .map((input: any) => input.name || input.id)
                .filter((name: string) => name && name.length > 0);
            });

            formParams.forEach((param: string) => postParams.add(param));

            // Detect API endpoints and extract JSON parameters
            const isApiEndpoint =
              url.includes('/api/') || url.includes('/rest/') || url.includes('/graphql');

            if (isApiEndpoint) {
              // Common JSON API parameters
              const commonJsonParams = [
                'data',
                'payload',
                'body',
                'request',
                'params',
                'filter',
                'sort',
                'order',
              ];
              commonJsonParams.forEach((param) => jsonParams.add(param));
            }
          } catch {
            // Skip pages that fail to load
          }
        } catch {
          // Skip invalid URLs
        }
      }

      await browser.close();

      logger.info(
        `Parameter extraction completed: ${getParams.size} GET, ${postParams.size} POST, ${jsonParams.size} JSON`
      );

      return {
        target,
        getParams: Array.from(getParams),
        postParams: Array.from(postParams),
        jsonParams: Array.from(jsonParams),
        totalParams: getParams.size + postParams.size + jsonParams.size,
        mandatoryParams: MANDATORY_PARAMS,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error(`Parameter extraction failed for ${target}:`, error.message);

      // Return at least mandatory parameters
      return {
        target,
        getParams: MANDATORY_PARAMS,
        postParams: [],
        jsonParams: [],
        totalParams: MANDATORY_PARAMS.length,
        mandatoryParams: MANDATORY_PARAMS,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async discoverEndpoints(target: string): Promise<any> {
    const tmpDir = os.tmpdir();
    const outputFile = path.join(tmpDir, `feroxbuster-${randomUUID()}.json`);

    try {
      // Determine wordlist path (try common locations)
      const wordlistPaths = [
        path.join(os.homedir(), 'SecLists/Discovery/Web-Content/raft-medium-directories.txt'),
        '/opt/SecLists/Discovery/Web-Content/raft-medium-directories.txt',
        '/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt',
        '/usr/share/wordlists/dirb/common.txt',
      ];

      let wordlistPath = '';
      for (const path of wordlistPaths) {
        try {
          await fs.access(path);
          wordlistPath = path;
          break;
        } catch {}
      }

      if (!wordlistPath) {
        logger.warn('No wordlist found for Feroxbuster. Skipping directory enumeration.');
        return {
          target,
          endpoints: [],
          directories: [],
          totalFound: 0,
          timestamp: new Date().toISOString(),
        };
      }

      // Execute Feroxbuster
      // -u: Target URL
      // -w: Wordlist
      // -t 10: 10 threads
      // -d 2: Recursion depth 2
      // --json: JSON output
      // -o: Output file
      // --filter-status 404,403: Skip not found/forbidden
      // --silent: Reduce verbosity
      const feroxCmd = `feroxbuster -u "${target}" -w "${wordlistPath}" -t 10 -d 2 --json -o "${outputFile}" --filter-status 404 --silent --timeout 10`;

      logger.info(`Executing Feroxbuster: ${feroxCmd}`);

      // Execute Feroxbuster with 10 minute timeout
      await execAsync(feroxCmd, { timeout: 600000 });

      // Read and parse JSON output (line-by-line JSONL format)
      const fileContent = await fs.readFile(outputFile, 'utf-8');
      const lines = fileContent.trim().split('\n');

      const endpoints: any[] = [];
      const directories: any[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const entry = JSON.parse(line);

          // Only process successful responses
          if (entry.type === 'response' && entry.status && entry.url) {
            const item = {
              url: entry.url,
              status: entry.status,
              contentLength: entry.content_length || 0,
              wordCount: entry.word_count || 0,
              lineCount: entry.line_count || 0,
            };

            // Categorize as directory or endpoint
            if (entry.url.endsWith('/')) {
              directories.push(item);
            } else {
              endpoints.push(item);
            }
          }
        } catch (parseError) {
          // Skip malformed lines
          continue;
        }
      }

      // Clean up temp file
      await fs.unlink(outputFile).catch(() => {});

      logger.info(`Feroxbuster completed: ${endpoints.length} endpoints, ${directories.length} directories found`);

      return {
        target,
        endpoints,
        directories,
        totalFound: endpoints.length + directories.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      // Clean up temp file on error
      await fs.unlink(outputFile).catch(() => {});

      // Check if Feroxbuster is not installed
      if (error.message.includes('command not found') || error.message.includes('not recognized')) {
        logger.warn('Feroxbuster is not installed. Skipping directory enumeration. Install: cargo install feroxbuster');
        return {
          target,
          endpoints: [],
          directories: [],
          totalFound: 0,
          timestamp: new Date().toISOString(),
        };
      }

      // Check if timeout occurred
      if (error.killed || error.message.includes('timeout')) {
        logger.warn(`Feroxbuster timed out for ${target}`);
        // Try to read partial results
        try {
          const fileContent = await fs.readFile(outputFile, 'utf-8');
          await fs.unlink(outputFile).catch(() => {});
          // Parse partial results...
          return {
            target,
            endpoints: [],
            directories: [],
            totalFound: 0,
            partial: true,
            timestamp: new Date().toISOString(),
          };
        } catch {}
      }

      logger.error(`Feroxbuster failed for ${target}:`, error.message);
      throw error;
    }
  }

  private async collectBehavioralSignals(target: string, urls: string[]): Promise<any> {
    const signals = {
      authWallDetected: false,
      apiEndpointCount: 0,
      uploadFormDetected: false,
      adminPanelFound: false,
      errorPagesExposed: false,
      sensitivePathsFound: [] as string[],
    };

    try {
      // Analyze discovered URLs for behavioral patterns
      const sensitivePatterns = ['/config', '/.git', '/backup', '/.env', '/admin', '/dashboard'];
      const adminPatterns = ['/admin', '/dashboard', '/console', '/management'];
      const apiPatterns = ['/api/', '/rest/', '/graphql', '/v1/', '/v2/'];

      for (const url of urls) {
        const lowerUrl = url.toLowerCase();

        // Check for sensitive paths
        for (const pattern of sensitivePatterns) {
          if (lowerUrl.includes(pattern)) {
            signals.sensitivePathsFound.push(url);
          }
        }

        // Check for admin panels
        for (const pattern of adminPatterns) {
          if (lowerUrl.includes(pattern)) {
            signals.adminPanelFound = true;
            break;
          }
        }

        // Count API endpoints
        for (const pattern of apiPatterns) {
          if (lowerUrl.includes(pattern)) {
            signals.apiEndpointCount++;
            break;
          }
        }
      }

      // Launch browser to check for auth walls and upload forms
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      try {
        await page.goto(target.startsWith('http') ? target : `https://${target}`, {
          waitUntil: 'networkidle2',
          timeout: 10000,
        });

        // Check for login/auth forms
        // @ts-ignore - document exists in browser context
        const hasLoginForm = await page.evaluate(() => {
          const loginIndicators = [
            'input[type="password"]',
            'input[name*="password"]',
            'input[name*="login"]',
            'form[action*="login"]',
            'form[action*="auth"]',
          ];

          return loginIndicators.some((selector) => document.querySelector(selector) !== null);
        });

        signals.authWallDetected = hasLoginForm;

        // Check for file upload forms
        // @ts-ignore - document exists in browser context
        const hasUploadForm = await page.evaluate(() => {
          const uploadInputs = document.querySelectorAll('input[type="file"]');
          return uploadInputs.length > 0;
        });

        signals.uploadFormDetected = hasUploadForm;

        // Check for error pages with stack traces
        const pageContent = await page.content();
        const errorPatterns = [
          /stack trace/i,
          /traceback/i,
          /exception/i,
          /at [a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\([^)]+:\d+:\d+\)/,
        ];

        signals.errorPagesExposed = errorPatterns.some((pattern) => pattern.test(pageContent));
      } catch (error) {
        logger.warn(`Behavioral signal collection partial failure: ${error}`);
      }

      await browser.close();

      logger.info(`Behavioral signals collected: ${Object.keys(signals).length} indicators analyzed`);

      return {
        target,
        ...signals,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error(`Behavioral signal collection failed for ${target}:`, error.message);

      return {
        target,
        ...signals,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async detectFramework(target: string): Promise<any> {
    // Placeholder: In production, use Wappalyzer or similar
    return {
      target,
      framework: null,
      version: null,
      confidence: 0,
      timestamp: new Date().toISOString(),
    };
  }

  private async identifyLanguage(target: string): Promise<any> {
    // Placeholder: In production, analyze headers and file extensions
    return {
      target,
      language: null,
      confidence: 0,
      timestamp: new Date().toISOString(),
    };
  }

  private async detectAuthType(target: string): Promise<any> {
    // Placeholder: In production, analyze auth mechanisms
    return {
      target,
      authType: null,
      methods: [],
      timestamp: new Date().toISOString(),
    };
  }

  private async analyzeSecurityHeaders(target: string): Promise<any> {
    // Placeholder: In production, fetch and analyze security headers
    return {
      target,
      csp: null,
      hsts: null,
      xFrameOptions: null,
      xContentTypeOptions: null,
      timestamp: new Date().toISOString(),
    };
  }

  // ============================================================================
  // Database Helper Methods
  // ============================================================================

  private async updateStageStatus(
    sessionId: string,
    stage: 'PASSIVE' | 'ACTIVE' | 'CONTENT_DISCOVERY' | 'TECH_STACK',
    status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED'
  ): Promise<void> {
    const statusField =
      stage === 'PASSIVE'
        ? 'passiveStatus'
        : stage === 'ACTIVE'
        ? 'activeStatus'
        : stage === 'CONTENT_DISCOVERY'
        ? 'contentStatus'
        : 'techStackStatus';

    await prisma.recon_sessions.update({
      where: { id: sessionId },
      data: {
        [statusField]: status,
        updatedAt: new Date(),
      },
    });
  }

  private async storeFinding(
    sessionId: string,
    stage: 'PASSIVE' | 'ACTIVE' | 'CONTENT_DISCOVERY' | 'TECH_STACK',
    findingType: string,
    source: string,
    data: any,
    confidence: number
  ): Promise<void> {
    const session = await prisma.recon_sessions.findUnique({
      where: { id: sessionId },
      select: { tenantId: true },
    });

    if (!session) {
      throw new Error(`Recon session ${sessionId} not found`);
    }

    await prisma.recon_findings.create({
      data: {
        id: randomUUID(),
        reconSessionId: sessionId,
        stage,
        findingType,
        source,
        data,
        confidence,
        tenantId: session.tenantId,
      },
    });
  }

  private async markSessionFailed(sessionId: string, errorMessage: string): Promise<void> {
    await prisma.recon_sessions.update({
      where: { id: sessionId },
      data: {
        status: 'FAILED',
        errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  private calculateDuration(sessionId: string): number {
    // Placeholder: Calculate from startedAt to now
    return 0;
  }

  /**
   * Get reconnaissance session by ID
   */
  async getReconSession(sessionId: string, tenantId: string) {
    return await prisma.recon_sessions.findFirst({
      where: { id: sessionId, tenantId },
      include: {
        assets: true, // Include asset relation for target URL
        recon_findings: {
          orderBy: { discoveredAt: 'desc' },
        },
      },
    });
  }

  /**
   * Get reconnaissance findings for a session
   */
  async getReconFindings(sessionId: string, tenantId: string, stage?: string) {
    const where: any = { reconSessionId: sessionId, tenantId };
    if (stage) {
      where.stage = stage;
    }

    return await prisma.recon_findings.findMany({
      where,
      orderBy: { discoveredAt: 'desc' },
    });
  }

  /**
   * Get reconnaissance sessions for a scan
   */
  async getReconSessionsForScan(scanId: string, tenantId: string) {
    return await prisma.recon_sessions.findMany({
      where: { scanId, tenantId },
      include: {
        _count: {
          select: { recon_findings: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ============================================================================
  // Interactive Phase Execution Methods
  // ============================================================================

  /**
   * Capture screenshots for subdomains using centralized service
   */
  private async captureScreenshotsForSubdomains(
    subdomains: string[],
    sessionId: string,
    tenantId: string
  ): Promise<void> {
    try {
      // Try HTTP first for each subdomain
      const targets = subdomains.map(subdomain => ({
        subdomain,
        protocol: 'http'
      }));

      logger.info(`[RECON] Capturing ${targets.length} screenshots for session ${sessionId}`);

      const results = await screenshotCaptureService.captureScreenshotsBatch(
        targets,
        `recon/${sessionId}`
      );

      // Store successful screenshots as artifacts
      for (const result of results) {
        if (result.success && result.screenshotUrl) {
          await prisma.recon_artifacts.create({
            data: {
              id: randomUUID(),
              sessionId,
              phase: 'SUBDOMAINS',
              type: 'screenshot_png',
              storagePath: result.screenshotUrl, // This is the public URL path
              payload: {
                subdomain: result.subdomain,
                url: `http://${result.subdomain}`,
                screenshotUrl: result.screenshotUrl,
                capturedAt: new Date().toISOString()
              },
              tenantId
            }
          });
          logger.info(`[RECON] Screenshot artifact created for ${result.subdomain}`);
        } else {
          logger.warn(`[RECON] Screenshot failed for ${result.subdomain}: ${result.error}`);
        }
      }

      const successCount = results.filter(r => r.success).length;
      logger.info(`[RECON] Screenshots completed: ${successCount}/${results.length} successful`);
    } catch (error) {
      logger.error(`[RECON] Screenshot batch failed:`, error);
    }
  }

  /**
   * Extract root domain from URL
   * Examples:
   * - http://testphp.vulnweb.com -> vulnweb.com
   * - https://api.example.com:8080/path -> example.com
   * - subdomain.test.example.com -> example.com
   */
  private extractRootDomain(target: string): string {
    // Remove protocol
    let domain = target.replace(/^https?:\/\//, '');

    // Remove path
    domain = domain.replace(/\/.*$/, '');

    // Remove port
    domain = domain.split(':')[0];

    // Split by dots
    const parts = domain.split('.');

    // Handle common multi-part TLDs
    const multiPartTLDs = ['co.uk', 'com.au', 'co.za', 'co.nz', 'com.br', 'co.in'];
    const lastTwoParts = parts.slice(-2).join('.');

    if (multiPartTLDs.includes(lastTwoParts) && parts.length > 2) {
      // For multi-part TLDs, take last 3 parts (e.g., example.co.uk)
      return parts.slice(-3).join('.');
    } else if (parts.length >= 2) {
      // For regular domains, take last 2 parts (e.g., example.com)
      return parts.slice(-2).join('.');
    }

    // If we only have 1 part, return as-is
    return domain;
  }

  /**
   * Phase 0: Run Subdomain Enumeration (Sublist3r)
   */
  async runSubdomainEnum(sessionId: string, target: string): Promise<void> {
    const session = await prisma.recon_sessions.findUnique({
      where: { id: sessionId },
      select: { tenantId: true },
    });

    if (!session) {
      throw new Error(`Recon session ${sessionId} not found`);
    }

    // Create phase run
    const phaseRun = await prisma.recon_phase_runs.create({
      data: {
        id: randomUUID(),
        sessionId,
        phase: 'SUBDOMAINS',
        status: 'RUNNING',
        startedAt: new Date(),
        tenantId: session.tenantId,
        updatedAt: new Date(),
      },
    });

    try {
      logger.info(`Starting subdomain enumeration for ${target}`);

      // Check if Sublist3r is installed before attempting enumeration
      const isInstalled = await subdomainEnumerationService.checkSublist3rInstalled();
      if (!isInstalled) {
        throw new Error('Sublist3r is not installed. Please install with: pip3 install sublist3r');
      }

      // Extract root domain from target (strip subdomain, protocol, path, port)
      const domain = this.extractRootDomain(target);
      logger.info(`Extracted root domain: ${domain} from target: ${target}`);

      // Call Sublist3r
      const result = await subdomainEnumerationService.enumerateSubdomains(domain, sessionId);
      const subdomains = result.subdomains;

      // Store subdomains as findings
      for (const subdomain of subdomains) {
        await this.storeFinding(
          sessionId,
          'PASSIVE',
          'SUBDOMAIN',
          'sublist3r',
          { subdomain, root_domain: domain },
          1.0
        );
      }

      // Capture screenshots in background (don't wait for completion)
      // Limit to first 10 subdomains to avoid excessive resource usage
      const subdomainsToScreenshot = subdomains.slice(0, 10);
      logger.info(`Capturing screenshots for ${subdomainsToScreenshot.length} subdomains in background`);

      // Use centralized Playwright-based screenshot service (same as exposure scan)
      this.captureScreenshotsForSubdomains(
        subdomainsToScreenshot,
        sessionId,
        session.tenantId
      ).catch(err => logger.error(`Screenshot batch failed:`, err));

      // Also do DNS and CT logs as supplementary data
      try {
        const dnsRecords = await this.getDNSRecords(target);
        await this.storeFinding(sessionId, 'PASSIVE', 'DNS_RECORDS', 'DNS Resolver', dnsRecords, 1.0);
      } catch (error) {
        logger.warn(`DNS enumeration failed:`, error);
      }

      try {
        const ctLogs = await this.getCTLogs(target);
        await this.storeFinding(sessionId, 'PASSIVE', 'CT_LOGS', 'crt.sh', ctLogs, 0.95);
        // Add CT log subdomains to our list (deduplicate)
        const ctSubdomains = ctLogs.subdomains || [];
        for (const sub of ctSubdomains) {
          if (!subdomains.includes(sub)) {
            subdomains.push(sub);
          }
        }
      } catch (error) {
        logger.warn(`CT logs failed:`, error);
      }

      // Store artifact
      const artifactPath = `/data/recon/${sessionId}/subdomains.txt`;
      await prisma.recon_artifacts.create({
        data: {
          id: randomUUID(),
          sessionId,
          phaseRunId: phaseRun.id,
          phase: 'SUBDOMAINS',
          type: 'sublist3r_txt',
          storagePath: artifactPath,
          payload: {
            root_domain: target,
            subdomains,
            total: subdomains.length,
          },
          tenantId: session.tenantId,
        },
      });

      // Mark complete
      await prisma.recon_phase_runs.update({
        where: { id: phaseRun.id },
        data: {
          status: 'DONE',
          finishedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.info(`Subdomain enumeration completed: ${subdomains.length} subdomains found`);
    } catch (error: any) {
      logger.error(`Subdomain enumeration failed:`, error);

      await prisma.recon_phase_runs.update({
        where: { id: phaseRun.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: error.message,
          updatedAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Phase 1: Run Nmap Port Scanning
   */
  async runNmap(sessionId: string, target: string): Promise<void> {
    const session = await prisma.recon_sessions.findUnique({
      where: { id: sessionId },
      select: { tenantId: true },
    });

    if (!session) {
      throw new Error(`Recon session ${sessionId} not found`);
    }

    const phaseRun = await prisma.recon_phase_runs.create({
      data: {
        id: randomUUID(),
        sessionId,
        phase: 'NMAP',
        status: 'RUNNING',
        startedAt: new Date(),
        tenantId: session.tenantId,
        updatedAt: new Date(),
      },
    });

    const tmpDir = os.tmpdir();
    const outputFile = path.join(tmpDir, `nmap-${sessionId}.xml`);

    try {
      logger.info(`Starting Nmap scan for ${target}`);

      // Spawn Nmap process
      const nmapArgs = [
        '-p-',
        '--open',
        '-sT',
        '-T4',
        '--max-retries', '2',
        '--host-timeout', '5m',
        '-oX', outputFile,
        target
      ];

      const proc = spawn('nmap', nmapArgs);

      // Register process for kill-switch
      await this.registerProcess(sessionId, 'NMAP', proc);

      // Wait for completion
      await new Promise<void>((resolve, reject) => {
        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Nmap failed with code ${code}`));
          }
        });

        proc.on('error', (error) => {
          reject(error);
        });
      });

      // Parse XML
      const xmlData = await fs.readFile(outputFile, 'utf-8');
      const parsed = await parseStringPromise(xmlData);

      // Extract ports
      const ports: any[] = [];
      const host = parsed?.nmaprun?.host?.[0];

      if (host && host.ports && host.ports[0].port) {
        for (const portData of host.ports[0].port) {
          ports.push({
            port: parseInt(portData.$.portid, 10),
            protocol: portData.$.protocol || 'tcp',
            state: portData.state?.[0]?.$.state || 'unknown',
            service: portData.service?.[0]?.$.name || 'unknown',
            version: portData.service?.[0]?.$.product
              ? `${portData.service[0].$.product} ${portData.service[0].$.version || ''}`.trim()
              : null,
          });
        }
      }

      const openPorts = ports.filter(p => p.state === 'open');

      // Store artifact
      await prisma.recon_artifacts.create({
        data: {
          id: randomUUID(),
          sessionId,
          phaseRunId: phaseRun.id,
          phase: 'NMAP',
          type: 'nmap_xml',
          storagePath: outputFile,
          payload: {
            target,
            open_ports: openPorts,
            total_scanned: ports.length,
          },
          tenantId: session.tenantId,
        },
      });

      // Store findings
      for (const port of openPorts) {
        await this.storeFinding(
          sessionId,
          'ACTIVE',
          'PORT_SCAN',
          'nmap',
          port,
          0.95
        );
      }

      // Mark complete
      await prisma.recon_phase_runs.update({
        where: { id: phaseRun.id },
        data: {
          status: 'DONE',
          finishedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.info(`Nmap scan completed: ${openPorts.length} open ports found`);
    } catch (error: any) {
      logger.error(`Nmap scan failed:`, error);

      // Clean up
      await fs.unlink(outputFile).catch(() => {});

      await prisma.recon_phase_runs.update({
        where: { id: phaseRun.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: error.message,
          updatedAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Phase 2: Run Feroxbuster Directory Enumeration
   */
  async runFeroxbuster(
    sessionId: string,
    baseUrl: string,
    options?: { wordlist?: string; depth?: number }
  ): Promise<void> {
    const session = await prisma.recon_sessions.findUnique({
      where: { id: sessionId },
      select: { tenantId: true },
    });

    if (!session) {
      throw new Error(`Recon session ${sessionId} not found`);
    }

    const phaseRun = await prisma.recon_phase_runs.create({
      data: {
        id: randomUUID(),
        sessionId,
        phase: 'FEROXBUSTER',
        status: 'RUNNING',
        startedAt: new Date(),
        parameters: options,
        tenantId: session.tenantId,
        updatedAt: new Date(),
      },
    });

    const tmpDir = os.tmpdir();
    const outputFile = path.join(tmpDir, `ferox-${sessionId}.json`);

    // Determine wordlist
    const wordlistPaths = [
      options?.wordlist,
      path.join(os.homedir(), 'SecLists/Discovery/Web-Content/raft-medium-directories.txt'),
      '/opt/SecLists/Discovery/Web-Content/raft-medium-directories.txt',
      '/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt',
      '/usr/share/wordlists/dirb/common.txt',
    ].filter(Boolean);

    let wordlist = '';
    for (const wl of wordlistPaths) {
      try {
        await fs.access(wl!);
        wordlist = wl!;
        break;
      } catch {}
    }

    if (!wordlist) {
      const error = new Error('No wordlist found for Feroxbuster');
      await prisma.recon_phase_runs.update({
        where: { id: phaseRun.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: error.message,
          updatedAt: new Date(),
        },
      });
      throw error;
    }

    try {
      logger.info(`Starting Feroxbuster for ${baseUrl}`);

      const feroxArgs = [
        '-u', baseUrl,
        '-w', wordlist,
        '-t', '20',
        '-d', String(options?.depth || 2),
        '-x', 'php,html,js,json',
        '-s', '200,204,301,302,401,403',
        '--no-state',
        '--timeout', '7',
        '--json',
        '-o', outputFile
      ];

      logger.info(`Feroxbuster args: feroxbuster ${feroxArgs.join(' ')}`);

      const proc = spawn('feroxbuster', feroxArgs);

      // Register process
      await this.registerProcess(sessionId, 'FEROXBUSTER', proc);

      // Capture stderr for diagnostics
      let stderrBuf = '';
      proc.stderr?.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString(); });
      proc.stdout?.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) logger.info(`[ferox stdout] ${line.substring(0, 200)}`);
      });

      // Wait for completion — feroxbuster may exit non-zero even with valid results
      const exitCode = await new Promise<number>((resolve, reject) => {
        proc.on('close', (code) => {
          if (stderrBuf.trim()) logger.warn(`Feroxbuster stderr: ${stderrBuf.substring(0, 500)}`);
          resolve(code ?? 1);
        });
        proc.on('error', (error) => reject(error));
      });

      // Only hard-fail on code 2 (arg error) when no output was written
      let outputExists = false;
      try { await fs.access(outputFile); outputExists = true; } catch {}
      if (exitCode === 2 && !outputExists) {
        throw new Error(`Feroxbuster failed with code ${exitCode} (argument error)`);
      }
      if (exitCode !== 0) {
        logger.warn(`Feroxbuster exited with code ${exitCode}, checking for partial results...`);
      }

      // Parse JSON lines
      const jsonData = await fs.readFile(outputFile, 'utf-8');
      const lines = jsonData.split('\n').filter(l => l.trim());
      const endpoints = lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(r => r && r.type === 'response');

      // Store artifact
      await prisma.recon_artifacts.create({
        data: {
          id: randomUUID(),
          sessionId,
          phaseRunId: phaseRun.id,
          phase: 'FEROXBUSTER',
          type: 'ferox_json',
          storagePath: outputFile,
          payload: {
            base_url: baseUrl,
            endpoints,
            stats: { total: endpoints.length },
          },
          tenantId: session.tenantId,
        },
      });

      // Store findings
      for (const endpoint of endpoints) {
        await this.storeFinding(
          sessionId,
          'CONTENT_DISCOVERY',
          'ENDPOINT_DISCOVERY',
          'feroxbuster',
          endpoint,
          1.0
        );
      }

      // Mark complete
      await prisma.recon_phase_runs.update({
        where: { id: phaseRun.id },
        data: {
          status: 'DONE',
          finishedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.info(`Feroxbuster completed: ${endpoints.length} endpoints found`);
    } catch (error: any) {
      logger.error(`Feroxbuster failed:`, error);

      await fs.unlink(outputFile).catch(() => {});

      await prisma.recon_phase_runs.update({
        where: { id: phaseRun.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: error.message,
          updatedAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Phase AI: Run Local AI Threat Analysis
   */
  async runLocalAI(sessionId: string): Promise<void> {
    const session = await prisma.recon_sessions.findUnique({
      where: { id: sessionId },
      select: { tenantId: true },
    });

    if (!session) {
      throw new Error(`Recon session ${sessionId} not found`);
    }

    const phaseRun = await prisma.recon_phase_runs.create({
      data: {
        id: randomUUID(),
        sessionId,
        phase: 'AI_ANALYSIS',
        status: 'RUNNING',
        startedAt: new Date(),
        tenantId: session.tenantId,
        updatedAt: new Date(),
      },
    });

    try {
      logger.info(`Starting AI threat analysis for session ${sessionId}`);

      // Gather all findings
      const findings = await prisma.recon_findings.findMany({
        where: { reconSessionId: sessionId },
      });

      const subdomains = findings.filter(f => f.findingType === 'SUBDOMAIN' || f.findingType === 'CT_LOGS' || f.findingType === 'DNS_RECORDS');
      const ports = findings.filter(f => f.findingType === 'PORT_SCAN');
      const endpoints = findings.filter(f => f.findingType === 'ENDPOINT_DISCOVERY');
      const params = findings.find(f => f.findingType === 'PARAMETERS');

      // Prepare AI input
      const inputSummary = {
        subdomains: subdomains.map(f => f.data),
        open_ports: ports.map(f => f.data),
        endpoints: endpoints.map(f => f.data),
        parameters: params?.data || {},
      };
      const paramData: any = params?.data || {};

      const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/generate';
      const model = process.env.OLLAMA_MODEL || 'hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16';
      const timeoutMs = parseInt(process.env.OLLAMA_TIMEOUT || '30000', 10);
      const enabled = process.env.AI_ANALYSIS_ENABLED !== 'false';

      const fallbackResponse = {
        attack_surface: {
          total_endpoints: endpoints.length,
          parameters_found: paramData.totalParams || 0,
          services_exposed: ports.map((p: any) => p.data.service || 'unknown'),
        },
        candidate_attack_paths: [
          {
            name: 'Review exposed services and endpoints',
            confidence: 'medium',
            because: ['Local AI unavailable; using heuristic summary'],
            recommended_next_steps: ['Validate scope and ROE', 'Run targeted templates based on exposed services'],
          },
        ],
        recommended_nuclei_tags: ['misconfig', 'exposure', 'auth-bypass'],
        why_not_tested: [{ reason: 'ai_unavailable', detail: 'Ollama analysis was unavailable' }],
        confidence: 0.55,
      };

      const aiResponse = enabled
        ? await this.callOllamaThreatAssessment({
            ollamaUrl,
            model,
            timeoutMs,
            inputSummary,
          }).catch((err: any) => {
            logger.warn(`Ollama threat assessment fallback: ${err.message || String(err)}`);
            return fallbackResponse;
          })
        : fallbackResponse;

      // Guardrails: ensure minimally useful output even if the model returns empty fields.
      if (!Array.isArray(aiResponse.recommended_nuclei_tags) || aiResponse.recommended_nuclei_tags.length === 0) {
        aiResponse.recommended_nuclei_tags = ['misconfig', 'exposure', 'xss', 'sqli'];
      }
      if (!Array.isArray(aiResponse.candidate_attack_paths) || aiResponse.candidate_attack_paths.length === 0) {
        aiResponse.candidate_attack_paths = fallbackResponse.candidate_attack_paths;
      } else {
        const first = aiResponse.candidate_attack_paths[0];
        if (first && typeof first === 'object' && (!first.name || String(first.name).trim().length === 0)) {
          first.name = 'Prioritize highest-signal endpoints and services';
        }
      }
      if (typeof aiResponse.confidence !== 'number' || aiResponse.confidence <= 0) {
        aiResponse.confidence = fallbackResponse.confidence;
      }

      // Store AI decision
      await prisma.recon_ai_decisions.create({
        data: {
          id: randomUUID(),
          sessionId,
          inputSummary,
          modelName: model,
          modelVersion: 'ollama',
          temperature: 0.2,
          attackSurface: aiResponse.attack_surface,
          candidateAttackPaths: aiResponse.candidate_attack_paths,
          recommendedNucleiTags: aiResponse.recommended_nuclei_tags,
          whyNotTested: aiResponse.why_not_tested,
          confidenceScore: aiResponse.confidence,
          tenantId: session.tenantId,
        },
      });

      // Mark complete
      await prisma.recon_phase_runs.update({
        where: { id: phaseRun.id },
        data: {
          status: 'DONE',
          finishedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.info(`AI threat analysis completed`);
    } catch (error: any) {
      logger.error(`AI analysis failed:`, error);

      await prisma.recon_phase_runs.update({
        where: { id: phaseRun.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: error.message,
          updatedAt: new Date(),
        },
      });

      throw error;
    }
  }

  private async callOllamaThreatAssessment(params: {
    ollamaUrl: string;
    model: string;
    timeoutMs: number;
    inputSummary: any;
  }): Promise<{
    attack_surface: any;
    candidate_attack_paths: any;
    recommended_nuclei_tags: string[];
    why_not_tested: any[];
    confidence: number;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);

    try {
      const prompt = [
        'You are a security analyst assistant for web reconnaissance triage.',
        'Given recon findings, return STRICT JSON only (no markdown, no commentary).',
        'Schema:',
        '{',
        '  "attack_surface": { "total_endpoints": number, "parameters_found": number, "services_exposed": string[] },',
        '  "candidate_attack_paths": [{ "name": string, "confidence": "low"|"medium"|"high", "because": string[], "recommended_next_steps": string[] }],',
        '  "recommended_nuclei_tags": string[],',
        '  "why_not_tested": [{ "reason": string, "detail": string }],',
        '  "confidence": number',
        '}',
        '',
        'Recon findings JSON:',
        JSON.stringify(params.inputSummary),
      ].join('\n');

      const response = await fetch(params.ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: params.model,
          format: 'json',
          prompt,
          stream: false,
          options: { temperature: 0.2, top_p: 0.9 },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama API returned ${response.status}`);
      }

      const data = await response.json();
      const text = (data?.response || '').trim();

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Best-effort: extract the first JSON object from the model output.
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
          parsed = JSON.parse(text.slice(start, end + 1));
        } else {
          throw new Error('Ollama output was not JSON');
        }
      }
      if (!parsed || typeof parsed !== 'object') throw new Error('Ollama output was not JSON');

      return {
        attack_surface: parsed.attack_surface || {},
        candidate_attack_paths: parsed.candidate_attack_paths || [],
        recommended_nuclei_tags: parsed.recommended_nuclei_tags || [],
        why_not_tested: parsed.why_not_tested || [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Analyze Feroxbuster endpoints with Ollama LLM
   * Categorises discovered paths by attack potential so the operator can pick Nuclei targets.
   */
  async analyzeEndpointsWithAI(sessionId: string): Promise<{
    high: Array<{ url: string; reason: string }>;
    medium: Array<{ url: string; reason: string }>;
    low: Array<{ url: string; reason: string }>;
    skip: Array<{ url: string; reason: string }>;
    summary: string;
    recommendedTags: string[];
  }> {
    const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/generate';
    const model = process.env.OLLAMA_MODEL || 'hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16';
    const timeoutMs = parseInt(process.env.OLLAMA_TIMEOUT || '120000', 10);

    // Fetch all ENDPOINT_DISCOVERY findings for this session
    const findings = await prisma.recon_findings.findMany({
      where: { reconSessionId: sessionId, findingType: 'ENDPOINT_DISCOVERY' },
    });

    if (findings.length === 0) {
      throw new Error('No endpoint discovery findings to analyse');
    }

    // Extract endpoint data – each finding.data holds { url, status, contentLength, ... }
    const endpoints = findings.map((f: any) => {
      const d = f.data || {};
      return {
        url: d.url || d.path || 'unknown',
        status: d.status || d.statusCode || 0,
        size: d.contentLength || d.content_length || d.size || 0,
      };
    });

    logger.info(`Analysing ${endpoints.length} endpoints with Ollama for session ${sessionId}`);

    // Build a compact representation to fit within context window
    // Group by status code for efficiency
    const byStatus: Record<number, string[]> = {};
    for (const ep of endpoints) {
      const s = ep.status || 0;
      if (!byStatus[s]) byStatus[s] = [];
      byStatus[s].push(ep.url);
    }

    const prompt = [
      'You are an expert penetration tester triaging web directories discovered by Feroxbuster.',
      'Given the list of discovered endpoints grouped by HTTP status, categorise each URL by attack priority for a Nuclei vulnerability scan.',
      '',
      'RULES:',
      '- "high": Admin panels, login pages, API endpoints, upload forms, config files, debug pages, database interfaces, .env/.git exposure, backup files',
      '- "medium": Dynamic pages with parameters, CMS paths, user-facing forms, search endpoints, API docs',
      '- "low": Static assets, images, CSS/JS bundles, font files, generic marketing pages',
      '- "skip": Redirects to external sites, empty directories, favicon, robots.txt, obviously benign static content',
      '',
      'Also recommend the best Nuclei template tags to use (from: sqli, xss, ssrf, lfi, rce, auth-bypass, idor, xxe, misconfig, exposure, cve, default-login, upload, traversal).',
      '',
      'Return STRICT JSON only (no markdown, no commentary):',
      '{',
      '  "high": [{ "url": "...", "reason": "..." }],',
      '  "medium": [{ "url": "...", "reason": "..." }],',
      '  "low": [{ "url": "...", "reason": "..." }],',
      '  "skip": [{ "url": "...", "reason": "..." }],',
      '  "summary": "Brief 2-sentence overview of the attack surface",',
      '  "recommendedTags": ["tag1", "tag2", ...]',
      '}',
      '',
      `Total endpoints: ${endpoints.length}`,
      '',
      'Endpoints by status code:',
      JSON.stringify(byStatus),
    ].join('\n');

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          format: 'json',
          prompt,
          stream: false,
          options: { temperature: 0.2, top_p: 0.9 },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama API returned ${response.status}`);
      }

      const data = await response.json();
      const text = (data?.response || '').trim();

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
          parsed = JSON.parse(text.slice(start, end + 1));
        } else {
          throw new Error('Ollama output was not valid JSON');
        }
      }

      const result = {
        high: Array.isArray(parsed.high) ? parsed.high : [],
        medium: Array.isArray(parsed.medium) ? parsed.medium : [],
        low: Array.isArray(parsed.low) ? parsed.low : [],
        skip: Array.isArray(parsed.skip) ? parsed.skip : [],
        summary: parsed.summary || `Analysed ${endpoints.length} endpoints.`,
        recommendedTags: Array.isArray(parsed.recommendedTags) ? parsed.recommendedTags : ['misconfig', 'exposure'],
      };

      logger.info(`AI endpoint analysis complete: ${result.high.length} high, ${result.medium.length} medium, ${result.low.length} low, ${result.skip.length} skip`);
      return result;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Ollama endpoint analysis timed out');
      }
      throw err;
    } finally {
      clearTimeout(tid);
    }
  }

  /**
   * Phase 3: Run Nuclei Validation
   */
  async runNuclei(sessionId: string, targetUrls: string[], tags: string[]): Promise<void> {
    const session = await prisma.recon_sessions.findUnique({
      where: { id: sessionId },
      select: { tenantId: true, scanId: true },
    });

    if (!session) {
      throw new Error(`Recon session ${sessionId} not found`);
    }

    const phaseRun = await prisma.recon_phase_runs.create({
      data: {
        id: randomUUID(),
        sessionId,
        phase: 'NUCLEI',
        status: 'RUNNING',
        startedAt: new Date(),
        parameters: { targetUrls, tags },
        tenantId: session.tenantId,
        updatedAt: new Date(),
      },
    });

    const tmpDir = os.tmpdir();
    const targetFile = path.join(tmpDir, `nuclei-targets-${sessionId}.txt`);
    const outputFile = path.join(tmpDir, `nuclei-${sessionId}.jsonl`);

    try {
      logger.info(`Starting Nuclei scan for ${targetUrls.length} targets`);

      // Write targets to file
      await fs.writeFile(targetFile, targetUrls.join('\n'));

      const nucleiArgs = [
        '-l', targetFile,
        '-t', '/root/nuclei-templates',
        '-tags', tags.join(','),
        '-severity', 'info,low,medium,high,critical',
        '-jsonl',
        '-irr',
        '-no-interactsh',
        '-timeout', '10',
        '-rate-limit', '100',
        '-c', '15',
        '-o', outputFile,
      ];

      const proc = spawn('nuclei', nucleiArgs);

      // Register process
      await this.registerProcess(sessionId, 'NUCLEI', proc);

      // Wait for completion
      await new Promise<void>((resolve, reject) => {
        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Nuclei failed with code ${code}`));
          }
        });

        proc.on('error', (error) => {
          reject(error);
        });
      });

      // Parse results
      const results = (await fs.readFile(outputFile, 'utf-8'))
        .split('\n')
        .filter(l => l.trim())
        .map(l => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      // Store artifact
      await prisma.recon_artifacts.create({
        data: {
          id: randomUUID(),
          sessionId,
          phaseRunId: phaseRun.id,
          phase: 'NUCLEI',
          type: 'nuclei_jsonl',
          storagePath: outputFile,
          payload: { total: results.length, results },
          tenantId: session.tenantId,
        },
      });

      // Mark complete
      await prisma.recon_phase_runs.update({
        where: { id: phaseRun.id },
        data: {
          status: 'DONE',
          finishedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Clean up
      await fs.unlink(targetFile).catch(() => {});

      logger.info(`Nuclei scan completed: ${results.length} findings`);
    } catch (error: any) {
      logger.error(`Nuclei scan failed:`, error);

      await fs.unlink(targetFile).catch(() => {});
      await fs.unlink(outputFile).catch(() => {});

      await prisma.recon_phase_runs.update({
        where: { id: phaseRun.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: error.message,
          updatedAt: new Date(),
        },
      });

      throw error;
    }
  }
}
