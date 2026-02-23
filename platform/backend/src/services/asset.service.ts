/**
 * Asset Management Service
 */

import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { AppError } from '../middleware/errorHandler';
import { AssetType, AssetEnvironment, AssetCriticality } from '@prisma/client';

interface ListAssetsOptions {
  page: number;
  limit: number;
  search?: string;
  type?: string;
  environment?: string;
  criticality?: string;
}

interface CreateAssetData {
  name: string;
  type: AssetType;
  environment?: AssetEnvironment;
  criticality?: AssetCriticality;
  identifier?: string;
  ipAddress?: string;
  ipAddresses?: string[];
  hostname?: string;
  url?: string;
  services?: string[];
  parentAssetId?: string;
  description?: string;
  tags?: string[];
  owner?: string;
  source?: string[];
}

export class AssetService {
  /**
   * List assets with filtering and pagination
   */
  async listAssets(tenantId: string, options: ListAssetsOptions) {
    const { page, limit, search, type, environment, criticality } = options;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      tenantId,
      isActive: true,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { hostname: { contains: search, mode: 'insensitive' } },
        { ipAddress: { contains: search, mode: 'insensitive' } },
        { url: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (type) where.type = type;
    if (environment) where.environment = environment;
    if (criticality) where.criticality = criticality;

    // Get assets and total count
    const [assets, total] = await Promise.all([
      prisma.assets.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { criticality: 'asc' }, // CRITICAL first
          { riskScore: 'desc' },
          { name: 'asc' },
        ],
        select: {
          id: true,
          name: true,
          type: true,
          environment: true,
          criticality: true,
          ipAddress: true,
          hostname: true,
          url: true,
          tags: true,
          owner: true,
          riskScore: true,
          vulnCount: true,
          criticalVulnCount: true,
          lastScanAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.assets.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      assets,
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  /**
   * Get asset by ID
   */
  async getAssetById(id: string, tenantId: string) {
    const asset = await prisma.assets.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            vulnerabilities: {
              where: {
                status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
              },
            },
          },
        },
      },
    });

    if (!asset) {
      throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    }

