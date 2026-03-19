/**
 * Audit Logging Service
 * Tracks all user actions for compliance and security monitoring
 */

import { prisma } from '../utils/prisma';
import { AuditAction } from '@prisma/client';
import { logger } from '../utils/logger';

export interface AuditLogData {
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
  tenantId: string;
}

export class AuditService {
  /**
   * Create an audit log entry
   */
  async log(data: AuditLogData): Promise<void> {
    try {
      await prisma.audit_logs.create({
        data: {
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId || null,
          details: data.details || null,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
          userId: data.userId || null,
          tenantId: data.tenantId,
        },
      });

      logger.info(`Audit: ${data.action} ${data.resource} ${data.resourceId || ''} by user ${data.userId || 'system'}`);
    } catch (error: any) {
      logger.error(`Failed to create audit log: ${error.message}`);
      // Don't throw - audit logging shouldn't break the application
    }
  }

  /**
   * Log user login
   */
  async logLogin(userId: string, tenantId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.log({
      action: 'LOGIN',
      resource: 'User',
      resourceId: userId,
      details: { timestamp: new Date().toISOString() },
      ipAddress,
      userAgent,
      userId,
      tenantId,
    });
  }

  /**
   * Log user logout
   */
  async logLogout(userId: string, tenantId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.log({
      action: 'LOGOUT',
      resource: 'User',
      resourceId: userId,
      details: { timestamp: new Date().toISOString() },
      ipAddress,
      userAgent,
      userId,
      tenantId,
    });
  }

  /**
   * Log resource creation
   */
  async logCreate(
    resource: string,
    resourceId: string,
    userId: string,
    tenantId: string,
    details?: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      action: 'CREATE',
      resource,
      resourceId,
      details,
      ipAddress,
      userAgent,
      userId,
      tenantId,
    });
  }

  /**
   * Log resource update
   */
  async logUpdate(
    resource: string,
    resourceId: string,
    userId: string,
    tenantId: string,
    details?: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      action: 'UPDATE',
      resource,
      resourceId,
      details,
      ipAddress,
      userAgent,
      userId,
      tenantId,
    });
  }

  /**
   * Log resource deletion
   */
  async logDelete(
    resource: string,
    resourceId: string,
    userId: string,
    tenantId: string,
    details?: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      action: 'DELETE',
      resource,
      resourceId,
      details,
      ipAddress,
      userAgent,
      userId,
      tenantId,
    });
  }

  /**
   * Log resource view (for sensitive resources)
   */
  async logView(
    resource: string,
    resourceId: string,
    userId: string,
    tenantId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      action: 'VIEW',
      resource,
      resourceId,
      ipAddress,
      userAgent,
      userId,
      tenantId,
    });
  }

  /**
   * Log data export
   */
  async logExport(
    resource: string,
    userId: string,
    tenantId: string,
    details?: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      action: 'EXPORT',
      resource,
      details,
      ipAddress,
      userAgent,
      userId,
      tenantId,
    });
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(params: {
    tenantId: string;
    page?: number;
    limit?: number;
    action?: AuditAction;
    resource?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    logs: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      tenantId: params.tenantId,
    };

    if (params.action) {
      where.action = params.action;
    }

    if (params.resource) {
      where.resource = params.resource;
    }

    if (params.userId) {
      where.userId = params.userId;
    }

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        where.createdAt.gte = params.startDate;
      }
      if (params.endDate) {
        where.createdAt.lte = params.endDate;
      }
    }

    // Get total count
    const total = await prisma.audit_logs.count({ where });

    // Get logs
    const logs = await prisma.audit_logs.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get audit log statistics
   */
  async getStats(tenantId: string, days: number = 30): Promise<{
    totalActions: number;
    actionsByType: Record<string, number>;
    topUsers: Array<{ userId: string; email: string; count: number }>;
    recentActivity: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Total actions
    const totalActions = await prisma.audit_logs.count({
      where: {
        tenantId,
        createdAt: { gte: startDate },
      },
    });

    // Actions by type
    const actionsByTypeRaw = await prisma.audit_logs.groupBy({
      by: ['action'],
      where: {
        tenantId,
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    const actionsByType: Record<string, number> = {};
    for (const item of actionsByTypeRaw) {
      actionsByType[item.action] = item._count;
    }

    // Top users
    const topUsersRaw = await prisma.audit_logs.groupBy({
      by: ['userId'],
      where: {
        tenantId,
        userId: { not: null },
        createdAt: { gte: startDate },
      },
      _count: true,
      orderBy: {
        _count: {
          userId: 'desc',
        },
      },
      take: 10,
    });

    const topUsers = await Promise.all(
      topUsersRaw.map(async (item) => {
        const user = await prisma.users.findUnique({
          where: { id: item.userId! },
          select: { id: true, email: true },
        });
        return {
          userId: item.userId!,
          email: user?.email || 'Unknown',
          count: item._count,
        };
      })
    );

    // Recent activity (last 24 hours)
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    const recentActivity = await prisma.audit_logs.count({
      where: {
        tenantId,
        createdAt: { gte: yesterday },
      },
    });

    return {
      totalActions,
      actionsByType,
      topUsers,
      recentActivity,
    };
  }

  /**
   * Export audit logs to CSV
   */
  async exportToCSV(params: {
    tenantId: string;
    action?: AuditAction;
    resource?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<string> {
    const result = await this.getAuditLogs({
      ...params,
      limit: 10000, // Export max 10k records
    });

    const headers = [
      'Timestamp',
      'Action',
      'Resource',
      'Resource ID',
      'User Email',
      'User Role',
      'IP Address',
      'Details',
    ];

    const rows = result.logs.map((log) => [
      new Date(log.createdAt).toISOString(),
      log.action,
      log.resource,
      log.resourceId || '',
      log.user?.email || 'System',
      log.user?.role || '',
      log.ipAddress || '',
      JSON.stringify(log.details || {}),
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csv;
  }
}

export const auditService = new AuditService();
