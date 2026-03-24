/**
 * Dashboard Analytics Service
 */

import { prisma } from '../utils/prisma';
import { Severity } from '@prisma/client';

export class DashboardService {
  /**
   * Get key metrics (KPIs)
   */
  async getMetrics(tenantId: string, timeRange: string) {
    const { startDate } = this.getTimeRangeFilter(timeRange);

    // Get current metrics — use groupBy to collapse severity counts into 1 query
    const [
      totalAssets,
      totalVulnerabilities,
      criticalAssets,
      severityGroups,
      recentVulns,
      mitigatedVulns,
    ] = await Promise.all([
      // Total assets
      prisma.assets.count({
        where: { tenantId, isActive: true },
      }),

      // Total vulnerabilities
      prisma.vulnerabilities.count({
        where: { tenantId },
      }),

      // Assets with critical risk
      prisma.assets.count({
        where: {
          tenantId,
          isActive: true,
          criticalVulnCount: { gt: 0 },
        },
      }),

      // Single groupBy replaces 5 separate count queries (open + 4 severity counts)
      prisma.vulnerabilities.groupBy({
        by: ['severity'],
        where: {
          tenantId,
          status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
        },
        _count: true,
      }),

      // Newly discovered in time range
      prisma.vulnerabilities.count({
        where: {
          tenantId,
          firstSeen: { gte: startDate },
        },
      }),

      // Mitigated in time range
      prisma.vulnerabilities.count({
        where: {
          tenantId,
          status: 'MITIGATED',
          mitigatedAt: { gte: startDate },
        },
      }),
    ]);

    // Derive individual severity counts and open total from the single groupBy result
    const severityMap: Record<string, number> = {};
    for (const group of severityGroups) {
      severityMap[group.severity] = group._count;
    }
    const criticalVulns = severityMap['CRITICAL'] || 0;
    const highVulns = severityMap['HIGH'] || 0;
    const mediumVulns = severityMap['MEDIUM'] || 0;
    const lowVulns = (severityMap['LOW'] || 0) + (severityMap['INFO'] || 0);
    const openVulnerabilities = criticalVulns + highVulns + mediumVulns + lowVulns;

    // Calculate risk score (0-100)
    const riskScore = this.calculateRiskScore(
      criticalVulns,
      highVulns,
      mediumVulns,
      lowVulns,
      totalAssets
    );

    // Calculate trends (comparing to previous period)
    const previousPeriod = this.getPreviousPeriodFilter(timeRange);
    const [previousVulns, previousCriticalVulns] = await Promise.all([
      prisma.vulnerabilities.count({
        where: {
          tenantId,
          firstSeen: {
            gte: previousPeriod.startDate,
            lt: previousPeriod.endDate,
          },
        },
      }),
      prisma.vulnerabilities.count({
        where: {
          tenantId,
          severity: 'CRITICAL',
          firstSeen: {
            gte: previousPeriod.startDate,
            lt: previousPeriod.endDate,
          },
        },
      }),
    ]);

    const vulnTrend = this.calculateTrend(recentVulns, previousVulns);
    const criticalTrend = this.calculateTrend(criticalVulns, previousCriticalVulns);

    return {
      totalAssets,
      totalVulnerabilities,
      openVulnerabilities,
      criticalAssets,
      newVulnerabilities: recentVulns,
      mitigatedVulnerabilities: mitigatedVulns,
      riskScore,
      severityCounts: {
        critical: criticalVulns,
        high: highVulns,
        medium: mediumVulns,
        low: lowVulns,
      },
      trends: {
        vulnerabilities: vulnTrend,
        critical: criticalTrend,
      },
      timeRange,
    };
  }

  /**
   * Get risk trend over time
   * Optimized: single query instead of N+1 per-day queries
   */
  async getRiskTrend(tenantId: string, timeRange: string) {
    const { startDate } = this.getTimeRangeFilter(timeRange);
    const days = this.getDaysInRange(timeRange);

    // Fetch ALL open vulnerabilities once with just the fields we need
    const allVulns = await prisma.vulnerabilities.findMany({
      where: {
        tenantId,
        status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
      },
      select: {
        severity: true,
        firstSeen: true,
      },
      orderBy: { firstSeen: 'asc' },
    });

    // Generate daily data points from in-memory data
    const dataPoints = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(23, 59, 59, 999);

      // Count vulnerabilities that existed up to this date
      const vulnsUpToDate = allVulns.filter(v => new Date(v.firstSeen) <= date);

      let criticalCount = 0, highCount = 0, mediumCount = 0, lowCount = 0;
      for (const v of vulnsUpToDate) {
        switch (v.severity) {
          case 'CRITICAL': criticalCount++; break;
          case 'HIGH': highCount++; break;
          case 'MEDIUM': mediumCount++; break;
          case 'LOW': case 'INFO': lowCount++; break;
        }
      }

      const riskScore = this.calculateRiskScore(criticalCount, highCount, mediumCount, lowCount, 1);

      dataPoints.push({
        date: date.toISOString().split('T')[0],
        riskScore,
        totalVulns: vulnsUpToDate.length,
        critical: criticalCount,
        high: highCount,
        medium: mediumCount,
        low: lowCount,
      });
    }