    return asset;
  }

  /**
   * Create new asset
   */
  async createAsset(
    tenantId: string,
    userId: string,
    data: CreateAssetData
  ) {
    const asset = await prisma.assets.create({
      data: {
        id: randomUUID(),
        ...data,
        tenantId,
        createdById: userId,
        updatedAt: new Date(),
      },
    });

    // Create audit log
    await this.createAuditLog(tenantId, userId, 'CREATE', 'Asset', asset.id);

    return asset;
  }

  /**
   * Update asset
   */
  async updateAsset(
    id: string,
    tenantId: string,
    data: Partial<CreateAssetData>
  ) {
    // Verify asset exists and belongs to tenant
    const existing = await prisma.assets.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    }

    const asset = await prisma.assets.update({
      where: { id },
      data,
    });

    return asset;
  }

  /**
   * Delete asset
   */
  async deleteAsset(id: string, tenantId: string) {
    // Verify asset exists and belongs to tenant
    const existing = await prisma.assets.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    }

    // Soft delete
    await prisma.assets.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Get vulnerabilities for asset
   */
  async getAssetVulnerabilities(id: string, tenantId: string) {
    // Verify asset exists and belongs to tenant
    const asset = await prisma.assets.findFirst({
      where: { id, tenantId },
    });

    if (!asset) {
      throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    }

    const vulnerabilities = await prisma.vulnerabilities.findMany({
      where: {
        assetId: id,
        tenantId,
      },
      orderBy: [
        { severity: 'asc' },
        { firstSeen: 'desc' },
      ],
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        cvssScore: true,
        cveId: true,
        firstSeen: true,
        lastSeen: true,
      },
    });

    return vulnerabilities;
  }

  /**
   * Update asset risk metrics (called after vulnerability changes)
   */
  async updateAssetRiskMetrics(assetId: string) {
    const vulnCounts = await prisma.vulnerabilities.groupBy({
      by: ['severity'],
      where: {
        assetId,
        status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
      },
      _count: true,
    });

    const criticalCount = vulnCounts.find((v) => v.severity === 'CRITICAL')?._count || 0;
    const highCount = vulnCounts.find((v) => v.severity === 'HIGH')?._count || 0;
    const mediumCount = vulnCounts.find((v) => v.severity === 'MEDIUM')?._count || 0;
    const lowCount = vulnCounts.find((v) => v.severity === 'LOW')?._count || 0;
    const infoCount = vulnCounts.find((v) => v.severity === 'INFO')?._count || 0;

    const totalVulns = criticalCount + highCount + mediumCount + lowCount + infoCount;

    // Calculate risk score (weighted by severity)
    const riskScore =
      criticalCount * 10 +
      highCount * 5 +
      mediumCount * 2 +
      lowCount * 0.5 +
      infoCount * 0.1;

    await prisma.assets.update({
      where: { id: assetId },
      data: {
        vulnCount: totalVulns,
        criticalVulnCount: criticalCount,
        highVulnCount: highCount,
        mediumVulnCount: mediumCount,
        lowVulnCount: lowCount,
        infoVulnCount: infoCount,
        riskScore: Math.min(100, riskScore),
        lastSeen: new Date(),
      },
    });
  }

  /**
   * Find or create asset with deduplication logic
   */
  async findOrCreateAsset(
    tenantId: string,
    userId: string,
    data: CreateAssetData,
    source: string = 'manual'
  ) {
    // Build OR conditions for finding existing assets
    const orConditions: any[] = [];

    if (data.name) {
      orConditions.push({ name: data.name });
    }
    if (data.hostname) {
      orConditions.push({ hostname: data.hostname });
    }
    if (data.ipAddress) {
      orConditions.push({ ipAddress: data.ipAddress });
    }
    if (data.url) {
      orConditions.push({ url: data.url });
    }

    // Check if asset already exists by any identifier
    const existing = orConditions.length > 0 ? await prisma.assets.findFirst({
      where: {
        tenantId,
        OR: orConditions,
      },
    }) : null;

    if (existing) {
      // Update lastSeen and merge sources
      const updatedSources = Array.from(new Set([...(existing.source || []), source]));

      const updated = await prisma.assets.update({
        where: { id: existing.id },
        data: {
          lastSeen: new Date(),
          source: updatedSources,
          // Merge IP addresses if provided
          ipAddresses: data.ipAddresses
            ? Array.from(new Set([...(existing.ipAddresses || []), ...data.ipAddresses]))
            : existing.ipAddresses,
          // Merge services if provided
          services: data.services
            ? Array.from(new Set([...(existing.services || []), ...data.services]))
            : existing.services,
        },
      });

      return { asset: updated, isNew: false };
    }

    // Create new asset (remove identifier field as it doesn't exist in schema)
    const asset = await prisma.assets.create({
      data: {
        id: randomUUID(),
        name: data.name,
        type: data.type,
        environment: data.environment || 'PRODUCTION',
        criticality: data.criticality || 'MEDIUM',
        ipAddress: data.ipAddress,
        hostname: data.hostname,
        url: data.url,
        description: data.description,
        tags: data.tags,
        owner: data.owner,
        parentAssetId: data.parentAssetId,
        tenantId,
        createdById: userId,
        source: [source],
        firstSeen: new Date(),
        lastSeen: new Date(),
        updatedAt: new Date(),
      },
    });

    await this.createAuditLog(tenantId, userId, 'CREATE', 'Asset', asset.id);

    return { asset, isNew: true };
  }

  /**
   * Link asset to scan and update metrics
   */
  async linkAssetToScan(assetId: string, scanId: string) {
    const asset = await prisma.assets.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    }

    await prisma.assets.update({
      where: { id: assetId },
      data: {
        lastScanAt: new Date(),
        scanCount: asset.scanCount + 1,
      },
    });

    // Update risk metrics after scan
    await this.updateAssetRiskMetrics(assetId);
  }

  /**
   * Promote subdomain from exposure mapping to full asset
   */
  async promoteFromExposure(
    tenantId: string,
    userId: string,
    subdomain: string,
    parentDomain?: string
  ) {
    // Find parent asset if domain provided
    let parentAssetId: string | undefined;
    if (parentDomain) {
      const parentAsset = await prisma.assets.findFirst({
        where: {
          tenantId,
          OR: [
            { hostname: parentDomain },
            { url: parentDomain },
            { name: parentDomain },
          ],
        },
      });
      parentAssetId = parentAsset?.id;
    }

    // Create asset from subdomain
    const result = await this.findOrCreateAsset(
      tenantId,
      userId,
      {
        name: subdomain,
        type: 'DOMAIN',
        hostname: subdomain,
        parentAssetId,
      },
      'exposure'
    );

    return result.asset;
  }

  /**
   * Get scan history for asset
   */
  async getAssetScans(id: string, tenantId: string) {
    const asset = await prisma.assets.findFirst({
      where: { id, tenantId },
    });

    if (!asset) {
      throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    }

    const scans = await prisma.scans.findMany({
      where: {
        assetId: id,
        tenantId,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        vulnFound: true,
        criticalCount: true,
        highCount: true,
        mediumCount: true,
        lowCount: true,
        infoCount: true,
        startedAt: true,
        completedAt: true,
        duration: true,
        createdAt: true,
      },
    });

    return scans;
  }

  /**
   * Get asset hierarchy (parent and children)
   */
  async getAssetHierarchy(id: string, tenantId: string) {
    const asset = await prisma.assets.findFirst({
      where: { id, tenantId },
      include: {
        parentAsset: {
          select: {
            id: true,
            name: true,
            type: true,
            riskScore: true,
            vulnCount: true,
          },
        },
        childAssets: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            type: true,
            riskScore: true,
            vulnCount: true,
            criticalVulnCount: true,
            lastSeen: true,
          },
          orderBy: { riskScore: 'desc' },
        },
      },
    });

    if (!asset) {
      throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    }

    return {
      parent: asset.parentAsset,
      current: {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        identifier: asset.hostname || asset.url || asset.ipAddress || asset.name,
      },
      children: asset.childAssets,
    };
  }

  /**
   * Get asset statistics for dashboard
   */
  async getAssetStats(tenantId: string) {
    const [
      totalAssets,
      assetsByType,
      assetsByEnvironment,
      assetsByCriticality,
      highRiskAssets,
      recentlyScanned,
    ] = await Promise.all([
      // Total active assets
      prisma.assets.count({
        where: { tenantId, isActive: true },
      }),

      // Assets by type
      prisma.assets.groupBy({
        by: ['type'],
        where: { tenantId, isActive: true },
        _count: true,
      }),

      // Assets by environment
      prisma.assets.groupBy({
        by: ['environment'],
        where: { tenantId, isActive: true },
        _count: true,
      }),

      // Assets by criticality
      prisma.assets.groupBy({
        by: ['criticality'],
        where: { tenantId, isActive: true },
        _count: true,
      }),

      // High-risk assets (risk score > 50)
      prisma.assets.count({
        where: {
          tenantId,
          isActive: true,
          riskScore: { gte: 50 },
        },
      }),

      // Recently scanned (last 7 days)
      prisma.assets.count({
        where: {
          tenantId,
          isActive: true,
          lastScanAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      total: totalAssets,
      byType: assetsByType.reduce((acc, item) => {
        acc[item.type] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byEnvironment: assetsByEnvironment.reduce((acc, item) => {
        acc[item.environment] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byCriticality: assetsByCriticality.reduce((acc, item) => {
        acc[item.criticality] = item._count;
        return acc;
      }, {} as Record<string, number>),
      highRisk: highRiskAssets,
      recentlyScanned,
    };
  }

  /**
   * Bulk create assets
   */
  async bulkCreateAssets(
    tenantId: string,
    userId: string,
    assets: CreateAssetData[],
    source: string = 'bulk'
  ) {
    const results = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const assetData of assets) {
      try {
        const result = await this.findOrCreateAsset(
          tenantId,
          userId,
          assetData,
          source
        );

        if (result.isNew) {
          results.created++;
        } else {
          results.updated++;
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push(
          `Failed to create asset ${assetData.name}: ${error.message}`
        );
      }
    }

    return results;
  }

  /**
   * Create audit log
   */
  private async createAuditLog(
    tenantId: string,
    userId: string,
    action: string,
    resource: string,
    resourceId?: string
  ) {
    try {
      await prisma.audit_logs.create({
        data: {
          action: action as any,
          resource,
          resourceId,
          tenantId,
          userId,
        },
      });
    } catch (error) {
      // Log error but don't fail the operation
      console.error('Failed to create audit log:', error);
    }
  }
}
