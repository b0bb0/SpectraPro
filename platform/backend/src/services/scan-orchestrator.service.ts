/**
 * Enterprise Scan Orchestration Service
 * Implements Rapid7-style multi-phase vulnerability scanning
 */

import {
  ScanPhase,
  ScanProfile,
  AssetContext,
  PhaseConfig,
  ScanPlan,
  PhaseExecution,
  ScanOrchestrationState,
  TemplateSelectionRule,
  AIScanIntent,
  SCOPE_FOLDER_MAP,
  ScanAuthConfig,
} from '../types/scan-orchestration.types';
import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';
import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { consoleService } from './console.service';
import { scanAIPhase2Service } from './scan-ai-phase2.service';

class ScanOrchestratorService {
  private readonly outputDir = path.join(process.cwd(), '..', '..', 'data', 'scans');
  private readonly orchestrationStates = new Map<string, ScanOrchestrationState>();
  private readonly activeProcesses = new Map<string, Set<ChildProcess>>();

  /**
   * HARD ALLOWLIST: Valid Nuclei Tags
   * These are actual tags from the Nuclei community templates
   * Any tag not in this list will be DISCARDED
   */
  private readonly VALID_NUCLEI_TAGS = new Set([
    // Injection vulnerabilities
    'sqli', 'sql-injection',
    'xss', 'cross-site-scripting',
    'xxe', 'xml-external-entity',
    'ssti', 'server-side-template-injection',
    'ssrf', 'server-side-request-forgery',
    'lfi', 'local-file-inclusion',
    'rfi', 'remote-file-inclusion',
    'rce', 'remote-code-execution',
    'cmd-injection', 'command-injection',
    'idor', 'insecure-direct-object-reference',

    // Authentication & Authorization
    'auth-bypass', 'authentication-bypass',
    'broken-auth', 'broken-authentication',
    'weak-credentials', 'default-credentials',
    'jwt',

    // Configuration & Exposure
    'misconfig', 'misconfiguration',
    'exposure', 'exposure-detection',
    'disclosure', 'information-disclosure',
    'debug', 'debug-mode',
    'backup', 'backup-file',
    'config', 'configuration-exposure',

    // File Operations
    'file-upload', 'unrestricted-file-upload',
    'file-read', 'arbitrary-file-read',
    'traversal', 'path-traversal', 'directory-traversal',

    // Web Application
    'redirect', 'open-redirect',
    'crlf', 'crlf-injection',
    'cors', 'cors-misconfiguration',
    'csrf', 'cross-site-request-forgery',
    'clickjacking',

    // CMS & Frameworks
    'wordpress', 'wp',
    'drupal',
    'joomla',
    'magento',
    'laravel',
    'spring',

    // Technology-specific
    'apache',
    'nginx',
    'iis',
    'tomcat',
    'jenkins',
    'gitlab',
    'docker',

    // Protocols & Services
    'api',
    'graphql',
    'swagger',
    'rest',
    'soap',
    'websocket',

    // Security Headers
    'security-headers',
    'hsts',
    'csp',

    // Generic
    'unauth', 'unauthenticated',
    'panel', 'admin-panel',
    'login', 'login-page',
    'tech', 'technology-detection',
  ]);

  /**
   * Semantic Vulnerability Class to Nuclei Tag Mapping
   * Translates high-level concepts to actual Nuclei tags
   */
  private readonly SEMANTIC_TAG_MAP: Record<string, string[]> = {
    'sql-injection': ['sqli', 'sql-injection'],
    'cross-site-scripting': ['xss', 'cross-site-scripting'],
    'remote-file-inclusion': ['rfi', 'remote-file-inclusion'],
    'local-file-inclusion': ['lfi', 'local-file-inclusion'],
    'remote-code-execution': ['rce', 'remote-code-execution'],
    'authentication-bypass': ['auth-bypass', 'authentication-bypass'],
    'file-upload': ['file-upload', 'unrestricted-file-upload'],
    'information-disclosure': ['disclosure', 'information-disclosure'],
    'path-traversal': ['traversal', 'path-traversal'],
    'open-redirect': ['redirect', 'open-redirect'],
    'command-injection': ['cmd-injection', 'command-injection'],
    'server-side-request-forgery': ['ssrf', 'server-side-request-forgery'],
    'xml-external-entity': ['xxe', 'xml-external-entity'],
    'server-side-template-injection': ['ssti', 'server-side-template-injection'],
    'cross-site-request-forgery': ['csrf', 'cross-site-request-forgery'],
    'insecure-direct-object-reference': ['idor', 'insecure-direct-object-reference'],
    'misconfiguration': ['misconfig', 'misconfiguration'],
    'exposure': ['exposure', 'exposure-detection'],
  };

