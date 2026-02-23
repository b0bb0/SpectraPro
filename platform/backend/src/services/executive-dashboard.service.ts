/**
 * Executive Dashboard Service
 * Rapid7 InsightVM-style executive metrics and risk scoring
 */

import { prisma } from '../utils/prisma';
import { ExecutiveMetrics, RiskScore } from '../types/scan-orchestration.types';
import { logger } from '../utils/logger';

class ExecutiveDashboardService {
  /**
   * Calculate Overall Risk Score
   * Weighted formula considering CVSS, exploitability, asset criticality, exposure
   */
  private calculateRiskScore(
    cvss: number,
    exploitability: number,
    assetCriticality: number,
    exposure: number,
    recurrence: number
  ): RiskScore {
    // Normalized components (0-100)
    const components = {
      cvss: (cvss / 10) * 100, // CVSS is 0-10, normalize to 0-100
      exploitability,
      assetCriticality,
      exposure,
      recurrence,
    };

    // Weighted calculation (Rapid7-style)
    const overall = (
      components.cvss * 0.30 +           // 30% weight to CVSS
      components.exploitability * 0.25 + // 25% weight to exploitability
      components.assetCriticality * 0.20 + // 20% weight to asset criticality
      components.exposure * 0.15 +       // 15% weight to exposure
      components.recurrence * 0.10       // 10% weight to recurrence
    );

    return {
      overall: Math.round(overall),
      components,
      trend: 'STABLE', // Will be calculated from historical data
      calculation: `(CVSS×0.30) + (Exploit×0.25) + (Asset×0.20) + (Exposure×0.15) + (Recur×0.10)`,
    };
  }

  /**
   * Calculate Asset Risk Score
   */
  async calculateAssetRiskScore(assetId: string): Promise<number> {
    const vulnerabilities = await prisma.vulnerabilities.findMany({
      where: {
        assetId,
        status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
      },
      select: {
        severity: true,
        cvssScore: true,
        templateId: true,
      },
    });

    if (vulnerabilities.length === 0) {
      return 0;
    }

    // Calculate average CVSS
    const avgCvss = vulnerabilities
      .filter(v => v.cvssScore)
      .reduce((sum, v) => sum + (v.cvssScore || 0), 0) / vulnerabilities.length || 5.0;

    // Severity weights
    const severityScores: number[] = vulnerabilities.map(v => {
      switch (v.severity) {
        case 'CRITICAL': return 10;
        case 'HIGH': return 7.5;
        case 'MEDIUM': return 5;
        case 'LOW': return 2.5;
        case 'INFO': return 0;
        default: return 0;
      }
    });

    const avgSeverityScore = severityScores.reduce((a, b) => a + b, 0) / severityScores.length;

    // Exploitability (simple heuristic based on template type)
    const exploitability = vulnerabilities.some(v =>
      v.templateId?.includes('rce') ||
      v.templateId?.includes('sqli') ||
      v.templateId?.includes('auth-bypass')
    ) ? 85 : 50;

    // Asset criticality (from asset model)
    const asset = await prisma.assets.findUnique({
      where: { id: assetId },
      select: { criticality: true, environment: true },
    });

    const assetCriticalityScore = this.mapCriticalityToScore(asset?.criticality || 'MEDIUM');

    // Exposure (production assets have higher exposure)
    const exposureScore = asset?.environment === 'PRODUCTION' ? 90 : 50;

    // Recurrence (check if vulnerabilities persist)
    const recurrenceScore = 50; // Default, would need historical data

    const riskScore = this.calculateRiskScore(
      avgCvss,
      exploitability,
      assetCriticalityScore,
      exposureScore,
      recurrenceScore
    );

    // Update asset risk score
    await prisma.assets.update({
      where: { id: assetId },
      data: { riskScore: riskScore.overall },
    });

    return riskScore.overall;
  }

  /**
   * Map Asset Criticality to Score
   */
  private mapCriticalityToScore(criticality: string): number {
    switch (criticality) {
      case 'CRITICAL': return 100;
      case 'HIGH': return 75;
      case 'MEDIUM': return 50;
      case 'LOW': return 25;
      default: return 50;
    }
  }

  /**
   * Get Executive Dashboard Metrics
   */
  async getExecutiveMetrics(tenantId: string): Promise<ExecutiveMetrics> {
    logger.info(`[EXECUTIVE] Calculating metrics for tenant: ${tenantId}`);

    // Get all vulnerabilities
    const vulnerabilities = await prisma.vulnerabilities.findMany({
      where: {
        tenantId,
        status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
      },
      select: {
        id: true,
        title: true,
        severity: true,
        cvssScore: true,
        assetId: true,
        firstSeen: true,
        lastSeen: true,
        templateId: true,
      },
    });

    // Vulnerability distribution
    const vulnerabilityDistribution = {
      critical: vulnerabilities.filter(v => v.severity === 'CRITICAL').length,
      high: vulnerabilities.filter(v => v.severity === 'HIGH').length,
      medium: vulnerabilities.filter(v => v.severity === 'MEDIUM').length,
      low: vulnerabilities.filter(v => v.severity === 'LOW').length,
      info: vulnerabilities.filter(v => v.severity === 'INFO').length,
    };

    // Overall risk score (tenant-wide)
    const avgCvss = vulnerabilities
      .filter(v => v.cvssScore)
      .reduce((sum, v) => sum + (v.cvssScore || 0), 0) / vulnerabilities.length || 0;

    const overallRiskScore = this.calculateRiskScore(
      avgCvss,
      60, // Default exploitability
      50, // Default asset criticality
      70, // Default exposure
      50  // Default recurrence
    );

    // Calculate trend (last 7 days vs previous 7 days)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const recentVulns = vulnerabilities.filter(v =>
      v.firstSeen >= sevenDaysAgo
    ).length;