    return dataPoints;
  }

  /**
   * Get severity distribution
   */
  async getSeverityDistribution(tenantId: string) {
    const distribution = await prisma.vulnerabilities.groupBy({
      by: ['severity'],
      where: {
        tenantId,
        status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
      },
      _count: true,
    });

    return distribution.map((item) => ({
      severity: item.severity,
      count: item._count,
    }));
  }

  /**
   * Get assets by category
   */
  async getAssetsByCategory(tenantId: string) {
    const [byType, byEnvironment, byCriticality] = await Promise.all([
      // By type
      prisma.assets.groupBy({
        by: ['type'],
        where: { tenantId, isActive: true },
        _count: true,
      }),

      // By environment
      prisma.assets.groupBy({
        by: ['environment'],
        where: { tenantId, isActive: true },
        _count: true,
      }),

      // By criticality
      prisma.assets.groupBy({
        by: ['criticality'],
        where: { tenantId, isActive: true },
        _count: true,
      }),
    ]);

    return {
      byType: byType.map((item) => ({
        category: item.type,
        count: item._count,
      })),
      byEnvironment: byEnvironment.map((item) => ({
        category: item.environment,
        count: item._count,
      })),
      byCriticality: byCriticality.map((item) => ({
        category: item.criticality,
        count: item._count,
      })),
    };
  }

  /**
   * Get top vulnerabilities
   */
  async getTopVulnerabilities(tenantId: string, limit: number) {
    const vulnerabilities = await prisma.vulnerabilities.findMany({
      where: {
        tenantId,
        status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
      },
      include: {
        assets: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: [
        { severity: 'asc' }, // CRITICAL first (enum order)
        { cvssScore: 'desc' },
      ],
      take: limit,
    });

    return vulnerabilities.map((vuln) => ({
      id: vuln.id,
      title: vuln.title,
      severity: vuln.severity,
      cvssScore: vuln.cvssScore,
      cveId: vuln.cveId,
      status: vuln.status,
      firstSeen: vuln.firstSeen,
      asset: vuln.assets,
    }));
  }

  /**
   * Get all dashboard data in a single batched call.
   * Runs all sub-queries concurrently to minimise latency.
   */
  async getOverview(tenantId: string, timeRange: string) {
    const [metrics, riskTrend, severityDistribution, assetsByCategory, topVulnerabilities, recentScans] =
      await Promise.all([
        this.getMetrics(tenantId, timeRange),
        this.getRiskTrend(tenantId, timeRange),
        this.getSeverityDistribution(tenantId),
        this.getAssetsByCategory(tenantId),
        this.getTopVulnerabilities(tenantId, 5),
        this.getRecentScans(tenantId, 4),
      ]);

    return { metrics, riskTrend, severityDistribution, assetsByCategory, topVulnerabilities, recentScans };
  }

  /**
   * Get recent scans
   */
  async getRecentScans(tenantId: string, limit: number) {
    const scans = await prisma.scans.findMany({
      where: { tenantId },
      include: {
        assets: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return scans;
  }

  /**
   * Calculate overall risk score (0-100)
   */
  private calculateRiskScore(
    critical: number,
    high: number,
    medium: number,
    low: number,
    assetCount: number
  ): number {
    if (assetCount === 0) return 0;

    // Weighted scoring
    const score =
      critical * 10 +
      high * 5 +
      medium * 2 +
      low * 0.5;

    // Normalize to 0-100 scale
    const normalized = Math.min(100, (score / assetCount) * 2);

    return Math.round(normalized);
  }

  /**
   * Calculate trend percentage
   */
  private calculateTrend(current: number, previous: number): {
    value: number;
    direction: 'up' | 'down' | 'stable';
  } {
    if (previous === 0) {
      return {
        value: current > 0 ? 100 : 0,
        direction: current > 0 ? 'up' : 'stable',
      };
    }

    const percentChange = ((current - previous) / previous) * 100;

    return {
      value: Math.round(Math.abs(percentChange)),
      direction: percentChange > 5 ? 'up' : percentChange < -5 ? 'down' : 'stable',
    };
  }

  /**
   * Get time range filter
   */
  private getTimeRangeFilter(range: string): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();

    switch (range) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    return { startDate, endDate };
  }

  /**
   * Get previous period filter for trend comparison
   */
  private getPreviousPeriodFilter(range: string): { startDate: Date; endDate: Date } {
    const current = this.getTimeRangeFilter(range);
    const days = this.getDaysInRange(range);

    const endDate = new Date(current.startDate);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    return { startDate, endDate };
  }

  /**
   * Get number of days in range
   */
  private getDaysInRange(range: string): number {
    switch (range) {
      case '7d':
        return 7;
      case '30d':
        return 30;
      case '90d':
        return 90;
      default:
        return 30;
    }
  }
}