  /**
   * Template Selection Rules (LEGACY - Reference Only)
   * Replaced by AI-based scan intent generation (scanAIPhase2Service)
   * Kept for reference and potential fallback scenarios
   *
   * NOTE: These rules used filesystem paths - new AI system uses semantic tags/scopes
   */
  private readonly templateRules: TemplateSelectionRule[] = [
    {
      name: 'WordPress Security',
      condition: (ctx) => ctx.technologies.cms === 'wordpress',
      templates: [
        'http/cves/wordpress/',
        'http/vulnerabilities/wordpress/',
        'http/default-logins/wordpress/',
        'http/misconfiguration/wordpress/',
      ],
      priority: 10,
    },
    {
      name: 'PHP Vulnerabilities',
      condition: (ctx) => ctx.technologies.language === 'php',
      templates: [
        'http/cves/php/',
        'http/vulnerabilities/lfi/',
        'http/vulnerabilities/rfi/',
        'http/vulnerabilities/sqli/',
        'http/misconfiguration/php-',
      ],
      priority: 9,
    },
    {
      name: 'Authentication Attacks',
      condition: (ctx) => ctx.surface.hasAuth,
      templates: [
        'http/default-logins/',
        'http/vulnerabilities/auth-bypass',
        'http/vulnerabilities/weak-auth',
        'http/misconfiguration/unauth',
      ],
      priority: 10,
    },
    {
      name: 'Injection Attacks',
      condition: (ctx) => ctx.surface.hasForms || ctx.surface.parameters.length > 0,
      templates: [
        'http/vulnerabilities/sqli/',
        'http/vulnerabilities/xss/',
        'http/vulnerabilities/ssti/',
        'http/vulnerabilities/cmd-injection',
      ],
      priority: 9,
    },
    {
      name: 'File Upload Attacks',
      condition: (ctx) => ctx.surface.hasFileUpload,
      templates: [
        'http/vulnerabilities/file-upload',
        'http/vulnerabilities/rce',
        'http/misconfiguration/unauth-upload',
      ],
      priority: 10,
    },
    {
      name: 'API Security',
      condition: (ctx) => ctx.surface.hasApi,
      templates: [
        'http/vulnerabilities/api/',
        'http/misconfiguration/api-',
        'http/exposed-panels/api',
      ],
      priority: 8,
    },
    {
      name: 'SSL/TLS Vulnerabilities',
      condition: (ctx) => ctx.security.https,
      templates: [
        'ssl/',
        'http/misconfiguration/tls-',
        'http/vulnerabilities/ssl-',
      ],
      priority: 7,
    },
    {
      name: 'Apache Security',
      condition: (ctx) => ctx.technologies.webServer === 'apache',
      templates: [
        'http/cves/apache-',
        'http/misconfiguration/apache-',
        'http/vulnerabilities/apache-',
      ],
      priority: 8,
    },
    {
      name: 'Nginx Security',
      condition: (ctx) => ctx.technologies.webServer === 'nginx',
      templates: [
        'http/cves/nginx-',
        'http/misconfiguration/nginx-',
      ],
      priority: 8,
    },
    {
      name: 'WAF Detection & Bypass',
      condition: (ctx) => ctx.security.waf === true,
      templates: [
        'http/misconfiguration/waf-bypass',
        'http/vulnerabilities/waf-',
      ],
      priority: 6,
    },
  ];

  /**
   * Phase Display Names (User-Facing)
   * Hide technical details, show business value
   */
  private readonly phaseDisplayNames: Record<ScanPhase, string> = {
    [ScanPhase.PREFLIGHT]: 'Initializing scan',
    [ScanPhase.DISCOVERY]: 'Analyzing attack surface',
    [ScanPhase.PASSIVE_SIGNALS]: 'Detecting exposures',
    [ScanPhase.TARGETED_SCAN]: 'Assessing vulnerabilities',
    [ScanPhase.BASELINE_HYGIENE]: 'Checking security hygiene',
    [ScanPhase.CORRELATION]: 'Correlating findings',
    [ScanPhase.DEEP_SCAN]: 'Deep security analysis',
    [ScanPhase.PROCESSING]: 'Processing results',
    [ScanPhase.COMPLETED]: 'Scan completed',
    [ScanPhase.FAILED]: 'Scan failed',
  };

