/**
 * Scheduled Scans Service
 * Manages cron-based recurring vulnerability scans
 */

import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { scanService } from './scan.service';
import { logger } from '../utils/logger';
import { notificationService } from './notification.service';

interface ScheduledJob {
  id: string;
  task: any;
}

class SchedulerService {
  private jobs: Map<string, ScheduledJob> = new Map();
  private isRunning: boolean = false;

  /**
   * Start the scheduler service
   * Loads all active scheduled scans and starts their cron jobs
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Scheduler service is already running');
      return;
    }

    logger.info('Starting scheduler service...');
    this.isRunning = true;

    // Load all active scheduled scans
    const scheduledScans = await prisma.scheduledScan.findMany({
      where: {
        status: 'ACTIVE',
        isActive: true,
        OR: [
          { endDate: null },
          { endDate: { gte: new Date() } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    logger.info(`Found ${scheduledScans.length} active scheduled scans`);

    // Schedule each scan
    for (const scan of scheduledScans) {
      try {
        await this.scheduleJob(scan);
      } catch (error) {
        logger.error(`Failed to schedule scan ${scan.id}:`, error);
      }
    }

    logger.info('Scheduler service started successfully');
  }

  /**
   * Stop the scheduler service
   * Stops all running cron jobs
   */
  async stop() {
    logger.info('Stopping scheduler service...');
    this.isRunning = false;

    // Stop all jobs
    for (const [id, job] of this.jobs.entries()) {
      job.task.stop();
      this.jobs.delete(id);
    }

    logger.info('Scheduler service stopped');
  }

  /**
   * Schedule a specific scan job
   */
  async scheduleJob(scheduledScan: any) {
    // Check if job already exists
    if (this.jobs.has(scheduledScan.id)) {
      logger.warn(`Job ${scheduledScan.id} is already scheduled`);
      return;
    }

    // Get cron expression
    const cronExpression = this.getCronExpression(scheduledScan);

    if (!cronExpression) {
      logger.error(`Invalid cron expression for scheduled scan ${scheduledScan.id}`);
      return;
    }

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      logger.error(`Invalid cron expression: ${cronExpression} for scan ${scheduledScan.id}`);
      return;
    }

    logger.info(`Scheduling scan ${scheduledScan.id} with cron: ${cronExpression}`);

    // Create cron job
    const task = cron.schedule(
      cronExpression,
      async () => {
        await this.executeScan(scheduledScan.id);
      },
      {
        timezone: scheduledScan.timezone || 'UTC',
      }
    );

    // Store job
    this.jobs.set(scheduledScan.id, {
      id: scheduledScan.id,
      task,
    });

    // Update next run time
    await this.updateNextRunTime(scheduledScan.id);

