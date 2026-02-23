/**
 * Global Kill Switch Service
 * Emergency stop for all active scans
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';
import { ReconService } from './recon.service';

export class KillSwitchService {
  private reconService = new ReconService();
  /**
   * Activate global kill switch
   */
  async activate(reason: string, activatedById: string, tenantId: string): Promise<void> {
    logger.warn(`KILL SWITCH ACTIVATED by user ${activatedById}: ${reason}`);

    // Create or update kill switch
    await prisma.global_kill_switch.upsert({
      where: { id: 'global' },
      create: {
        id: 'global',
        active: true,
        reason,
        activatedAt: new Date(),
        activatedById,
        tenantId,
        updatedAt: new Date(),
      },
      update: {
        active: true,
        reason,
        activatedAt: new Date(),
        activatedById,
        deactivatedAt: null,
        deactivatedById: null,
        updatedAt: new Date(),
      },
    });

    // Stop all running scans
    await this.stopAllScans(tenantId);

    // Log action
    await prisma.audit_logs.create({
      data: {
        id: randomUUID(),
        action: 'UPDATE',
        resource: 'kill_switch',
        resourceId: 'global',
        details: { action: 'activate', reason },
        userId: activatedById,
        tenantId,
      },
    });
  }

  /**
   * Deactivate global kill switch
   */
  async deactivate(deactivatedById: string, tenantId: string): Promise<void> {
    logger.info(`KILL SWITCH DEACTIVATED by user ${deactivatedById}`);

    await prisma.global_kill_switch.update({
      where: { id: 'global' },
      data: {
        active: false,
        deactivatedAt: new Date(),
        deactivatedById,
        updatedAt: new Date(),
      },
    });

    await prisma.audit_logs.create({
      data: {
        id: randomUUID(),
        action: 'UPDATE',
        resource: 'kill_switch',
        resourceId: 'global',
        details: { action: 'deactivate' },
        userId: deactivatedById,
        tenantId,
      },
    });
  }

  /**
   * Check if kill switch is active
   */
  async isActive(tenantId: string): Promise<boolean> {
    const killSwitch = await prisma.global_kill_switch.findFirst({
      where: { tenantId, active: true },
    });
    return !!killSwitch;
  }

  /**
   * Stop all running scans
   */
  private async stopAllScans(tenantId: string): Promise<void> {
    const runningScans = await prisma.scans.findMany({
      where: { tenantId, status: 'RUNNING' },
    });

    logger.info(`Stopping ${runningScans.length} running scans due to kill switch`);

    for (const scan of runningScans) {
      await prisma.scans.update({
        where: { id: scan.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Stopped by global kill switch',
          killRequested: true,
          killRequestedAt: new Date(),
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    // NEW: Terminate recon processes
    const runningSessions = await prisma.recon_sessions.findMany({
      where: { tenantId, status: 'RUNNING' },
    });

    logger.info(`Stopping ${runningSessions.length} running recon sessions due to kill switch`);

    for (const session of runningSessions) {
      // Kill all processes for this session
      await this.reconService.killAllProcesses(session.id);

      // Mark session as failed
      await prisma.recon_sessions.update({
        where: { id: session.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Stopped by global kill switch',
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Mark all running phase runs as cancelled
      await prisma.recon_phase_runs.updateMany({
        where: {
          sessionId: session.id,
          status: 'RUNNING',
        },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: 'Stopped by global kill switch',
          updatedAt: new Date(),
        },
      });

      logger.info(`Recon session ${session.id} stopped`);
    }
  }

  /**
   * Get kill switch status
   */
  async getStatus(tenantId: string) {
    return await prisma.global_kill_switch.findFirst({
      where: { tenantId },
      include: {
        users_activated: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        users_deactivated: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }
}