  /**
   * Generate Scan Plan
   * Create execution plan based on profile
   */
  async generateScanPlan(
    scanId: string,
    target: string,
    profile: ScanProfile,
    assetCriticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM'
  ): Promise<ScanPlan> {
    const phases: PhaseConfig[] = [];

    // Phase 0: Preflight (always required)
    phases.push({
      phase: ScanPhase.PREFLIGHT,
      displayName: 'Preflight Check',
      description: 'Validating target reachability',
      templatePaths: [],
      flags: [],
      timeout: 5,
      rateLimit: 100,
      concurrency: 10,
      severity: [],
      estimatedDuration: 2,
      required: true,
    });

    // Phase 1: Discovery (always required)
    phases.push({
      phase: ScanPhase.DISCOVERY,
      displayName: 'Technology Discovery',
      description: 'Fingerprinting technologies and attack surface',
      templatePaths: [
        'http/technologies/',
        'dns/',
        'ssl/',
      ],
      flags: ['-timeout', '5', '-no-interactsh'],
      timeout: 5,
      rateLimit: 150,
      concurrency: 25,
      severity: ['info', 'low', 'medium', 'high', 'critical'],
      estimatedDuration: 15,
      required: true,
    });

    // Phase 1.5: Passive Signals (always required for all profiles)
    phases.push({
      phase: ScanPhase.PASSIVE_SIGNALS,
      displayName: 'Passive Exposure Detection',
      description: 'Deterministic exposure signals (info/low severity only)',
      templatePaths: [
        'http/exposures/',
        'http/exposed-panels/',
      ],
      flags: ['-timeout', '5', '-no-interactsh'],
      timeout: 5,
      rateLimit: 150,
      concurrency: 25,
      severity: ['info', 'low'],
      estimatedDuration: 20,
      required: true,
    });

    // Phase 2: Targeted Scan (always required, AI-driven with profile strictness)
    phases.push({
      phase: ScanPhase.TARGETED_SCAN,
      displayName: profile === ScanProfile.FAST ? 'Critical Vulnerability Check' : 'Targeted Vulnerability Assessment',
      description: 'AI-powered context-aware security checks',
      templatePaths: [], // Populated by AI analysis after discovery
      flags: ['-timeout', '10', '-irr'],
      timeout: 10,
      rateLimit: 100,
      concurrency: 15,
      severity: profile === ScanProfile.FAST ? ['high', 'critical'] : ['info', 'low', 'medium', 'high', 'critical'],
      estimatedDuration: profile === ScanProfile.FAST ? 30 : 60,
      required: true,
    });

    // Phase 2.5: Baseline Hygiene (BALANCED and DEEP profiles only)
    if (profile === ScanProfile.BALANCED || profile === ScanProfile.DEEP) {
      phases.push({
        phase: ScanPhase.BASELINE_HYGIENE,
        displayName: 'Security Hygiene Assessment',
        description: 'Deterministic baseline security checks',
        templatePaths: [
          'http/misconfiguration/',
          'http/exposures/',
          'http/default-logins/',
          'ssl/',
          'dns/',
        ],
        flags: ['-timeout', '10', '-no-interactsh'],
        timeout: 10,
        rateLimit: 150,
        concurrency: 30,
        severity: ['info', 'low', 'medium', 'high', 'critical'],
        estimatedDuration: 45,
        required: true,
      });
    }

    // Phase 3: Deep Scan (DEEP profile only, requires explicit authorization)
    // NOTE: This phase is NOT automatically executed even with DEEP profile
    // Authorization must be explicitly granted via deepScanAuthorized flag
    if (profile === ScanProfile.DEEP) {
      phases.push({
        phase: ScanPhase.DEEP_SCAN,
        displayName: 'Deep Security Analysis',
        description: 'Aggressive comprehensive assessment (requires authorization)',
        templatePaths: [
          'http/fuzzing/',
          'http/vulnerabilities/',
          'http/misconfiguration/',
        ],
        flags: ['-timeout', '15', '-irr'],
        timeout: 15,
        rateLimit: 100,
        concurrency: 30,
        severity: ['info', 'low', 'medium', 'high', 'critical'],
        estimatedDuration: 180,
        required: false, // Only runs if explicitly authorized
      });
    }

    // Phase 4: Correlation (always required for all profiles)
    phases.push({
      phase: ScanPhase.CORRELATION,
      displayName: 'Correlating Security Findings',
      description: 'Deduplication, grouping, and risk scoring',
      templatePaths: [], // Processing phase, no templates
      flags: [],
      timeout: 0,
      rateLimit: 0,
      concurrency: 0,
      severity: [],
      estimatedDuration: 10,
      required: true,
    });

    const plan: ScanPlan = {
      scanId,
      profile,
      phases,
      estimatedTotalDuration: phases.reduce((sum, p) => sum + p.estimatedDuration, 0),
      templateCount: 0, // Internal only
      createdAt: new Date().toISOString(),
    };

    logger.info(`[ORCHESTRATOR] Scan plan generated: ${phases.length} phases, ~${plan.estimatedTotalDuration}s`);
    return plan;
  }