    logger.info(`Successfully scheduled scan ${scheduledScan.id}`);
  }

  /**
   * Unschedule a specific scan job
   */
  async unscheduleJob(scheduledScanId: string) {
    const job = this.jobs.get(scheduledScanId);

    if (!job) {
      logger.warn(`Job ${scheduledScanId} is not scheduled`);
      return;
    }

    job.task.stop();
    this.jobs.delete(scheduledScanId);

    logger.info(`Unscheduled scan ${scheduledScanId}`);
  }

  /**
   * Reschedule a job (useful when schedule is updated)
   */
  async rescheduleJob(scheduledScanId: string) {
    await this.unscheduleJob(scheduledScanId);

    const scheduledScan = await prisma.scheduledScan.findUnique({
      where: { id: scheduledScanId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!scheduledScan) {
      logger.error(`Scheduled scan ${scheduledScanId} not found`);
      return;
    }

    if (scheduledScan.status === 'ACTIVE' && scheduledScan.isActive) {
      await this.scheduleJob(scheduledScan);
    }
  }

  /**
   * Execute a scheduled scan
   */
  private mapProfileToScanLevel(profile: string | null | undefined): 'light' | 'normal' | 'extreme' {
    if (profile === 'FAST') return 'light';
    if (profile === 'DEEP') return 'extreme';
    return 'normal';
  }

  private async executeScan(scheduledScanId: string) {
    logger.info(`Executing scheduled scan ${scheduledScanId}`);

    let execution;

    try {
      // Get scheduled scan details
      const scheduledScan = await prisma.scheduledScan.findUnique({
        where: { id: scheduledScanId },
      });

      if (!scheduledScan) {
        logger.error(`Scheduled scan ${scheduledScanId} not found`);
        return;
      }

      // Check if scan should still run
      if (scheduledScan.status !== 'ACTIVE' || !scheduledScan.isActive) {
        logger.warn(`Scheduled scan ${scheduledScanId} is no longer active`);
        await this.unscheduleJob(scheduledScanId);
        return;
      }

      // Check if scan has expired
      if (scheduledScan.endDate && scheduledScan.endDate < new Date()) {
        logger.warn(`Scheduled scan ${scheduledScanId} has expired`);
        await prisma.scheduledScan.update({
          where: { id: scheduledScanId },
          data: { status: 'EXPIRED', isActive: false },
        });
        await this.unscheduleJob(scheduledScanId);
        return;
      }

      // Create execution record
      execution = await prisma.scheduledScanExecution.create({
        data: {
          scheduledScanId,
          status: 'PENDING',
        },
      });

      // Start execution
      await prisma.scheduledScanExecution.update({
        where: { id: execution.id },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      // Execute scans for each target
      let totalVulns = 0;
      const scanIds: string[] = [];

      // Scan each asset
      for (const assetId of scheduledScan.assetIds) {
        try {
          const asset = await prisma.assets.findUnique({
            where: { id: assetId },
          });

          if (!asset || !asset.url) {
            logger.warn(`Asset ${assetId} not found or has no URL`);
            continue;
          }

          // Start scan
          const scanResult = await scanService.startScan({
            target: asset.url,
            scanLevel: this.mapProfileToScanLevel(scheduledScan.scanProfile),
            assetId: asset.id,
            tenantId: scheduledScan.tenantId,
            userId: scheduledScan.createdById,
          });

          scanIds.push(scanResult.scanId);
          logger.info(`Started scan ${scanResult.scanId} for asset ${assetId}`);
        } catch (error) {
          logger.error(`Failed to scan asset ${assetId}:`, error);
        }
      }

      // Scan direct URLs
      for (const url of scheduledScan.targetUrls) {
        try {
          const scanResult = await scanService.startScan({
            target: url,
            scanLevel: this.mapProfileToScanLevel(scheduledScan.scanProfile),
            tenantId: scheduledScan.tenantId,
            userId: scheduledScan.createdById,
          });

          scanIds.push(scanResult.scanId);
          logger.info(`Started scan ${scanResult.scanId} for URL ${url}`);
        } catch (error) {
          logger.error(`Failed to scan URL ${url}:`, error);
        }
      }

      // Wait for all scans to complete (in background)
      // For now, we'll mark as completed immediately
      // In production, you'd want to track scan completion

      // Mark execution as completed
      await prisma.scheduledScanExecution.update({
        where: { id: execution.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          duration: Math.floor((Date.now() - execution.executedAt.getTime()) / 1000),
          vulnFound: totalVulns,
          scanId: scanIds.length > 0 ? scanIds[0] : null,
        },
      });

      // Update scheduled scan stats
      await prisma.scheduledScan.update({
        where: { id: scheduledScanId },
        data: {
          runCount: { increment: 1 },
          lastRunAt: new Date(),
        },
      });

      // Update next run time
      await this.updateNextRunTime(scheduledScanId);

      logger.info(`Successfully executed scheduled scan ${scheduledScanId}`);

      // Send notifications if enabled
      if (scheduledScan.notifyOnCompletion) {
        await this.sendNotification(scheduledScan, execution, 'completed');
      }
    } catch (error) {
      logger.error(`Error executing scheduled scan ${scheduledScanId}:`, error);

      // Update execution as failed
      if (execution) {
        await prisma.scheduledScanExecution.update({
          where: { id: execution.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }

      // Update fail count
      const scheduledScan = await prisma.scheduledScan.update({
        where: { id: scheduledScanId },
        data: {
          failCount: { increment: 1 },
        },
      });

      // Send failure notification
      if (scheduledScan.notifyOnFailure) {
        await this.sendNotification(scheduledScan, execution, 'failed');
      }
    }
  }

  /**
   * Get cron expression for a scheduled scan
   */
  private getCronExpression(scheduledScan: any): string | null {
    // If custom cron expression provided, use it
    if (scheduledScan.cronExpression) {
      return scheduledScan.cronExpression;
    }

    // Generate cron expression based on frequency
    switch (scheduledScan.frequency) {
      case 'HOURLY':
        return '0 * * * *'; // Every hour at minute 0
      case 'DAILY':
        return '0 0 * * *'; // Every day at midnight
      case 'WEEKLY':
        return '0 0 * * 0'; // Every Sunday at midnight
      case 'MONTHLY':
        return '0 0 1 * *'; // First day of every month at midnight
      case 'ONCE':
        // For ONCE, schedule at startDate and then disable
        return null; // Handle separately
      default:
        return null;
    }
  }

  /**
   * Update next run time for a scheduled scan
   */
  private async updateNextRunTime(scheduledScanId: string) {
    const scheduledScan = await prisma.scheduledScan.findUnique({
      where: { id: scheduledScanId },
    });

    if (!scheduledScan) return;

    const cronExpression = this.getCronExpression(scheduledScan);
    if (!cronExpression) return;

    // Calculate next run time
    // This is a simplified version - in production, use a library like cron-parser
    const nextRun = new Date(Date.now() + 60 * 60 * 1000); // Placeholder: 1 hour from now

    await prisma.scheduledScan.update({
      where: { id: scheduledScanId },
      data: { nextRunAt: nextRun },
    });
  }

  /**
   * Send notification about scan execution
   */
  private async sendNotification(
    scheduledScan: any,
    execution: any,
    status: 'completed' | 'failed'
  ) {
    const emails: string[] = scheduledScan.notifyEmails || [];

    if (emails.length === 0) {
      logger.info(`No notify emails configured for scheduled scan ${scheduledScan.id} — skipping notification`);
      return;
    }

    const platformUrl = process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}/dashboard/scans/${execution?.scanId || ''}`
      : undefined;

    await notificationService.sendScanNotification(emails, {
      scanName: scheduledScan.name,
      status,
      executionId: execution?.id,
      duration: execution?.duration,
      vulnFound: execution?.vulnFound,
      errorMessage: execution?.errorMessage,
      platformUrl,
    });
  }

  /**
   * Get status of all scheduled jobs
   */
  getJobsStatus(): Array<{ id: string; isRunning: boolean }> {
    return Array.from(this.jobs.entries()).map(([id, job]) => ({
      id,
      isRunning: true,
    }));
  }
}

export const schedulerService = new SchedulerService();
