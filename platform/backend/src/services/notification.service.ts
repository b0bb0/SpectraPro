/**
 * Notification Service
 * Handles email notifications for scheduled scans and system events.
 * Gracefully falls back to logging when SMTP is not configured.
 */

import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../utils/logger';

interface NotificationPayload {
  to: string[];
  subject: string;
  body: string;
  html?: string;
}

interface ScanNotificationData {
  scanName: string;
  status: 'completed' | 'failed';
  executionId?: string;
  duration?: number;
  vulnFound?: number;
  errorMessage?: string;
  scanIds?: string[];
  platformUrl?: string;
}

class NotificationService {
  private transporter: Transporter | null = null;
  private fromAddress: string;
  private isConfigured: boolean = false;

  constructor() {
    this.fromAddress = process.env.SMTP_FROM || 'spectra@localhost';
    this.init();
  }

  private init() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host) {
      logger.info('SMTP not configured — email notifications disabled (set SMTP_HOST to enable)');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });

      this.isConfigured = true;
      logger.info(`Email notifications enabled via ${host}:${port}`);
    } catch (error: any) {
      logger.error(`Failed to initialize SMTP transport: ${error.message}`);
    }
  }

  /**
   * Send a raw notification. Falls back to logging if SMTP not configured.
   */
  async send(payload: NotificationPayload): Promise<boolean> {
    if (payload.to.length === 0) {
      logger.debug('No recipients for notification — skipping');
      return false;
    }

    if (!this.isConfigured || !this.transporter) {
      logger.info(`[Notification] To: ${payload.to.join(', ')} | Subject: ${payload.subject}`);
      logger.info(`[Notification] Body: ${payload.body}`);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: payload.to.join(', '),
        subject: payload.subject,
        text: payload.body,
        html: payload.html,
      });

      logger.info(`Email sent to ${payload.to.join(', ')}: ${payload.subject}`);
      return true;
    } catch (error: any) {
      logger.error(`Failed to send email to ${payload.to.join(', ')}: ${error.message}`);
      return false;
    }
  }

  /**
   * Send a scheduled scan notification (completion or failure).
   */
  async sendScanNotification(emails: string[], data: ScanNotificationData): Promise<boolean> {
    const isSuccess = data.status === 'completed';
    const statusLabel = isSuccess ? 'Completed' : 'Failed';
    const subject = `[Spectra] Scheduled Scan "${data.scanName}" ${statusLabel}`;

    const lines = [
      `Scheduled scan "${data.scanName}" has ${data.status}.`,
      '',
    ];

    if (isSuccess) {
      if (data.duration != null) lines.push(`Duration: ${data.duration}s`);
      if (data.vulnFound != null) lines.push(`Vulnerabilities found: ${data.vulnFound}`);
      if (data.scanIds && data.scanIds.length > 0) {
        lines.push(`Scan IDs: ${data.scanIds.join(', ')}`);
      }
    } else {
      if (data.errorMessage) lines.push(`Error: ${data.errorMessage}`);
    }

    if (data.platformUrl) {
      lines.push('', `View results: ${data.platformUrl}`);
    }

    lines.push('', '— Spectra Platform');

    const body = lines.join('\n');

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${isSuccess ? '#059669' : '#dc2626'}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Scheduled Scan ${statusLabel}</h2>
        </div>
        <div style="background: #1a1a2e; color: #e0e0e0; padding: 24px; border-radius: 0 0 8px 8px;">
          <p><strong>${data.scanName}</strong></p>
          ${isSuccess ? `
            ${data.duration != null ? `<p>Duration: ${data.duration}s</p>` : ''}
            ${data.vulnFound != null ? `<p>Vulnerabilities found: <strong>${data.vulnFound}</strong></p>` : ''}
          ` : `
            ${data.errorMessage ? `<p style="color: #fca5a5;">Error: ${data.errorMessage}</p>` : ''}
          `}
          ${data.platformUrl ? `<p><a href="${data.platformUrl}" style="color: #60a5fa;">View Results</a></p>` : ''}
          <hr style="border-color: #333; margin: 16px 0;">
          <p style="color: #888; font-size: 12px;">Spectra Platform</p>
        </div>
      </div>
    `;

    return this.send({ to: emails, subject, body, html });
  }
}

export const notificationService = new NotificationService();