    const previousVulns = vulnerabilities.filter(v =>
      v.firstSeen >= fourteenDaysAgo && v.firstSeen < sevenDaysAgo
    ).length;

    if (recentVulns > previousVulns * 1.1) {
      overallRiskScore.trend = 'INCREASING';
    } else if (recentVulns < previousVulns * 0.9) {
      overallRiskScore.trend = 'DECREASING';
    } else {
      overallRiskScore.trend = 'STABLE';
    }

    // Assets with critical risk
    const assets = await prisma.assets.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        riskScore: true,
        criticalVulnCount: true,
      },
      orderBy: { riskScore: 'desc' },
    });

    const criticalAssets = assets.filter(a => a.riskScore >= 70);

    const assetsWithCriticalRisk = {
      count: criticalAssets.length,
      percentage: assets.length > 0 ? (criticalAssets.length / assets.length) * 100 : 0,
      assets: criticalAssets.slice(0, 10).map(a => ({
        id: a.id,
        name: a.name,
        score: a.riskScore,
      })),
    };

    // Risk trend over time (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const scans = await prisma.scans.findMany({
      where: {
        tenantId,
        status: 'COMPLETED',
        completedAt: { gte: thirtyDaysAgo },
      },
      select: {
        completedAt: true,
        overallRiskScore: true,
        vulnFound: true,
      },
      orderBy: { completedAt: 'asc' },
    });

    const riskTrend = scans.map(scan => ({
      date: scan.completedAt?.toISOString().split('T')[0] || '',
      score: scan.overallRiskScore || 0,
      vulnerabilities: scan.vulnFound,
    }));

    // New vs Resolved
    const resolvedVulns = await prisma.vulnerabilities.count({
      where: {
        tenantId,
        status: { in: ['MITIGATED', 'FALSE_POSITIVE'] },
        mitigatedAt: { gte: sevenDaysAgo },
      },
    });

    const newVsResolved = {
      period: 'Last 7 days',
      new: recentVulns,
      resolved: resolvedVulns,
      netChange: recentVulns - resolvedVulns,
    };

    // Top vulnerabilities by risk contribution
    const vulnGroups = new Map<string, {
      id: string;
      title: string;
      severity: string;
      affectedAssets: Set<string>;
      riskContribution: number;
    }>();

    for (const vuln of vulnerabilities) {
      const key = vuln.templateId || vuln.title;
      if (!vulnGroups.has(key)) {
        vulnGroups.set(key, {
          id: vuln.id,
          title: vuln.title,
          severity: vuln.severity,
          affectedAssets: new Set(),
          riskContribution: 0,
        });
      }
      const group = vulnGroups.get(key)!;
      if (vuln.assetId) {
        group.affectedAssets.add(vuln.assetId);
      }
      group.riskContribution += (vuln.cvssScore || 5) * (vuln.severity === 'CRITICAL' ? 2 : 1);
    }

    const topVulnerabilities = Array.from(vulnGroups.values())
      .sort((a, b) => b.riskContribution - a.riskContribution)
      .slice(0, 10)
      .map(v => ({
        id: v.id,
        title: v.title,
        severity: v.severity,
        affectedAssets: v.affectedAssets.size,
        riskContribution: Math.round(v.riskContribution),
      }));

    const metrics: ExecutiveMetrics = {
      overallRiskScore,
      vulnerabilityDistribution,
      assetsWithCriticalRisk,
      riskTrend,
      newVsResolved,
      topVulnerabilities,
    };

    logger.info(`[EXECUTIVE] Metrics calculated: Risk=${overallRiskScore.overall}, Vulns=${vulnerabilities.length}`);

    return metrics;
  }

  /**
   * Update All Asset Risk Scores
   */
  async updateAllRiskScores(tenantId: string): Promise<void> {
    const assets = await prisma.assets.findMany({
      where: { tenantId },
      select: { id: true },
    });

    logger.info(`[EXECUTIVE] Updating risk scores for ${assets.length} assets`);

    for (const asset of assets) {
      await this.calculateAssetRiskScore(asset.id);
    }

    logger.info(`[EXECUTIVE] Risk scores updated`);
  }
}

export const executiveDashboardService = new ExecutiveDashboardService();
