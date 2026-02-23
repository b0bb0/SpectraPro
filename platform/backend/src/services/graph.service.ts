/**
 * Attack Surface Graph Service
 * Generates network graph data for visualization
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

interface GraphNode {
  id: string;
  label: string;
  type: 'asset' | 'vulnerability';
  group: string;
  value: number; // Size of node
  color: string;
  metadata: {
    assetType?: string;
    criticality?: string;
    vulnCount?: number;
    severity?: string;
    cvssScore?: number;
    status?: string;
    environment?: string;
    cveId?: string;
    description?: string;
  };
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  color: string;
  width: number;
  metadata: {
    severity?: string;
    cvssScore?: number;
    status?: string;
  };
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalAssets: number;
    totalVulnerabilities: number;
    criticalPaths: number;
    riskScore: number;
  };
}

export class GraphService {
  /**
   * Get color based on severity
   */
  private getSeverityColor(severity: string): string {
    const colors: Record<string, string> = {
      CRITICAL: '#a855f7', // Purple
      HIGH: '#ef4444', // Red
      MEDIUM: '#f97316', // Orange
      LOW: '#eab308', // Yellow
      INFO: '#3b82f6', // Blue
    };
    return colors[severity] || '#6b7280';
  }

  /**
   * Get color based on criticality
   */
  private getCriticalityColor(criticality: string): string {
    const colors: Record<string, string> = {
      CRITICAL: '#dc2626',
      HIGH: '#ea580c',
      MEDIUM: '#ca8a04',
      LOW: '#65a30d',
    };
    return colors[criticality] || '#4b5563';
  }

  /**
   * Generate attack surface graph
   */
  async generateGraph(tenantId: string): Promise<GraphData> {
    try {
      // Fetch all assets with their vulnerabilities
      const assets = await prisma.assets.findMany({
        where: { tenantId, isActive: true },
        include: {
          vulnerabilities: {
            where: {
              status: {
                in: ['OPEN', 'REOPENED', 'IN_PROGRESS'],
              },
            },
            select: {
              id: true,
              title: true,
              severity: true,
              cvssScore: true,
              status: true,
            },
          },
        },
      });

      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // Create asset nodes
      for (const asset of assets) {
        const criticalCount = asset.vulnerabilities.filter((v) => v.severity === 'CRITICAL').length;
        const highCount = asset.vulnerabilities.filter((v) => v.severity === 'HIGH').length;
        const mediumCount = asset.vulnerabilities.filter((v) => v.severity === 'MEDIUM').length;

        // Calculate node size based on vulnerability count (10-50)
        const vulnCount = asset.vulnerabilities.length;
        const nodeSize = Math.min(50, 10 + vulnCount * 2);

        // Determine node color based on highest severity
        let nodeColor = '#10b981'; // Green (safe)
        if (criticalCount > 0) {
          nodeColor = '#a855f7'; // Purple
        } else if (highCount > 0) {
          nodeColor = '#ef4444'; // Red
        } else if (mediumCount > 0) {
          nodeColor = '#f97316'; // Orange
        } else if (vulnCount > 0) {
          nodeColor = '#eab308'; // Yellow
        }

        nodes.push({
          id: asset.id,
          label: asset.name,
          type: 'asset',
          group: asset.type,
          value: nodeSize,
          color: nodeColor,
          metadata: {
            assetType: asset.type,
            criticality: asset.criticality,
            vulnCount: vulnCount,
            environment: asset.environment || undefined,
          },
        });

        // Create vulnerability connections (edges)
        for (const vuln of asset.vulnerabilities) {
          // For now, vulnerabilities connect assets to themselves (showing vulnerability presence)
          // In the future, we could connect assets that share vulnerabilities
          edges.push({
            id: `${asset.id}-${vuln.id}`,
            source: asset.id,
            target: asset.id, // Self-loop to show vulnerability
            label: vuln.title.substring(0, 30) + '...',
            color: this.getSeverityColor(vuln.severity),
            width: vuln.severity === 'CRITICAL' ? 3 : vuln.severity === 'HIGH' ? 2 : 1,
            metadata: {
              severity: vuln.severity,
              cvssScore: vuln.cvssScore || undefined,
              status: vuln.status,
            },
          });
        }
      }

      // Find assets that share vulnerabilities (same CVE or similar title)
      const vulnerabilities = await prisma.vulnerabilities.findMany({
        where: {
          tenantId,
          status: { in: ['OPEN', 'REOPENED', 'IN_PROGRESS'] },
          cveId: { not: null },
        },
        select: {
          id: true,
          cveId: true,
          assetId: true,
          severity: true,
          title: true,
        },
      });

      // Group by CVE ID to find shared vulnerabilities
      const cveMap = new Map<string, string[]>();
      for (const vuln of vulnerabilities) {
        if (vuln.cveId) {
          if (!cveMap.has(vuln.cveId)) {
            cveMap.set(vuln.cveId, []);
          }
          cveMap.get(vuln.cveId)!.push(vuln.assetId);
        }
      }

      // Create edges between assets that share the same vulnerability
      for (const [cveId, assetIds] of cveMap.entries()) {
        if (assetIds.length > 1) {
          // Connect all assets with this CVE
          const uniqueAssets = Array.from(new Set(assetIds));
          for (let i = 0; i < uniqueAssets.length; i++) {
            for (let j = i + 1; j < uniqueAssets.length; j++) {
              const vuln = vulnerabilities.find((v) => v.cveId === cveId);
              if (vuln) {
                edges.push({
                  id: `shared-${cveId}-${uniqueAssets[i]}-${uniqueAssets[j]}`,
                  source: uniqueAssets[i],
                  target: uniqueAssets[j],
                  label: `Shared: ${cveId}`,
                  color: this.getSeverityColor(vuln.severity),
                  width: 2,
                  metadata: {
                    severity: vuln.severity,
                  },
                });
              }
            }
          }
        }
      }

      // Calculate stats
      const totalVulns = assets.reduce((sum, a) => sum + a.vulnerabilities.length, 0);
      const criticalAssets = assets.filter((a) =>
        a.vulnerabilities.some((v) => v.severity === 'CRITICAL')
      ).length;

      // Calculate risk score (0-100)
      const criticalVulns = assets.reduce(
        (sum, a) => sum + a.vulnerabilities.filter((v) => v.severity === 'CRITICAL').length,
        0
      );
      const highVulns = assets.reduce(
        (sum, a) => sum + a.vulnerabilities.filter((v) => v.severity === 'HIGH').length,
        0
      );
      const riskScore = Math.min(
        100,
        Math.round((criticalVulns * 10 + highVulns * 5 + totalVulns) / Math.max(assets.length, 1))
      );

      return {
        nodes,
        edges,
        stats: {
          totalAssets: assets.length,
          totalVulnerabilities: totalVulns,
          criticalPaths: criticalAssets,
          riskScore,
        },
      };
    } catch (error: any) {
      logger.error('Error generating attack surface graph:', error);
      throw error;
    }
  }

  /**
   * Generate radial graph for a specific target asset
   * Shows the asset at the center with all vulnerabilities connected
   */
  async generateAssetRadialGraph(tenantId: string, assetId: string): Promise<GraphData> {
    try {
      // Fetch the target asset with all its vulnerabilities
      const asset = await prisma.assets.findFirst({
        where: {
          id: assetId,
          tenantId,
        },
        include: {
          vulnerabilities: {
            where: {
              status: {
                in: ['OPEN', 'REOPENED', 'IN_PROGRESS'],
              },
            },
            select: {
              id: true,
              title: true,
              severity: true,
              cvssScore: true,
              status: true,
              cveId: true,
              description: true,
            },
          },
        },
      });

      if (!asset) {
        throw new Error('Asset not found');
      }

      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // Create the central asset node (larger, emphasized as core target)
      nodes.push({
        id: asset.id,
        label: asset.name,
        type: 'asset',
        group: 'TARGET',
        value: 100, // Large central node (increased for emphasis)
        color: '#06b6d4', // Cyan for the target
        metadata: {
          assetType: asset.type,
          criticality: asset.criticality,
          vulnCount: asset.vulnerabilities.length,
          environment: asset.environment || undefined,
        },
      });

      // Create vulnerability nodes around the center (smaller, like ExtraHop)
      for (const vuln of asset.vulnerabilities) {
        const vulnColor = this.getSeverityColor(vuln.severity);
        const vulnSize = vuln.severity === 'CRITICAL' ? 18 : vuln.severity === 'HIGH' ? 15 : 12;

        nodes.push({
          id: vuln.id,
          label: vuln.title.length > 40 ? vuln.title.substring(0, 40) + '...' : vuln.title,
          type: 'vulnerability',
          group: vuln.severity,
          value: vulnSize,
          color: vulnColor,
          metadata: {
            severity: vuln.severity,
            cvssScore: vuln.cvssScore || undefined,
            status: vuln.status,
            cveId: vuln.cveId || undefined,
            description: vuln.description,
          },
        });

        // Create slim neon blue connection from vulnerability to asset
        edges.push({
          id: `${asset.id}-${vuln.id}`,
          source: vuln.id,
          target: asset.id,
          label: vuln.cveId || vuln.severity,
          color: '#22d3ee', // Neon cyan blue
          width: 1.5, // Slim wire
          metadata: {
            severity: vuln.severity,
            cvssScore: vuln.cvssScore || undefined,
            status: vuln.status,
          },
        });
      }

      // Calculate stats
      const criticalCount = asset.vulnerabilities.filter((v) => v.severity === 'CRITICAL').length;
      const highCount = asset.vulnerabilities.filter((v) => v.severity === 'HIGH').length;
      const mediumCount = asset.vulnerabilities.filter((v) => v.severity === 'MEDIUM').length;
      const totalVulns = asset.vulnerabilities.length;

      const riskScore = Math.min(
        100,
        Math.round((criticalCount * 10 + highCount * 5 + mediumCount * 2))
      );

      return {
        nodes,
        edges,
        stats: {
          totalAssets: 1,
          totalVulnerabilities: totalVulns,
          criticalPaths: criticalCount,
          riskScore,
        },
      };
    } catch (error: any) {
      logger.error('Error generating asset radial graph:', error);
      throw error;
    }
  }

  /**
   * Get list of assets for target selection
   */
  async getTargetAssets(tenantId: string): Promise<
    Array<{
      id: string;
      name: string;
      type: string;
      vulnCount: number;
      criticalCount: number;
      highCount: number;
    }>
  > {
    try {
      const assets = await prisma.assets.findMany({
        where: {
          tenantId,
          isActive: true,
        },
        include: {
          _count: {
            select: {
              vulnerabilities: {
                where: {
                  status: { in: ['OPEN', 'REOPENED', 'IN_PROGRESS'] },
                },
              },
            },
          },
          vulnerabilities: {
            where: {
              status: { in: ['OPEN', 'REOPENED', 'IN_PROGRESS'] },
            },
            select: {
              severity: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });

      return assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        vulnCount: asset._count.vulnerabilities,
        criticalCount: asset.vulnerabilities.filter((v) => v.severity === 'CRITICAL').length,
        highCount: asset.vulnerabilities.filter((v) => v.severity === 'HIGH').length,
      }));
    } catch (error: any) {
      logger.error('Error fetching target assets:', error);
      throw error;
    }
  }

  /**
   * Analyze threat paths (critical attack chains)
   */
  async analyzeThreatPaths(tenantId: string): Promise<{
    paths: Array<{
      assets: string[];
      vulnerabilities: string[];
      severity: string;
      riskScore: number;
    }>;
  }> {
    try {
      // Find assets with CRITICAL vulnerabilities
      const criticalAssets = await prisma.assets.findMany({
        where: {
          tenantId,
          vulnerabilities: {
            some: {
              severity: 'CRITICAL',
              status: { in: ['OPEN', 'REOPENED'] },
            },
          },
        },
        include: {
          vulnerabilities: {
            where: {
              severity: { in: ['CRITICAL', 'HIGH'] },
              status: { in: ['OPEN', 'REOPENED'] },
            },
            select: {
              id: true,
              title: true,
              severity: true,
              cvssScore: true,
            },
          },
        },
      });

      const paths = [];

      for (const asset of criticalAssets) {
        const criticalVulns = asset.vulnerabilities.filter((v) => v.severity === 'CRITICAL');

        if (criticalVulns.length > 0) {
          const avgCvss =
            criticalVulns.reduce((sum, v) => sum + (v.cvssScore || 0), 0) / criticalVulns.length;

          paths.push({
            assets: [asset.id],
            vulnerabilities: criticalVulns.map((v) => v.id),
            severity: 'CRITICAL',
            riskScore: Math.round(avgCvss * 10),
          });
        }
      }

      // Sort by risk score
      paths.sort((a, b) => b.riskScore - a.riskScore);

      return { paths: paths.slice(0, 10) }; // Top 10 critical paths
    } catch (error: any) {
      logger.error('Error analyzing threat paths:', error);
      throw error;
    }
  }
}

export const graphService = new GraphService();
