/**
 * PDF Report Generation Service
 * Generates professional PDF reports for vulnerability scans and assessments
 */

import PDFDocument from 'pdfkit';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

interface ReportData {
  title: string;
  tenant: {
    name: string;
    domain?: string;
  };
  generatedAt: Date;
  generatedBy: {
    firstName: string;
    lastName: string;
    email: string;
  };
  summary: {
    totalAssets: number;
    totalVulnerabilities: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
    riskScore: number;
  };
  assets?: any[];
  vulnerabilities?: any[];
  scans?: any[];
}

class PDFReportService {
  private reportsDir: string;

  constructor() {
    this.reportsDir = path.join(process.cwd(), '..', '..', 'data', 'reports');
    this.ensureReportsDir();
  }

  /**
   * Ensure reports directory exists
   */
  private ensureReportsDir() {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Generate executive summary report
   */
  async generateExecutiveSummary(tenantId: string, userId: string): Promise<string> {
    logger.info(`Generating executive summary report for tenant ${tenantId}`);

    // Fetch data
    const reportData = await this.fetchExecutiveData(tenantId, userId);

    // Generate PDF
    const fileName = `executive-summary-${Date.now()}.pdf`;
    const filePath = path.join(this.reportsDir, tenantId, fileName);

    // Ensure tenant directory exists
    const tenantDir = path.join(this.reportsDir, tenantId);
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }

    await this.createExecutivePDF(reportData, filePath);

    logger.info(`Executive summary report generated: ${fileName}`);
    return fileName;
  }

  /**
   * Generate detailed vulnerability report
   */
  async generateDetailedReport(
    tenantId: string,
    userId: string,
    options?: {
      assetIds?: string[];
      severities?: string[];
      dateFrom?: Date;
      dateTo?: Date;
    }
  ): Promise<string> {
    logger.info(`Generating detailed report for tenant ${tenantId}`);

    // Fetch data
    const reportData = await this.fetchDetailedData(tenantId, userId, options);

    // Generate PDF
    const fileName = `detailed-report-${Date.now()}.pdf`;
    const filePath = path.join(this.reportsDir, tenantId, fileName);

    // Ensure tenant directory exists
    const tenantDir = path.join(this.reportsDir, tenantId);
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }

    await this.createDetailedPDF(reportData, filePath);

