import { PrismaClient, ROEStatus, ScanMethod, rules_of_engagement, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { isIP } from 'net';
import { auditService } from './audit.service';
import { logger } from '../utils/logger';

// Types for creation/update (omit relational + derived fields)
type CreateROEInput = Omit<
  rules_of_engagement,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'status'
  | 'approvedAt'
  | 'approvedById'
  | 'users_rules_of_engagement_approvedByIdTousers'
  | 'users_rules_of_engagement_createdByIdTousers'
  | 'tenants'
  | 'scans'
>;

// Allow partial updates but keep tenant/creator immutable
type UpdateROEInput = Partial<CreateROEInput> & { status?: ROEStatus };

export class RulesOfEngagementService {
  private readonly prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = prisma) {
    this.prisma = prismaClient;
  }

  async createROE(data: CreateROEInput): Promise<rules_of_engagement> {
    return this.prisma.rules_of_engagement.create({
      data: {
        ...data,
        status: ROEStatus.DRAFT,
      },
    });
  }

  async getAllROEs(tenantId: string): Promise<rules_of_engagement[]> {
    return this.prisma.rules_of_engagement.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getActiveROEs(tenantId: string): Promise<rules_of_engagement[]> {
    const now = new Date();
    return this.prisma.rules_of_engagement.findMany({
      where: {
        tenantId,
        status: ROEStatus.ACTIVE,
        validFrom: { lte: now },
        validUntil: { gte: now },
      },
      orderBy: { validUntil: 'asc' },
    });
  }

  async getROE(roeId: string, tenantId?: string): Promise<rules_of_engagement> {
    return this.getROEById(roeId, tenantId);
  }

  async updateROE(roeId: string, tenantId: string, data: UpdateROEInput): Promise<rules_of_engagement> {
    const allowedData = { ...data } as Prisma.rules_of_engagementUpdateManyMutationInput;
    delete (allowedData as any).tenantId;
    delete (allowedData as any).createdById;

    const updated = await this.prisma.rules_of_engagement.updateMany({
      where: { id: roeId, tenantId },
      data: allowedData,
    });

    if (updated.count === 0) {
      throw new Error(`RulesOfEngagement with ID ${roeId} not found.`);
    }

    return this.getROEById(roeId, tenantId);
  }

  async deleteROE(roeId: string, tenantId: string): Promise<void> {
    const deleted = await this.prisma.rules_of_engagement.deleteMany({
      where: { id: roeId, tenantId },
    });

    if (deleted.count === 0) {
      throw new Error(`RulesOfEngagement with ID ${roeId} not found.`);
    }
  }

  async validateTarget(target: string, roeId: string, tenantId?: string): Promise<boolean> {
    const roe = await this.getROEById(roeId, tenantId);

    if (roe.excludedTargets.includes(target)) return false;

    if (roe.scopeUrls.some((scopeUrl) => target.startsWith(scopeUrl))) return true;

    if (isIP(target)) {
      return roe.scopeIPs.includes(target);
    }

    try {
      const targetHostname = new URL(target.startsWith('http') ? target : `http://${target}`).hostname;
      if (roe.scopeDomains.some((domain) => targetHostname === domain || targetHostname.endsWith(`.${domain}`))) {
        return true;
      }
    } catch (e) {
      // Invalid URL; fall through to false
    }

    return false;
  }

  async validateScanMethod(method: ScanMethod, roeId: string, tenantId?: string): Promise<boolean> {
    const roe = await this.getROEById(roeId, tenantId);
    return roe.allowedMethods.includes(method);
  }

  async validateTimeWindow(roeId: string, tenantId?: string): Promise<boolean> {
    const roe = await this.getROEById(roeId, tenantId);
    const now = new Date();

    if (roe.status !== ROEStatus.ACTIVE) return false;
    if (roe.validFrom && now < roe.validFrom) return false;
    if (roe.validUntil && now > roe.validUntil) return false;

    const currentDay = now.getUTCDay();
    if (roe.allowedDaysOfWeek.length > 0 && !roe.allowedDaysOfWeek.includes(currentDay)) {
      return false;
    }

    const start = this.parseTimeToMinutes(roe.allowedStartTime);
    const end = this.parseTimeToMinutes(roe.allowedEndTime);
    if (start !== null && end !== null) {
      const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      if (start <= end) {
        if (currentMinutes < start || currentMinutes > end) return false;
      } else {
        if (currentMinutes > end && currentMinutes < start) return false;
      }
    }

    return true;
  }

  async approveROE(roeId: string, userId: string, tenantId?: string): Promise<rules_of_engagement> {
    const roe = await this.getROEById(roeId, tenantId);
    if (roe.status !== ROEStatus.DRAFT && roe.status !== ROEStatus.PENDING_APPROVAL) {
      throw new Error(`Cannot approve ROE in ${roe.status} status.`);
    }

    const now = new Date();
    const newStatus = roe.validFrom && roe.validFrom > now ? ROEStatus.APPROVED : ROEStatus.ACTIVE;

    return this.prisma.rules_of_engagement.update({
      where: { id: roeId },
      data: {
        status: newStatus,
        approvedById: userId,
        approvedAt: now,
      },
    });
  }

  async checkValidationAllowed(roeId: string, tenantId?: string): Promise<boolean> {
    const roe = await this.getROEById(roeId, tenantId);
    return roe.validationEnabled;
  }

  async getActiveROEForScan(scanId: string): Promise<rules_of_engagement | null> {
    const scan = await this.prisma.scans.findUnique({
      where: { id: scanId },
      include: { rules_of_engagement: true },
    });
    return scan?.rules_of_engagement ?? null;
  }

  async revokeROE(roeId: string, reason: string, userId: string, tenantId?: string): Promise<rules_of_engagement> {
    const roe = await this.getROEById(roeId, tenantId);
    const revoked = await this.prisma.rules_of_engagement.update({
      where: { id: roe.id },
      data: { status: ROEStatus.REVOKED },
    });

    if (tenantId) {
      await auditService.log({
        action: 'UPDATE',
        resource: 'RulesOfEngagement',
        resourceId: roeId,
        details: {
          action: 'REVOKE',
          reason,
          previousStatus: roe.status,
          newStatus: ROEStatus.REVOKED,
          roeName: roe.name,
        },
        userId,
        tenantId,
      });
    }

    logger.info(`ROE ${roeId} revoked by user ${userId}. Reason: ${reason}`);

    return revoked;
  }

  private async getROEById(roeId: string, tenantId?: string): Promise<rules_of_engagement> {
    const roe = await this.prisma.rules_of_engagement.findFirst({
      where: { id: roeId, ...(tenantId ? { tenantId } : {}) },
    });
    if (!roe) {
      throw new Error(`RulesOfEngagement with ID ${roeId} not found.`);
    }
    return roe;
  }

  private parseTimeToMinutes(time?: string | null): number | null {
    if (!time) return null;
    const parts = time.split(':');
    if (parts.length !== 2) return null;
    const [hours, minutes] = parts.map((p) => parseInt(p, 10));
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }
}

export const roeService = new RulesOfEngagementService();