  /**
   * Execute Preflight Phase
   * Validate target reachability
   */
  private async executePreflightPhase(
    scanId: string,
    target: string
  ): Promise<{ success: boolean; reachable: boolean; responseTime: number }> {
    logger.info(`[ORCHESTRATOR] ${scanId}: Preflight check`);

    const startTime = Date.now();

    try {
      // Simple HTTP check
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(target, {
        signal: controller.signal,
        redirect: 'follow',
      }).catch(() => null);

      clearTimeout(timeout);

      const responseTime = Date.now() - startTime;
      const reachable = response !== null && response.status < 500;

      logger.info(`[ORCHESTRATOR] ${scanId}: Preflight ${reachable ? 'passed' : 'failed'} (${responseTime}ms)`);

      return {
        success: true,
        reachable,
        responseTime,
      };
    } catch (error: any) {
      logger.error(`[ORCHESTRATOR] ${scanId}: Preflight error: ${error.message}`);
      return {
        success: false,
        reachable: false,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute Discovery Phase
   * Run lightweight fingerprinting templates
   */
  private async executeDiscoveryPhase(
    scanId: string,
    target: string,
    config: PhaseConfig
  ): Promise<AssetContext> {
    logger.info(`[ORCHESTRATOR] ${scanId}: Starting discovery phase`);

    // Fetch scan auth config from database
    const scan = await prisma.scans.findUnique({
      where: { id: scanId },
      select: { authConfig: true },
    });

    const authConfig = (scan?.authConfig as unknown) as ScanAuthConfig | null;

    const outputFile = path.join(this.outputDir, `${scanId}-discovery.jsonl`);

    // Get templates path from environment
    const templatesPath = process.env.NUCLEI_TEMPLATES_PATH || '';
    const templatePath = templatesPath
      ? path.join(templatesPath, 'http/technologies/')
      : 'http/technologies/';

    const args = [
      '-u', target,
      '-t', templatePath,
      '-jsonl',
      '-timeout', '5',
      '-rate-limit', '150',
      '-c', '25',
      '-no-interactsh',
      '-silent',
      '-o', outputFile,
      ...this.buildAuthArgs(authConfig), // Add authentication headers
    ];

    if (authConfig && authConfig.method !== 'none') {
      logger.info(`[ORCHESTRATOR] ${scanId}: Using ${authConfig.method} authentication`);
      consoleService.appendOutput(scanId, `[DISCOVERY] Using ${authConfig.method} authentication`);
    }

    await this.runNucleiPhase(scanId, args, 'Discovery');

    // Parse discovery results
    const context = await this.parseDiscoveryResults(target, outputFile);

    // If authentication was provided, mark hasAuth as true
    if (authConfig && authConfig.method !== 'none') {
      context.surface.hasAuth = true;
      logger.info(`[ORCHESTRATOR] ${scanId}: Authentication detected via authConfig, setting hasAuth=true`);
    }
    logger.info(`[ORCHESTRATOR] ${scanId}: Discovery complete. Context: ${JSON.stringify(context.technologies)}`);

    return context;
  }

  /**
   * Parse Discovery Results into Asset Context
   */
  private async parseDiscoveryResults(target: string, outputFile: string): Promise<AssetContext> {
    const context: AssetContext = {
      target,
      reachable: true,
      responseTime: 0,
      technologies: {},
      security: {
        https: target.startsWith('https://'),
        hsts: false,
        waf: false,
        headers: {},
      },
      surface: {
        hasAuth: false,
        hasForms: false,
        hasFileUpload: false,
        hasApi: false,
        endpoints: [],
        parameters: [],
      },
      discoveredAt: new Date().toISOString(),
      fingerprint: '',
    };

    if (!fs.existsSync(outputFile)) {
      return context;
    }

    const content = fs.readFileSync(outputFile, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const result = JSON.parse(line);

        // Extract technology information from template names and tags
        const templateId = result['template-id'] || result.templateID || '';
        const info = result.info || {};
        const tags = info.tags || [];

        // CMS Detection
        if (templateId.includes('wordpress') || tags.includes('wordpress')) {
          context.technologies.cms = 'wordpress';
        } else if (templateId.includes('drupal') || tags.includes('drupal')) {
          context.technologies.cms = 'drupal';
        } else if (templateId.includes('joomla') || tags.includes('joomla')) {
          context.technologies.cms = 'joomla';
        }

        // Language Detection
        if (tags.includes('php') || templateId.includes('php')) {
          context.technologies.language = 'php';
        } else if (tags.includes('asp') || templateId.includes('asp')) {
          context.technologies.language = 'asp';
        } else if (tags.includes('node') || templateId.includes('node')) {
          context.technologies.language = 'node';
        }

        // Web Server Detection
        if (tags.includes('apache') || templateId.includes('apache')) {
          context.technologies.webServer = 'apache';
        } else if (tags.includes('nginx') || templateId.includes('nginx')) {
          context.technologies.webServer = 'nginx';
        } else if (tags.includes('iis') || templateId.includes('iis')) {
          context.technologies.webServer = 'iis';
        }

        // Attack Surface Detection
        if (templateId.includes('login') || templateId.includes('auth') || tags.includes('auth') || tags.includes('login')) {
          context.surface.hasAuth = true;
        }
        if (tags.includes('api') || templateId.includes('api')) {
          context.surface.hasApi = true;
        }

      } catch (e) {
        // Skip invalid JSON lines
      }
    }

    // Generate fingerprint
    context.fingerprint = this.generateFingerprint(context);

    return context;
  }

  /**
   * Execute Targeted Scan Phase
   * Run context-aware vulnerability checks using AI-generated intent
   */
  private async executeTargetedPhase(
    scanId: string,
    target: string,
    context: AssetContext,
    config: PhaseConfig
  ): Promise<number> {
    logger.info(`[ORCHESTRATOR] ${scanId}: Starting AI-powered targeted scan`);

    // Get scan profile and auth config
    const scan = await prisma.scans.findUnique({
      where: { id: scanId },
      select: { scanProfile: true, authConfig: true },
    });
    const profile = scan?.scanProfile || 'BALANCED';
    const authConfig = (scan?.authConfig as unknown) as ScanAuthConfig | null;

    // Generate AI scan intent (semantic tags, scopes, severities)
    const aiIntent = await scanAIPhase2Service.generateScanIntent(context, profile as any);

    logger.info(`[ORCHESTRATOR] ${scanId}: AI Intent - Tags: [${aiIntent.scan_intent.vulnerability_tags.join(', ')}]`);
    logger.info(`[ORCHESTRATOR] ${scanId}: AI Intent - Scopes: [${aiIntent.scan_intent.scan_scopes.join(', ')}]`);
    logger.info(`[ORCHESTRATOR] ${scanId}: AI Intent - Confidence: ${aiIntent.rationale.confidence}`);

    // Log AI rationale to console
    consoleService.appendOutput(scanId, `[AI ANALYSIS] Confidence: ${aiIntent.rationale.confidence}`);
    consoleService.appendOutput(scanId, `[AI ANALYSIS] Key Factors: ${aiIntent.rationale.key_factors.join(', ')}`);

    // Log SQLi Assessment (if available)
    if (aiIntent.sqli_assessment) {
      const sqli = aiIntent.sqli_assessment;
      logger.info(`[ORCHESTRATOR] ${scanId}: SQLi Assessment - Likely: ${sqli.likely}, Confidence: ${sqli.confidence}`);
      consoleService.appendOutput(
        scanId,
        `[SQLI ASSESSMENT] Likely: ${sqli.likely}, Confidence: ${sqli.confidence}, Techniques: [${sqli.recommended_techniques.join(', ')}]`
      );
      if (sqli.reasons.length > 0) {
        consoleService.appendOutput(scanId, `[SQLI ASSESSMENT] Reasons: ${sqli.reasons.join(', ')}`);
      }
    }

    // Log Candidate Parameters (if available)
    if (aiIntent.candidate_parameters && aiIntent.candidate_parameters.length > 0) {
      logger.info(`[ORCHESTRATOR] ${scanId}: Candidate Parameters: [${aiIntent.candidate_parameters.join(', ')}]`);
      consoleService.appendOutput(
        scanId,
        `[PARAMETER DISCOVERY] Found ${aiIntent.candidate_parameters.length} injectable parameter(s): ${aiIntent.candidate_parameters.join(', ')}`
      );
    }

    // Translate AI intent to Nuclei execution plan
    const { folders, tags, severities } = this.translateAIIntentToNucleiArgs(aiIntent, context);

    // CRITICAL: If NO valid tags remain after validation, fallback to safe baseline
    if (folders.length === 0 && tags.length === 0) {
      logger.warn(`[ORCHESTRATOR] ${scanId}: NO VALID TAGS after validation, using fallback`);
      consoleService.appendOutput(scanId, '[VALIDATION] No valid tags after AI validation, using safe baseline');
      return this.executeFallbackScan(scanId, target, config);
    }

    // Validate execution plan
    const validation = this.validateNucleiExecution(folders, tags, severities);
    if (!validation.valid) {
      logger.warn(`[ORCHESTRATOR] ${scanId}: Validation failed - ${validation.error}, using fallback`);
      consoleService.appendOutput(scanId, `[VALIDATION] ${validation.error}, using safe baseline`);
      return this.executeFallbackScan(scanId, target, config);
    }

    logger.info(`[ORCHESTRATOR] ${scanId}: Validated - ${folders.length} folders, ${tags.length} tags`);

    const outputFile = path.join(this.outputDir, `${scanId}-targeted.jsonl`);

    // Get templates base path
    const templatesPath = process.env.NUCLEI_TEMPLATES_PATH || '';

    // Build Nuclei arguments
    const args = [
      '-u', target,
      '-jsonl',
      '-irr',
      '-timeout', config.timeout.toString(),
      '-rate-limit', config.rateLimit.toString(),
      '-c', config.concurrency.toString(),
      '-silent',
      '-o', outputFile,
    ];

    // Add template folders (with absolute paths if configured)
    if (templatesPath) {
      args.push('-templates', templatesPath);
      folders.forEach(folder => {
        args.push('-t', folder);
      });
    } else {
      folders.forEach(folder => {
        args.push('-t', folder);
      });
    }

    // Add tags if any
    if (tags.length > 0) {
      args.push('-tags', tags.join(','));
    }

    // Add severity filter
    args.push('-severity', severities.join(','));

    // Add authentication headers
    args.push(...this.buildAuthArgs(authConfig));

    if (authConfig && authConfig.method !== 'none') {
      logger.info(`[ORCHESTRATOR] ${scanId}: Using ${authConfig.method} authentication for targeted scan`);
      consoleService.appendOutput(scanId, `[TARGETED SCAN] Using ${authConfig.method} authentication`);
    }

    await this.runNucleiPhase(scanId, args, 'Targeted Scan');

    // Count findings
    if (fs.existsSync(outputFile)) {
      const content = fs.readFileSync(outputFile, 'utf-8');
      const findings = content.split('\n').filter(l => l.trim()).length;
      logger.info(`[ORCHESTRATOR] ${scanId}: Targeted scan found ${findings} vulnerabilities`);
      return findings;
    }

    return 0;
  }

  /**
   * Execute Passive Signals Phase (Phase 1.5)
   * Deterministic exposure detection with info/low severity only
   * No AI, no aggressive testing - pure signal collection
   */
  private async executePassiveSignalsPhase(
    scanId: string,
    target: string,
    config: PhaseConfig
  ): Promise<number> {
    logger.info(`[ORCHESTRATOR] ${scanId}: Starting passive signals phase`);

    const outputFile = path.join(this.outputDir, `${scanId}-passive.jsonl`);
    const templatesPath = process.env.NUCLEI_TEMPLATES_PATH || '';

    const args = [
      '-u', target,
      '-jsonl',
      '-timeout', '5',
      '-rate-limit', '150',
      '-c', '25',
      '-severity', 'info,low', // Only info and low severity
      '-no-interactsh',
      '-silent',
      '-o', outputFile,
    ];

    // Add template folders for passive detection
    if (templatesPath) {
      args.push('-templates', templatesPath);
      args.push('-t', 'http/exposures/');
      args.push('-t', 'http/exposed-panels/');
    } else {
      args.push('-t', 'http/exposures/');
      args.push('-t', 'http/exposed-panels/');
    }

    await this.runNucleiPhase(scanId, args, 'Passive Signals');

    // Count findings
    if (fs.existsSync(outputFile)) {
      const content = fs.readFileSync(outputFile, 'utf-8');
      const findings = content.split('\n').filter(l => l.trim()).length;
      logger.info(`[ORCHESTRATOR] ${scanId}: Passive signals found ${findings} exposures`);
      return findings;
    }

    return 0;
  }

  /**
   * Execute Baseline Hygiene Phase (Phase 2.5)
   * Deterministic security hygiene checks
   * No AI - comprehensive baseline coverage
   */
  private async executeBaselineHygienePhase(
    scanId: string,
    target: string,
    config: PhaseConfig
  ): Promise<number> {
    logger.info(`[ORCHESTRATOR] ${scanId}: Starting baseline hygiene phase`);

    const outputFile = path.join(this.outputDir, `${scanId}-baseline.jsonl`);
    const templatesPath = process.env.NUCLEI_TEMPLATES_PATH || '';

    const args = [
      '-u', target,
      '-jsonl',
      '-timeout', '10',
      '-rate-limit', '150',
      '-c', '30',
      '-severity', 'info,low,medium,high,critical',
      '-no-interactsh',
      '-silent',
      '-o', outputFile,
    ];

    // Add baseline security folders
    if (templatesPath) {
      args.push('-templates', templatesPath);
      args.push('-t', 'http/misconfiguration/');
      args.push('-t', 'http/exposures/');
      args.push('-t', 'http/default-logins/');
      args.push('-t', 'ssl/');
      args.push('-t', 'dns/');
    } else {
      args.push('-t', 'http/misconfiguration/');
      args.push('-t', 'http/exposures/');
      args.push('-t', 'http/default-logins/');
      args.push('-t', 'ssl/');
      args.push('-t', 'dns/');
    }

    await this.runNucleiPhase(scanId, args, 'Baseline Hygiene');

    // Count findings
    if (fs.existsSync(outputFile)) {
      const content = fs.readFileSync(outputFile, 'utf-8');
      const findings = content.split('\n').filter(l => l.trim()).length;
      logger.info(`[ORCHESTRATOR] ${scanId}: Baseline hygiene found ${findings} issues`);
      return findings;
    }

    return 0;
  }

  /**
   * Execute Correlation Phase (Phase 4)
   * Deduplication, grouping, and risk scoring
   * Mandatory for all scan profiles
   */
  private async executeCorrelationPhase(
    scanId: string,
    tenantId: string
  ): Promise<void> {
    logger.info(`[ORCHESTRATOR] ${scanId}: Starting correlation phase`);
    consoleService.appendOutput(scanId, '[CORRELATION] Deduplicating and scoring findings...');

    try {
      // Fetch all vulnerabilities for this scan
      const vulnerabilities = await prisma.vulnerabilities.findMany({
        where: { scanId },
        orderBy: { severity: 'desc' },
      });

      if (vulnerabilities.length === 0) {
        logger.info(`[ORCHESTRATOR] ${scanId}: No vulnerabilities to correlate`);
        return;
      }

      // Group by fingerprint for deduplication
      const fingerprintMap = new Map<string, string[]>();
      for (const vuln of vulnerabilities) {
        const fingerprint = this.generateVulnerabilityFingerprint(vuln);
        if (!fingerprintMap.has(fingerprint)) {
          fingerprintMap.set(fingerprint, []);
        }
        fingerprintMap.get(fingerprint)!.push(vuln.id);
      }

      logger.info(`[ORCHESTRATOR] ${scanId}: Found ${vulnerabilities.length} findings, ${fingerprintMap.size} unique`);
      consoleService.appendOutput(
        scanId,
        `[CORRELATION] ${vulnerabilities.length} findings → ${fingerprintMap.size} unique vulnerabilities`
      );

      // Mark duplicates (keep first occurrence, mark others)
      let duplicateCount = 0;
      for (const [fingerprint, ids] of fingerprintMap.entries()) {
        if (ids.length > 1) {
          // Keep first, mark rest as duplicates
          const [primary, ...duplicates] = ids;
          duplicateCount += duplicates.length;

          // Update duplicate records to reference primary
          await prisma.vulnerabilities.updateMany({
            where: { id: { in: duplicates } },
            data: {
              description: `[DUPLICATE] See primary finding`,
              // In a real implementation, you'd add a correlationGroupId field
            },
          });
        }
      }

      if (duplicateCount > 0) {
        logger.info(`[ORCHESTRATOR] ${scanId}: Marked ${duplicateCount} duplicate findings`);
        consoleService.appendOutput(scanId, `[CORRELATION] Deduplicated ${duplicateCount} findings`);
      }

      // Calculate risk scores
      consoleService.appendOutput(scanId, '[CORRELATION] Calculating risk scores...');
      // Risk scoring is handled by AI analysis service for each vulnerability

      logger.info(`[ORCHESTRATOR] ${scanId}: Correlation phase completed`);
    } catch (error: any) {
      logger.error(`[ORCHESTRATOR] ${scanId}: Correlation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate vulnerability fingerprint for deduplication
   */
  private generateVulnerabilityFingerprint(vuln: any): string {
    // Create fingerprint from key identifying fields
    const parts = [
      vuln.templateId || '',
      vuln.title || '',
      vuln.severity || '',
      vuln.targetUrl || '',
    ];
    return parts.join('::').toLowerCase();
  }

  /**
   * Translate AI Intent to Nuclei Command Arguments
   * Maps semantic intent (tags, scopes) to folders and tags
   * CRITICAL: Validates and sanitizes all AI-generated tags against HARD ALLOWLIST
   */
  private translateAIIntentToNucleiArgs(intent: AIScanIntent, context: AssetContext): {
    folders: string[];
    tags: string[];
    severities: string[];
  } {
    const folders: string[] = [];
    const rawTags = [...intent.scan_intent.vulnerability_tags];
    const severities = intent.scan_intent.severity_levels;

    // VALIDATION LAYER: Sanitize and validate tags
    const validatedTags = this.validateAndSanitizeTags(rawTags);

    logger.info(`[ORCHESTRATOR] Tag validation: ${rawTags.length} raw → ${validatedTags.length} valid`);
    if (rawTags.length !== validatedTags.length) {
      const rejected = rawTags.filter(t => !validatedTags.includes(t));
      logger.warn(`[ORCHESTRATOR] REJECTED INVALID TAGS: [${rejected.join(', ')}]`);
    }

    // Map scopes to Nuclei folders
    for (const scope of intent.scan_intent.scan_scopes) {
      const folder = SCOPE_FOLDER_MAP[scope];
      if (folder) {
        folders.push(folder);
      } else {
        logger.warn(`[ORCHESTRATOR] Unknown scope: ${scope}, skipping`);
      }
    }

    // SQLi-Specific Enhancements (SAFE: only enables existing templates)
    if (intent.sqli_assessment?.likely) {
      logger.info('[ORCHESTRATOR] SQLi assessment positive, prioritizing SQLi templates');

      // Ensure sqli tag is present (guaranteed valid)
      if (!validatedTags.includes('sqli')) {
        validatedTags.unshift('sqli');
      }

      // Ensure vulnerabilities folder is included
      if (!folders.includes('http/vulnerabilities/')) {
        folders.unshift('http/vulnerabilities/');
      }

      // For high confidence, also include CVEs folder
      if (intent.sqli_assessment.confidence === 'high' && !folders.includes('http/cves/')) {
        folders.push('http/cves/');
      }
    }

    // Ensure at least one folder
    if (folders.length === 0) {
      logger.warn('[ORCHESTRATOR] No folders mapped from scopes, adding default');
      folders.push('http/vulnerabilities/', 'http/misconfiguration/');
    }

    return { folders, tags: validatedTags, severities };
  }

  /**
   * Validate and Sanitize AI-Generated Tags
   * CRITICAL SECURITY FUNCTION: Prevents invalid Nuclei flags
   *
   * Rules:
   * 1. Reject tags containing: '/', '-', '*', '.yaml', '.yml'
   * 2. Reject CVE IDs (CVE-YYYY-NNNNN pattern)
   * 3. Reject template filenames or paths
   * 4. Only allow tags from VALID_NUCLEI_TAGS allowlist
   * 5. Translate semantic classes via SEMANTIC_TAG_MAP
   */
  private validateAndSanitizeTags(rawTags: string[]): string[] {
    const validTags = new Set<string>();

    for (const rawTag of rawTags) {
      const normalized = rawTag.toLowerCase().trim();

      // REJECT: Empty or whitespace
      if (!normalized) continue;

      // REJECT: Contains path separators
      if (normalized.includes('/')) {
        logger.warn(`[TAG-VALIDATOR] REJECTED path-like tag: ${rawTag}`);
        continue;
      }

      // REJECT: Contains wildcards
      if (normalized.includes('*')) {
        logger.warn(`[TAG-VALIDATOR] REJECTED wildcard tag: ${rawTag}`);
        continue;
      }

      // REJECT: Contains file extensions
      if (normalized.includes('.yaml') || normalized.includes('.yml')) {
        logger.warn(`[TAG-VALIDATOR] REJECTED filename tag: ${rawTag}`);
        continue;
      }

      // REJECT: CVE IDs (CVE-YYYY-NNNNN pattern)
      if (/^cve-\d{4}-\d{4,7}$/i.test(normalized)) {
        logger.warn(`[TAG-VALIDATOR] REJECTED CVE ID: ${rawTag}`);
        continue;
      }

      // STEP 1: Check if tag is directly in allowlist
      if (this.VALID_NUCLEI_TAGS.has(normalized)) {
        validTags.add(normalized);
        continue;
      }

      // STEP 2: Check if tag is a semantic class that can be translated
      const translatedTags = this.SEMANTIC_TAG_MAP[normalized];
      if (translatedTags) {
        translatedTags.forEach(t => validTags.add(t));
        logger.info(`[TAG-VALIDATOR] Translated semantic class "${normalized}" → [${translatedTags.join(', ')}]`);
        continue;
      }

      // REJECT: Not in allowlist and not translatable
      logger.warn(`[TAG-VALIDATOR] REJECTED unknown tag: ${rawTag}`);
    }

    return Array.from(validTags);
  }

  /**
   * Validate Nuclei Execution Plan
   * Ensures at least one template will match
   */
  private validateNucleiExecution(
    folders: string[],
    tags: string[],
    severities: string[]
  ): { valid: boolean; error?: string } {
    // Must have at least one folder or tag
    if (folders.length === 0 && tags.length === 0) {
      return { valid: false, error: 'No folders or tags specified' };
    }

    // Must have at least one severity
    if (severities.length === 0) {
      return { valid: false, error: 'No severity levels specified' };
    }

    // Basic validation passed
    return { valid: true };
  }

  /**
   * Execute Fallback Scan
   * Safe baseline when AI or validation fails
   */
  private async executeFallbackScan(
    scanId: string,
    target: string,
    config: PhaseConfig
  ): Promise<number> {
    logger.info(`[ORCHESTRATOR] ${scanId}: Executing fallback scan`);
    consoleService.appendOutput(scanId, '[FALLBACK] Using baseline security checks');

    const outputFile = path.join(this.outputDir, `${scanId}-targeted.jsonl`);
    const templatesPath = process.env.NUCLEI_TEMPLATES_PATH || '';

    const args = [
      '-u', target,
      '-jsonl',
      '-irr',
      '-timeout', config.timeout.toString(),
      '-rate-limit', config.rateLimit.toString(),
      '-c', config.concurrency.toString(),
      '-severity', 'medium,high,critical',
      '-no-interactsh',
      '-silent',
      '-o', outputFile,
    ];

    // Add baseline folders
    if (templatesPath) {
      args.push('-templates', templatesPath);
      args.push('-t', 'http/vulnerabilities/');
      args.push('-t', 'http/misconfiguration/');
    } else {
      args.push('-t', 'http/vulnerabilities/');
      args.push('-t', 'http/misconfiguration/');
    }

    await this.runNucleiPhase(scanId, args, 'Fallback Scan');

    // Count findings
    if (fs.existsSync(outputFile)) {
      const content = fs.readFileSync(outputFile, 'utf-8');
      const findings = content.split('\n').filter(l => l.trim()).length;
      return findings;
    }

    return 0;
  }

  /**
   * Select Templates Based on Asset Context (LEGACY - Kept as reference)
   * Replaced by AI-based selection in executeTargetedPhase
   */
  private selectTemplates(context: AssetContext): string[] {
    const templates = new Set<string>();

    // Apply rules in priority order
    const sortedRules = [...this.templateRules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (rule.condition(context)) {
        logger.info(`[ORCHESTRATOR] Template rule matched: ${rule.name}`);
        rule.templates.forEach(t => templates.add(t));
      }
    }

    return Array.from(templates);
  }

  /**
   * Build Authentication Arguments for Nuclei
   * Adds appropriate -H flags for authentication headers
   */
  private buildAuthArgs(authConfig: ScanAuthConfig | null): string[] {
    const args: string[] = [];

    if (!authConfig || authConfig.method === 'none') {
      return args;
    }

    switch (authConfig.method) {
      case 'basic':
        if (authConfig.username && authConfig.password) {
          const encoded = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64');
          args.push('-H', `Authorization: Basic ${encoded}`);
        }
        break;

      case 'bearer':
        if (authConfig.bearerToken) {
          args.push('-H', `Authorization: Bearer ${authConfig.bearerToken}`);
        }
        break;

      case 'cookie':
        if (authConfig.cookies) {
          const cookieString = Object.entries(authConfig.cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
          args.push('-H', `Cookie: ${cookieString}`);
        }
        break;

      case 'header':
        if (authConfig.headers) {
          Object.entries(authConfig.headers).forEach(([key, value]) => {
            args.push('-H', `${key}: ${value}`);
          });
        }
        break;

      case 'form':
        // Form-based auth requires pre-authentication (future enhancement)
        logger.warn('[ORCHESTRATOR] Form-based auth not yet implemented in scan execution');
        break;
    }

    return args;
  }

  /**
   * Run Nuclei Phase
   */
  private async runNucleiPhase(
    scanId: string,
    args: string[],
    phaseName: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      consoleService.appendOutput(scanId, `[${phaseName}] nuclei ${args.join(' ')}`);

      const nucleiProcess = spawn('nuclei', args, {
        detached: process.platform !== 'win32',
        env: { ...process.env, TERM: 'dumb' },
      });
      this.registerProcess(scanId, nucleiProcess);
      const phaseTimeoutMs = 10 * 60 * 1000; // 10 minutes hard timeout per phase
      let settled = false;

      const timeoutHandle = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          this.killProcessTree(nucleiProcess, 'SIGTERM');
        } catch {
          // ignore kill errors
        }
        consoleService.appendOutput(scanId, `[${phaseName}] Timed out after ${phaseTimeoutMs / 1000}s`);
        reject(new Error(`Nuclei phase ${phaseName} timed out`));
      }, phaseTimeoutMs);

      nucleiProcess.stdout.on('data', (data) => {
        const output = data.toString();
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            consoleService.appendOutput(scanId, line.trim());
          }
        }
      });

      nucleiProcess.stderr.on('data', (data) => {
        const output = data.toString();
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            consoleService.appendOutput(scanId, line.trim());
          }
        }
      });

      nucleiProcess.on('close', (code) => {
        this.unregisterProcess(scanId, nucleiProcess);
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Nuclei phase ${phaseName} failed with code ${code}`));
        }
      });