    logger.info(`Detailed report generated: ${fileName}`);
    return fileName;
  }

  /**
   * Fetch executive summary data
   */
  private async fetchExecutiveData(tenantId: string, userId: string): Promise<ReportData> {
    // Get tenant info
    const tenant = await prisma.tenants.findUnique({
      where: { id: tenantId },
    });

    // Get user info
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    // Get summary stats
    const totalAssets = await prisma.assets.count({
      where: { tenantId, isActive: true },
    });

    const totalVulnerabilities = await prisma.vulnerabilities.count({
      where: { tenantId },
    });

    const criticalCount = await prisma.vulnerabilities.count({
      where: { tenantId, severity: 'CRITICAL' },
    });

    const highCount = await prisma.vulnerabilities.count({
      where: { tenantId, severity: 'HIGH' },
    });

    const mediumCount = await prisma.vulnerabilities.count({
      where: { tenantId, severity: 'MEDIUM' },
    });

    const lowCount = await prisma.vulnerabilities.count({
      where: { tenantId, severity: 'LOW' },
    });

    const infoCount = await prisma.vulnerabilities.count({
      where: { tenantId, severity: 'INFO' },
    });

    // Calculate risk score (weighted by severity)
    const riskScore = criticalCount * 10 + highCount * 5 + mediumCount * 3 + lowCount * 1;

    return {
      title: 'Executive Security Summary',
      tenant: {
        name: tenant?.name || 'Unknown',
        domain: tenant?.domain,
      },
      generatedAt: new Date(),
      generatedBy: user || { firstName: 'Unknown', lastName: 'User', email: '' },
      summary: {
        totalAssets,
        totalVulnerabilities,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        infoCount,
        riskScore,
      },
    };
  }

  /**
   * Fetch detailed report data
   */
  private async fetchDetailedData(
    tenantId: string,
    userId: string,
    options?: any
  ): Promise<ReportData> {
    // Get base data
    const baseData = await this.fetchExecutiveData(tenantId, userId);

    // Build where clause for vulnerabilities
    const where: any = { tenantId };

    if (options?.assetIds && options.assetIds.length > 0) {
      where.assetId = { in: options.assetIds };
    }

    if (options?.severities && options.severities.length > 0) {
      where.severity = { in: options.severities };
    }

    if (options?.dateFrom || options?.dateTo) {
      where.discoveredAt = {};
      if (options.dateFrom) where.discoveredAt.gte = options.dateFrom;
      if (options.dateTo) where.discoveredAt.lte = options.dateTo;
    }

    // Get vulnerabilities
    const vulnerabilities = await prisma.vulnerabilities.findMany({
      where,
      include: {
        assets: {
          select: {
            name: true,
            type: true,
            hostname: true,
            ipAddress: true,
          },
        },
      },
      orderBy: [
        { severity: 'asc' }, // CRITICAL first (alphabetically)
        { cvssScore: 'desc' },
      ],
      take: 100, // Limit to 100 for report size
    });

    // Get assets
    const assets = await prisma.assets.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
        environment: true,
        criticality: true,
        vulnCount: true,
        criticalVulnCount: true,
        highVulnCount: true,
        riskScore: true,
      },
      orderBy: { riskScore: 'desc' },
      take: 20, // Top 20 assets
    });

    // Get recent scans
    const scans = await prisma.scans.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        startedAt: true,
        completedAt: true,
        vulnFound: true,
        criticalCount: true,
        highCount: true,
      },
      orderBy: { startedAt: 'desc' },
      take: 10, // Last 10 scans
    });

    return {
      ...baseData,
      title: 'Detailed Security Assessment Report',
      vulnerabilities,
      assets,
      scans,
    };
  }

  /**
   * Create executive summary PDF
   */
  private async createExecutivePDF(data: ReportData, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Header
        this.addHeader(doc, data);

        // Executive Summary Section
        doc.moveDown(2);
        doc.fontSize(20).fillColor('#22d3ee').text('Executive Summary', { underline: true });
        doc.moveDown(1);

        // Key Metrics
        doc.fontSize(14).fillColor('#000000').text('Security Posture Overview', { underline: true });
        doc.moveDown(0.5);

        doc.fontSize(11);
        doc.text(`Total Assets Under Management: ${data.summary.totalAssets}`);
        doc.text(`Total Vulnerabilities Identified: ${data.summary.totalVulnerabilities}`);
        doc.text(`Overall Risk Score: ${data.summary.riskScore}`);
        doc.moveDown(1);

        // Severity Breakdown
        doc.fontSize(14).fillColor('#000000').text('Vulnerability Severity Distribution', { underline: true });
        doc.moveDown(0.5);

        doc.fontSize(11);
        doc.fillColor('#dc2626').text(`Critical: ${data.summary.criticalCount}`, { continued: true });
        doc.fillColor('#000000').text(` (Immediate action required)`);

        doc.fillColor('#ea580c').text(`High: ${data.summary.highCount}`, { continued: true });
        doc.fillColor('#000000').text(` (Address within 7 days)`);

        doc.fillColor('#f59e0b').text(`Medium: ${data.summary.mediumCount}`, { continued: true });
        doc.fillColor('#000000').text(` (Address within 30 days)`);

        doc.fillColor('#3b82f6').text(`Low: ${data.summary.lowCount}`, { continued: true });
        doc.fillColor('#000000').text(` (Address as resources allow)`);

        doc.fillColor('#6b7280').text(`Informational: ${data.summary.infoCount}`);
        doc.moveDown(2);

        // Recommendations
        doc.fontSize(14).fillColor('#000000').text('Key Recommendations', { underline: true });
        doc.moveDown(0.5);

        doc.fontSize(11);
        if (data.summary.criticalCount > 0) {
          doc.fillColor('#dc2626')
            .text('• ', { continued: true })
            .fillColor('#000000')
            .text(`Immediate remediation required for ${data.summary.criticalCount} critical vulnerabilities`);
        }

        if (data.summary.highCount > 0) {
          doc.fillColor('#ea580c')
            .text('• ', { continued: true })
            .fillColor('#000000')
            .text(`Priority remediation of ${data.summary.highCount} high-severity findings within one week`);
        }

        doc.text('• Implement continuous monitoring and regular vulnerability assessments');
        doc.text('• Review and update security policies based on identified risks');
        doc.text('• Consider scheduling regular penetration tests for critical assets');

        // Footer
        this.addFooter(doc, data);

        doc.end();

        stream.on('finish', resolve);
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Create detailed vulnerability PDF
   */
  private async createDetailedPDF(data: ReportData, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Header
        this.addHeader(doc, data);

        // Table of Contents
        doc.moveDown(2);
        doc.fontSize(18).fillColor('#22d3ee').text('Table of Contents', { underline: true });
        doc.moveDown(1);
        doc.fontSize(11).fillColor('#000000');
        doc.text('1. Executive Summary');
        doc.text('2. Asset Overview');
        doc.text('3. Vulnerability Details');
        doc.text('4. Recent Scan Activity');
        doc.text('5. Recommendations');

        // New Page - Executive Summary
        doc.addPage();
        doc.fontSize(18).fillColor('#22d3ee').text('1. Executive Summary', { underline: true });
        doc.moveDown(1);

        doc.fontSize(11).fillColor('#000000');
        doc.text(`Total Assets: ${data.summary.totalAssets}`);
        doc.text(`Total Vulnerabilities: ${data.summary.totalVulnerabilities}`);
        doc.text(`Risk Score: ${data.summary.riskScore}`);
        doc.moveDown(1);

        doc.text('Severity Distribution:');
        doc.fillColor('#dc2626').text(`  Critical: ${data.summary.criticalCount}`);
        doc.fillColor('#ea580c').text(`  High: ${data.summary.highCount}`);
        doc.fillColor('#f59e0b').text(`  Medium: ${data.summary.mediumCount}`);
        doc.fillColor('#3b82f6').text(`  Low: ${data.summary.lowCount}`);
        doc.fillColor('#6b7280').text(`  Info: ${data.summary.infoCount}`);

        // Assets Section
        if (data.assets && data.assets.length > 0) {
          doc.addPage();
          doc.fontSize(18).fillColor('#22d3ee').text('2. Asset Overview', { underline: true });
          doc.moveDown(1);

          doc.fontSize(11).fillColor('#000000');
          data.assets.forEach((asset, index) => {
            if (index > 0 && index % 10 === 0) doc.addPage();

            doc.font('Helvetica-Bold').text(`${asset.name}`, { continued: true });
            doc.font('Helvetica').text(` (${asset.type})`);
            doc.fontSize(10);
            doc.text(`  Environment: ${asset.environment} | Criticality: ${asset.criticality}`);
            doc.text(`  Vulnerabilities: ${asset.vulnCount} (${asset.criticalVulnCount} Critical, ${asset.highVulnCount} High)`);
            doc.text(`  Risk Score: ${asset.riskScore}`);
            doc.moveDown(0.5);
            doc.fontSize(11);
          });
        }

        // Vulnerabilities Section
        if (data.vulnerabilities && data.vulnerabilities.length > 0) {
          doc.addPage();
          doc.fontSize(18).fillColor('#22d3ee').text('3. Vulnerability Details', { underline: true });
          doc.moveDown(1);

          data.vulnerabilities.forEach((vuln, index) => {
            if (index > 0 && index % 5 === 0) doc.addPage();

            // Severity color
            const severityColors: Record<string, string> = {
              CRITICAL: '#dc2626',
              HIGH: '#ea580c',
              MEDIUM: '#f59e0b',
              LOW: '#3b82f6',
              INFO: '#6b7280',
            };

            doc.fontSize(12)
              .fillColor(severityColors[vuln.severity] || '#000000')
              .text(`[${vuln.severity}] `, { continued: true })
              .fillColor('#000000')
              .text(vuln.title);

            doc.fontSize(10);
            doc.text(`Asset: ${vuln.asset?.name || 'Unknown'}`);
            doc.text(`Type: ${vuln.type}`);
            if (vuln.cvssScore) doc.text(`CVSS Score: ${vuln.cvssScore}`);
            if (vuln.cveId) doc.text(`CVE: ${vuln.cveId}`);

            if (vuln.description) {
              doc.text(`Description: ${vuln.description.substring(0, 200)}${vuln.description.length > 200 ? '...' : ''}`);
            }

            doc.text(`Status: ${vuln.status}`);
            doc.moveDown(1);
          });
        }

        // Scans Section
        if (data.scans && data.scans.length > 0) {
          doc.addPage();
          doc.fontSize(18).fillColor('#22d3ee').text('4. Recent Scan Activity', { underline: true });
          doc.moveDown(1);

          doc.fontSize(11).fillColor('#000000');
          data.scans.forEach((scan) => {
            doc.text(`${scan.name} - ${scan.status}`);
            doc.fontSize(10);
            if (scan.startedAt) {
              doc.text(`  Started: ${new Date(scan.startedAt).toLocaleString()}`);
            }
            if (scan.completedAt) {
              doc.text(`  Completed: ${new Date(scan.completedAt).toLocaleString()}`);
            }
            doc.text(`  Vulnerabilities Found: ${scan.vulnFound} (${scan.criticalCount} Critical, ${scan.highCount} High)`);
            doc.moveDown(0.5);
            doc.fontSize(11);
          });
        }

        // Footer
        this.addFooter(doc, data);

        doc.end();

        stream.on('finish', resolve);
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Add header to PDF
   */
  private addHeader(doc: typeof PDFDocument.prototype, data: ReportData) {
    // Title
    doc.fontSize(24).fillColor('#22d3ee').text(data.title, { align: 'center' });
    doc.moveDown(0.5);

    // Tenant info
    doc.fontSize(14).fillColor('#6b7280').text(data.tenant.name, { align: 'center' });
    if (data.tenant.domain) {
      doc.fontSize(11).text(data.tenant.domain, { align: 'center' });
    }
    doc.moveDown(1);

    // Report metadata
    doc.fontSize(10).fillColor('#000000');
    doc.text(`Generated: ${data.generatedAt.toLocaleString()}`, { align: 'right' });
    doc.text(`By: ${data.generatedBy.firstName} ${data.generatedBy.lastName}`, { align: 'right' });

    // Divider
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e5e7eb');
  }

  /**
   * Add footer to PDF
   */
  private addFooter(doc: typeof PDFDocument.prototype, data: ReportData) {
    const bottomMargin = 50;
    const pageHeight = doc.page.height;

    doc.fontSize(8)
      .fillColor('#6b7280')
      .text(
        'Confidential - Generated by Spectra Security Platform',
        50,
        pageHeight - bottomMargin,
        { align: 'center' }
      );
  }

  /**
   * Get report file path
   */
  getReportPath(tenantId: string, fileName: string): string {
    return path.join(this.reportsDir, tenantId, fileName);
  }

  /**
   * Delete report file
   */
  async deleteReport(tenantId: string, fileName: string): Promise<void> {
    const filePath = this.getReportPath(tenantId, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Deleted report: ${fileName}`);
    }
  }
}

export const pdfReportService = new PDFReportService();
