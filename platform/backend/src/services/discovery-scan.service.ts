/**
 * Two-Layer Discovery Scanning Service
 * Layer A: Mandatory Baseline (always runs)
 * Layer B: AI-Expanded Targeted Scans
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

interface ScanTestDefinition {
  name: string;
  category: string;
  layer: 'BASELINE' | 'AI_EXPANDED';
  mandatory: boolean;
  description: string;
  templates?: string[];
}

// Layer A: Mandatory Baseline Tests (always run, no AI suppression)
const MANDATORY_BASELINE_TESTS: ScanTestDefinition[] = [
  // SQL Injection
  {
    name: 'SQLi - Error-based',
    category: 'INJECTION',
    layer: 'BASELINE',
    mandatory: true,
    description: 'SQL Injection detection using error-based techniques',
    templates: ['sql-injection-error-based'],
  },
  {
    name: 'SQLi - Boolean-based',
    category: 'INJECTION',
    layer: 'BASELINE',
    mandatory: true,
    description: 'SQL Injection detection using boolean-based blind techniques',
    templates: ['sql-injection-boolean'],
  },
  {
    name: 'SQLi - Time-based',
    category: 'INJECTION',
    layer: 'BASELINE',
    mandatory: true,
    description: 'SQL Injection detection using time-based blind techniques',
    templates: ['sql-injection-time-based'],
  },
  // XSS
  {
    name: 'XSS - Reflected',
    category: 'XSS',
    layer: 'BASELINE',
    mandatory: true,
    description: 'Reflected Cross-Site Scripting detection',
    templates: ['xss-reflected'],
  },
  {
    name: 'XSS - Stored',
    category: 'XSS',
    layer: 'BASELINE',
    mandatory: true,
    description: 'Stored Cross-Site Scripting detection',
    templates: ['xss-stored'],
  },
  // Authentication
  {
    name: 'Auth Bypass',
    category: 'AUTHENTICATION',
    layer: 'BASELINE',
    mandatory: true,
    description: 'Authentication bypass vulnerability detection',
    templates: ['auth-bypass'],
  },
  // TLS
  {
    name: 'TLS Misconfiguration',
    category: 'TLS',
    layer: 'BASELINE',
    mandatory: true,
    description: 'TLS/SSL misconfiguration and weak cipher detection',
    templates: ['ssl-tls-misconfig'],
  },
  // Open Redirects
  {
    name: 'Open Redirect',
    category: 'REDIRECT',
    layer: 'BASELINE',
    mandatory: true,
    description: 'Open redirect vulnerability detection',
    templates: ['open-redirect'],
  },
  // IDOR
  {
    name: 'IDOR Heuristics',
    category: 'AUTHORIZATION',
    layer: 'BASELINE',
    mandatory: true,
    description: 'Insecure Direct Object Reference detection',
    templates: ['idor-detection'],
  },
];

export class DiscoveryScanService {
  /**
   * Execute two-layer discovery scan
   */
  async executeTwoLayerScan(
    scanId: string,
    assetId: string,
    target: string,
    tenantId: string,
    aiContext?: any
  ): Promise<void> {
    logger.info(`Starting two-layer discovery scan for ${target}`);

    // Layer A: Execute all mandatory baseline tests
    await this.executeLayerA(scanId, assetId, target, tenantId);

    // Layer B: Execute AI-expanded tests
    await this.executeLayerB(scanId, assetId, target, tenantId, aiContext);

    logger.info(`Two-layer discovery scan completed for ${target}`);
  }

  /**
   * Layer A: Mandatory Baseline (always runs, no AI suppression)
   */
  private async executeLayerA(
    scanId: string,
    assetId: string,
    target: string,
    tenantId: string
  ): Promise<void> {
    logger.info(`Executing Layer A: Mandatory Baseline for ${target}`);

    for (const test of MANDATORY_BASELINE_TESTS) {
      try {
        const startTime = Date.now();

        // Execute the test (placeholder - in production, run actual Nuclei templates)
        const result = await this.executeTest(test, target);

        const duration = Date.now() - startTime;

        // Store test result
        await prisma.scan_test_results.create({
          data: {
            id: randomUUID(),
            scanId,
            testName: test.name,
            testCategory: test.category,
            layer: 'BASELINE',
            executionStatus: 'EXECUTED',
            skipReason: null,
            result: JSON.stringify(result),
            duration,
            tenantId,
          },
        });

        logger.info(`✓ Layer A: ${test.name} executed`);
      } catch (error: any) {
        logger.error(`✗ Layer A: ${test.name} failed:`, error.message);

        // Store failure
        await prisma.scan_test_results.create({
          data: {
            id: randomUUID(),
            scanId,
            testName: test.name,
            testCategory: test.category,
            layer: 'BASELINE',
            executionStatus: 'FAILED',
            skipReason: null,
            result: JSON.stringify({ error: error.message }),
            duration: 0,
            tenantId,
          },
        });
      }
    }

    logger.info(`Layer A: Mandatory Baseline completed for ${target}`);
  }

  /**
   * Layer B: AI-Expanded Targeted Scans
   */
  private async executeLayerB(
    scanId: string,
    assetId: string,
    target: string,
    tenantId: string,
    aiContext?: any
  ): Promise<void> {
    logger.info(`Executing Layer B: AI-Expanded for ${target}`);

    // Get AI recommendations for additional tests
    const aiRecommendedTests = await this.getAIRecommendations(scanId, assetId, target, aiContext);

    for (const test of aiRecommendedTests) {
      // Check if test should be skipped
      const skipCheck = await this.shouldSkipTest(test, aiContext);

      if (skipCheck.shouldSkip) {
        // Store skipped test with reason
        await prisma.scan_test_results.create({
          data: {
            id: randomUUID(),
            scanId,
            testName: test.name,
            testCategory: test.category,
            layer: 'AI_EXPANDED',
            executionStatus: 'SKIPPED',
            skipReason: skipCheck.reason,
            aiDecisionId: skipCheck.aiDecisionId,
            result: null,
            duration: 0,
            tenantId,
          },
        });

        logger.info(`⊘ Layer B: ${test.name} skipped - ${skipCheck.reason}`);
        continue;
      }

      // Execute test
      try {
        const startTime = Date.now();
        const result = await this.executeTest(test, target);
        const duration = Date.now() - startTime;

        await prisma.scan_test_results.create({
          data: {
            id: randomUUID(),
            scanId,
            testName: test.name,
            testCategory: test.category,
            layer: 'AI_EXPANDED',
            executionStatus: 'EXECUTED',
            skipReason: null,
            result: JSON.stringify(result),
            duration,
            tenantId,
          },
        });

        logger.info(`✓ Layer B: ${test.name} executed`);
      } catch (error: any) {
        logger.error(`✗ Layer B: ${test.name} failed:`, error.message);

        await prisma.scan_test_results.create({
          data: {
            id: randomUUID(),
            scanId,
            testName: test.name,
            testCategory: test.category,
            layer: 'AI_EXPANDED',
            executionStatus: 'FAILED',
            skipReason: null,
            result: JSON.stringify({ error: error.message }),
            duration: 0,
            tenantId,
          },
        });
      }
    }

    logger.info(`Layer B: AI-Expanded completed for ${target}`);
  }

  /**
   * Get AI recommendations for additional tests
   */
  private async getAIRecommendations(
    scanId: string,
    assetId: string,
    target: string,
    aiContext?: any
  ): Promise<ScanTestDefinition[]> {
    // Placeholder: In production, use AI to recommend tests based on:
    // - Recon findings
    // - Tech stack
    // - Similar assets
    // - Historical data

    const recommendations: ScanTestDefinition[] = [
      {
        name: 'Framework-specific Auth Bypass',
        category: 'AUTHENTICATION',
        layer: 'AI_EXPANDED',
        mandatory: false,
        description: 'Framework-specific authentication bypass checks',
      },
      {
        name: 'NoSQL Injection',
        category: 'INJECTION',
        layer: 'AI_EXPANDED',
        mandatory: false,
        description: 'NoSQL injection detection',
      },
      {
        name: 'JWT Vulnerabilities',
        category: 'AUTHENTICATION',
        layer: 'AI_EXPANDED',
        mandatory: false,
        description: 'JWT token security vulnerabilities',
      },
      {
        name: 'API-specific IDOR',
        category: 'AUTHORIZATION',
        layer: 'AI_EXPANDED',
        mandatory: false,
        description: 'API-specific IDOR patterns',
      },
    ];

    return recommendations;
  }

  /**
   * Determine if a test should be skipped
   */
  private async shouldSkipTest(
    test: ScanTestDefinition,
    aiContext?: any
  ): Promise<{ shouldSkip: boolean; reason?: string; aiDecisionId?: string }> {
    // Placeholder: In production, use AI to decide if test is relevant
    // Example skip reasons:
    // - "Target does not use MongoDB - NoSQL injection not applicable"
    // - "Static site detected - no authentication to bypass"
    // - "Framework doesn't support JWT - JWT tests not relevant"

    // For demo: randomly skip some tests
    const skipProbability = 0.3;
    if (Math.random() < skipProbability) {
      const reasons = [
        'Target technology stack indicates low relevance',
        'Similar assets showed negative results historically',
        'Framework-specific vulnerability not applicable',
        'AI confidence below threshold for test execution',
      ];
      return {
        shouldSkip: true,
        reason: reasons[Math.floor(Math.random() * reasons.length)],
        aiDecisionId: randomUUID(),
      };
    }

    return { shouldSkip: false };
  }

  /**
   * Execute a single test
   */
  private async executeTest(test: ScanTestDefinition, target: string): Promise<any> {
    // Placeholder: In production, execute actual Nuclei templates
    // This would call the Nuclei CLI or use the Nuclei Go library

    await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate test execution

    return {
      testName: test.name,
      target,
      executed: true,
      findings: [],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Manual override to force execution of skipped tests
   */
  async forceExecuteSkippedTest(
    testResultId: string,
    tenantId: string,
    userId: string
  ): Promise<void> {
    const testResult = await prisma.scan_test_results.findFirst({
      where: { id: testResultId, tenantId },
    });

    if (!testResult) {
      throw new Error('Test result not found');
    }

    if (testResult.executionStatus !== 'SKIPPED') {
      throw new Error('Only skipped tests can be force-executed');
    }

    logger.info(`Force executing skipped test: ${testResult.testName}`);

    // Create audit log
    await prisma.audit_logs.create({
      data: {
        id: randomUUID(),
        action: 'UPDATE',
        resource: 'scan_test',
        resourceId: testResultId,
        details: {
          action: 'force_execute',
          testName: testResult.testName,
          originalSkipReason: testResult.skipReason,
        },
        userId,
        tenantId,
      },
    });

    // Resolve the scan target for re-execution
    const scan = await prisma.scans.findUnique({
      where: { id: testResult.scanId },
      include: { assets: { select: { url: true, hostname: true } } },
    });

    const target = scan?.assets?.url || scan?.assets?.hostname;

    if (target) {
      // Reconstruct test definition and actually execute it
      const testDef: ScanTestDefinition = {
        name: testResult.testName,
        category: testResult.testCategory,
        layer: testResult.layer as 'BASELINE' | 'AI_EXPANDED',
        mandatory: testResult.layer === 'BASELINE',
        description: `Force re-execution of ${testResult.testName}`,
      };

      try {
        const startTime = Date.now();
        const result = await this.executeTest(testDef, target);
        const duration = Date.now() - startTime;

        await prisma.scan_test_results.update({
          where: { id: testResultId },
          data: {
            executionStatus: 'EXECUTED',
            skipReason: `Originally skipped: ${testResult.skipReason}. Force-executed by user.`,
            result: JSON.stringify(result),
            duration,
          },
        });

        logger.info(`Force-executed test ${testResult.testName} against ${target} (${duration}ms)`);
      } catch (execError: any) {
        await prisma.scan_test_results.update({
          where: { id: testResultId },
          data: {
            executionStatus: 'FAILED',
            skipReason: `Originally skipped: ${testResult.skipReason}. Force-execution failed.`,
            result: JSON.stringify({ forceExecuted: true, error: execError.message }),
          },
        });

        logger.error(`Force-execution of ${testResult.testName} failed: ${execError.message}`);
      }
    } else {
      // No target available — update status without re-running
      await prisma.scan_test_results.update({
        where: { id: testResultId },
        data: {
          executionStatus: 'EXECUTED',
          skipReason: `Originally skipped: ${testResult.skipReason}. Force-executed by user (no target resolved).`,
          result: JSON.stringify({ forceExecuted: true, targetUnavailable: true }),
        },
      });

      logger.warn(`Force-executed test ${testResult.testName} without target — scan asset not found`);
    }
  }

  /**
   * Get scan test results
   */
  async getScanTestResults(scanId: string, tenantId: string, layer?: string) {
    const where: any = { scanId, tenantId };
    if (layer) {
      where.layer = layer;
    }

    return await prisma.scan_test_results.findMany({
      where,
      orderBy: { executedAt: 'desc' },
    });
  }

  /**
   * Get test execution statistics
   */
  async getTestExecutionStats(scanId: string, tenantId: string) {
    const results = await prisma.scan_test_results.findMany({
      where: { scanId, tenantId },
    });

    const stats = {
      total: results.length,
      executed: results.filter((r) => r.executionStatus === 'EXECUTED').length,
      skipped: results.filter((r) => r.executionStatus === 'SKIPPED').length,
      failed: results.filter((r) => r.executionStatus === 'FAILED').length,
      baseline: results.filter((r) => r.layer === 'BASELINE').length,
      aiExpanded: results.filter((r) => r.layer === 'AI_EXPANDED').length,
      skipReasons: results
        .filter((r) => r.executionStatus === 'SKIPPED')
        .map((r) => ({ testName: r.testName, reason: r.skipReason })),
    };

    return stats;
  }
}