      nucleiProcess.on('error', (error) => {
        this.unregisterProcess(scanId, nucleiProcess);
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }

  registerProcess(scanId: string, processRef: ChildProcess): void {
    if (!this.activeProcesses.has(scanId)) {
      this.activeProcesses.set(scanId, new Set());
    }
    this.activeProcesses.get(scanId)!.add(processRef);
  }

  unregisterProcess(scanId: string, processRef: ChildProcess): void {
    const processes = this.activeProcesses.get(scanId);
    if (!processes) return;
    processes.delete(processRef);
    if (processes.size === 0) {
      this.activeProcesses.delete(scanId);
    }
  }

  killScanProcesses(scanId: string): number {
    const processes = this.activeProcesses.get(scanId);
    if (!processes || processes.size === 0) {
      return 0;
    }

    let killedCount = 0;
    for (const proc of processes) {
      this.killProcessTree(proc, 'SIGTERM');
      killedCount++;
    }
    this.activeProcesses.delete(scanId);
    return killedCount;
  }

  private killProcessTree(proc: ChildProcess, signal: NodeJS.Signals): void {
    if (!proc?.pid) return;
    try {
      if (process.platform !== 'win32') {
        process.kill(-proc.pid, signal);
      }
    } catch {
      // Fall back to direct process kill
    }
    try {
      proc.kill(signal);
    } catch {
      // ignore kill errors
    }
  }

  /**
   * Generate Asset Fingerprint
   */
  private generateFingerprint(context: AssetContext): string {
    const components = [
      context.technologies.cms || '',
      context.technologies.language || '',
      context.technologies.webServer || '',
      context.security.https ? 'https' : 'http',
      context.surface.hasAuth ? 'auth' : '',
      context.surface.hasApi ? 'api' : '',
    ];

    return components.filter(c => c).join('-');
  }

  /**
   * Get Orchestration State
   */
  getState(scanId: string): ScanOrchestrationState | undefined {
    return this.orchestrationStates.get(scanId);
  }

  /**
   * Update Phase Progress
   */
  updatePhaseProgress(scanId: string, phase: ScanPhase, progress: number, findings: number): void {
    const state = this.orchestrationStates.get(scanId);
    if (state) {
      const phaseExec = state.phases.find(p => p.phase === phase);
      if (phaseExec) {
        phaseExec.progress = progress;
        phaseExec.findings = findings;
      }

      // Calculate overall progress (weighted by phase duration)
      const completedWeight = state.phases
        .filter(p => p.status === 'COMPLETED')
        .reduce((sum, p) => sum + 1, 0);

      state.overallProgress = Math.floor((completedWeight / state.phases.length) * 100);
      state.findings = state.phases.reduce((sum, p) => sum + p.findings, 0);
    }
  }
}

export const scanOrchestratorService = new ScanOrchestratorService();
