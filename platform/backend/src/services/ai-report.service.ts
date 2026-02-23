/**
 * AI Report Generation Service
 * Uses Ollama/Llama to generate comprehensive security assessment reports
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { Severity } from '@prisma/client';

interface ReportData {
  scans: any[];
  vulnerabilities: any[];
  assets: any[];
  summary: {
    totalScans: number;
    totalVulnerabilities: number;
    totalAssets: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
  };
}

export class AIReportService {
  private ollamaUrl: string;
  private model: string;
  private timeout: number;
  private enabled: boolean;

  constructor() {
    this.ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/generate';
    this.model = process.env.OLLAMA_MODEL || 'hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16';
    this.timeout = parseInt(process.env.OLLAMA_TIMEOUT || '60000'); // 60s for reports
    this.enabled = process.env.AI_ANALYSIS_ENABLED !== 'false';
  }

  /**
   * Generate comprehensive security report
   */
  async generateReport(
    tenantId: string,
    scanIds: string[],
    reportName: string
  ): Promise<string> {
    // Gather data
    const data = await this.gatherReportData(tenantId, scanIds);

    // Generate report sections using AI in parallel for speed
    const [executiveSummary, recommendations] = await Promise.all([
      this.generateExecutiveSummary(data),
      this.generateRecommendations(data),
    ]);

    const technicalFindings = await this.generateTechnicalFindings(data);

    // Build HTML report
    return this.buildHTMLReport(reportName, data, {
      executiveSummary,
      technicalFindings,
      recommendations,
    });
  }

  /**
   * Gather all necessary data for the report
   */
  private async gatherReportData(
    tenantId: string,
    scanIds: string[]
  ): Promise<ReportData> {
    const scans = await prisma.scans.findMany({
      where: { id: { in: scanIds }, tenantId },
      include: { assets: true },
    });

    const vulnerabilities = await prisma.vulnerabilities.findMany({
      where: { scanId: { in: scanIds }, tenantId },
      include: {
        assets: true,
        evidence: true,
      },
      orderBy: [
        { severity: 'asc' },
        { cvssScore: 'desc' },
      ],
    });

    const assetIds = [...new Set(scans.map(s => s.assetId).filter(Boolean))];
    const assets = await prisma.assets.findMany({
      where: { id: { in: assetIds as string[] }, tenantId },
    });

    const summary = {
      totalScans: scans.length,
      totalVulnerabilities: vulnerabilities.length,
      totalAssets: assets.length,
      criticalCount: vulnerabilities.filter(v => v.severity === 'CRITICAL').length,
      highCount: vulnerabilities.filter(v => v.severity === 'HIGH').length,
      mediumCount: vulnerabilities.filter(v => v.severity === 'MEDIUM').length,
      lowCount: vulnerabilities.filter(v => v.severity === 'LOW').length,
      infoCount: vulnerabilities.filter(v => v.severity === 'INFO').length,
    };

    return { scans, vulnerabilities, assets, summary };
  }

  /**
   * Generate executive summary using AI
   */
  private async generateExecutiveSummary(data: ReportData): Promise<string> {
    const assetNames = data.assets.map(a => a.name).join(', ');
    const topVulnDetails = data.vulnerabilities.slice(0, 5).map((v, i) =>
      `${i + 1}. ${v.title} on ${v.assets.name} (${v.severity})`
    ).join('\n');

    const prompt = `You are a senior cybersecurity consultant writing a final, production-ready executive summary for a security assessment report.

IMPORTANT INSTRUCTIONS:
- Do NOT use any placeholders like [Asset Name], [Company Name], or [Date]
- Use ONLY the specific information provided below
- Write in final, production-ready language suitable for immediate delivery to executives
- Avoid draft language like "may", "could potentially", "would recommend" - be direct and definitive

Assessment Scope:
- Scans Performed: ${data.summary.totalScans}
- Assets Assessed: ${data.summary.totalAssets} (${assetNames})
- Total Findings: ${data.summary.totalVulnerabilities}

Findings Breakdown:
- Critical: ${data.summary.criticalCount}
- High: ${data.summary.highCount}
- Medium: ${data.summary.mediumCount}
- Low: ${data.summary.lowCount}
- Informational: ${data.summary.infoCount}

Top Vulnerabilities Found:
${topVulnDetails}

Write a concise executive summary (3-4 paragraphs) that:
1. Provides an overview of the security assessment with specific asset names
2. Highlights the most critical findings and their business impact
3. Summarizes the overall security posture
4. Makes a clear call to action for stakeholders

Use professional, business-friendly language suitable for C-level executives.`;

    if (!this.enabled) {
      return this.generateFallbackExecutiveSummary(data);
    }

    try {
      const response = await this.callOllama(prompt);
      return response || this.generateFallbackExecutiveSummary(data);
    } catch (error) {
      logger.error('Failed to generate executive summary:', error);
      return this.generateFallbackExecutiveSummary(data);
    }
  }

  /**
   * Generate technical findings section with complete vulnerability details
   */
  private async generateTechnicalFindings(data: ReportData): Promise<string> {
    if (data.vulnerabilities.length === 0) {
      return '<p>No vulnerabilities were identified during this assessment.</p>';
    }

    let html = '<p style="color: #666; margin-bottom: 20px;">Click on any finding to expand and view detailed information</p>';

    let vulnIndex = 0;

    // Helper function to render a collapsible vulnerability card
    const renderVulnerabilityCard = (v: any, globalIndex: number) => {
      const severityClass = v.severity.toLowerCase();
      const badgeClass = `badge-${severityClass}`;
      const cardClass = `severity-${severityClass}`;

      const evidence = v.evidence || [];
      const hasEvidence = evidence.length > 0;

      // Build evidence HTML
      let evidenceHtml = '';
      if (hasEvidence) {
        evidenceHtml = `
          <details>
            <summary>🔍 Show Evidence (${evidence.length})</summary>
            <div style="margin-top: 10px;">
        `;

        evidence.forEach((e: any) => {
          const evidenceType = e.type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
          evidenceHtml += `
            <div class="evidence-section">
              <strong>${evidenceType}:</strong>
              ${e.description ? `<p style="color: #666; margin: 5px 0;">${this.escapeHtml(e.description)}</p>` : ''}
              ${e.content ? `<pre>${this.escapeHtml(e.content)}</pre>` : ''}
            </div>
          `;
        });

        evidenceHtml += '</div></details>';
      }

      return `
        <div class="vuln-card ${cardClass}">
          <div class="vuln-header" onclick="toggleDetails(${globalIndex})">
            <div>
              <h3 style="margin: 0;">
                <span class="collapse-icon" id="icon-${globalIndex}">▶</span>
                ${this.escapeHtml(v.title)}
              </h3>
            </div>
            <div>
              <span class="severity-badge ${badgeClass}">${v.severity}</span>
            </div>
          </div>

          <div class="vuln-details" id="details-${globalIndex}">
            <div class="description-box">
              <strong>Description:</strong><br>
              ${this.escapeHtml(v.description)}
            </div>

            ${v.matchedAt ? `
              <div style="margin-top: 15px;">
                <strong>Affected URL:</strong><br>
                <a href="${v.matchedAt}" target="_blank" class="url-link">${v.matchedAt}</a>
              </div>
            ` : ''}

            <div style="margin-top: 15px;">
              <strong>Asset:</strong> ${this.escapeHtml(v.assets.name)} (${this.escapeHtml(v.assets.type)})
            </div>

            ${v.cvssScore ? `
              <div style="margin-top: 15px;">
                <strong>CVSS Score:</strong> ${v.cvssScore.toFixed(1)}
              </div>
            ` : ''}

            ${v.cveId ? `
              <div style="margin-top: 15px;">
                <strong>CVE ID:</strong> <code>${this.escapeHtml(v.cveId)}</code>
              </div>
            ` : ''}

            ${v.templateId ? `
              <div style="margin-top: 15px;">
                <strong>Template ID:</strong> <code>${this.escapeHtml(v.templateId)}</code>
              </div>
            ` : ''}

            ${v.recommendation ? `
              <div style="margin-top: 15px;">
                <div style="background: #e7f5ff; padding: 15px; border-radius: 5px; border-left: 3px solid #1e88e5;">
                  <strong>Remediation:</strong><br>
                  ${this.escapeHtml(v.recommendation)}
                </div>
              </div>
            ` : ''}

            ${evidenceHtml}
          </div>
        </div>
      `;
    };

    // Render all vulnerabilities as collapsible cards
    data.vulnerabilities.forEach((v) => {
      html += renderVulnerabilityCard(v, vulnIndex);
      vulnIndex++;
    });

    return html;
  }

  /**
   * Escape HTML to prevent injection in reports
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Generate recommendations using AI
   */
  private async generateRecommendations(data: ReportData): Promise<string> {
    const topVulns = data.vulnerabilities
      .filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH')
      .slice(0, 10);

    const prompt = `You are a cybersecurity consultant providing strategic recommendations.

Based on this security assessment with ${data.summary.criticalCount} critical and ${data.summary.highCount} high severity findings, provide 5-7 prioritized strategic recommendations.

Top Issues Found:
${topVulns.map((v, i) => `${i + 1}. ${v.title} (${v.severity})`).join('\n')}

Provide recommendations that:
1. Are prioritized by impact and effort
2. Include both immediate and long-term actions
3. Address systemic issues, not just individual vulnerabilities
4. Are actionable and specific

Format as numbered list with brief explanation for each.`;

    if (!this.enabled) {
      return this.generateFallbackRecommendations(data);
    }

    try {
      const response = await this.callOllama(prompt);
      return this.formatRecommendations(response || this.generateFallbackRecommendations(data));
    } catch (error) {
      logger.error('Failed to generate recommendations:', error);
      return this.generateFallbackRecommendations(data);
    }
  }

  /**
   * Call Ollama API
   */
  private async callOllama(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: { temperature: 0.7, top_p: 0.9 },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      return data.response || '';
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Ollama request timed out');
      }
      throw error;
    }
  }

  /**
   * Build complete HTML report
   */
  private buildHTMLReport(
    name: string,
    data: ReportData,
    sections: {
      executiveSummary: string;
      technicalFindings: string;
      recommendations: string;
    }
  ): string {
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} - Security Assessment Report</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; max-width: 1400px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }
    .header h1 { margin: 0; font-size: 2em; }
    .header p { margin: 10px 0 0; opacity: 0.9; }
    .target-info { background: rgba(255,255,255,0.1); padding: 15px; border-radius: 5px; margin-top: 15px; }
    .section { background: white; padding: 25px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .risk-score { font-size: 48px; font-weight: bold; text-align: center; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .critical { background: #a855f7; color: white; }
    .high { background: #ef4444; color: white; }
    .medium { background: #f59e0b; color: white; }
    .low { background: #eab308; color: white; }
    .info { background: #3b82f6; color: white; }
    .vuln-card { border-left: 4px solid #667eea; padding: 20px; margin: 15px 0; background: #f8f9fa; border-radius: 5px; }
    .severity-critical { border-left-color: #a855f7; }
    .severity-high { border-left-color: #ef4444; }
    .severity-medium { border-left-color: #f59e0b; }
    .severity-low { border-left-color: #eab308; }
    .severity-info { border-left-color: #3b82f6; }
    .vuln-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
    .vuln-header:hover { opacity: 0.8; }
    .severity-badge { display: inline-block; padding: 5px 12px; border-radius: 15px; font-weight: bold; font-size: 12px; text-transform: uppercase; margin-left: 10px; }
    .badge-critical { background: #a855f7; color: white; }
    .badge-high { background: #ef4444; color: white; }
    .badge-medium { background: #f59e0b; color: white; }
    .badge-low { background: #eab308; color: white; }
    .badge-info { background: #3b82f6; color: white; }
    .collapse-icon { font-size: 20px; transition: transform 0.3s; display: inline-block; margin-right: 10px; }
    .collapse-icon.expanded { transform: rotate(90deg); }
    .vuln-details { margin-top: 15px; display: none; }
    .vuln-details.show { display: block; }
    .description-box { background: #e8eaf6; padding: 15px; border-radius: 5px; margin: 10px 0; }
    .url-link { color: #667eea; text-decoration: none; word-break: break-all; font-family: 'Courier New', monospace; }
    .url-link:hover { text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #667eea; color: white; }
    details { cursor: pointer; margin-top: 10px; background: #f8f9fa; padding: 10px; border-radius: 3px; border: 1px solid #dee2e6; }
    details summary::-webkit-details-marker { display: none; }
    details[open] summary { margin-bottom: 10px; }
    details summary { cursor: pointer; font-weight: bold; color: #667eea; }
    pre { white-space: pre-wrap; word-wrap: break-word; background: #fff; padding: 10px; border-left: 3px solid #667eea; overflow-x: auto; font-size: 12px; margin-top: 5px; }
    .evidence-section { background: white; padding: 12px; margin: 8px 0; border-left: 3px solid #667eea; border-radius: 3px; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 0.9em; }
  </style>
  <script>
    function toggleDetails(id) {
      const details = document.getElementById('details-' + id);
      const icon = document.getElementById('icon-' + id);
      if (details.classList.contains('show')) {
        details.classList.remove('show');
        icon.classList.remove('expanded');
      } else {
        details.classList.add('show');
        icon.classList.add('expanded');
      }
    }
  </script>
</head>
<body>
  <div class="header">
    <h1>🛡️ Spectra Security Assessment Report</h1>
    <p><strong>Report Name:</strong> ${name}</p>
    <p><strong>Generated:</strong> ${date}</p>
    <div class="target-info">
      <div style="font-size: 14px; margin-bottom: 5px;">Assessment Scope:</div>
      <div style="font-size: 18px; font-weight: bold;">${data.summary.totalScans} Scan${data.summary.totalScans !== 1 ? 's' : ''} • ${data.summary.totalAssets} Asset${data.summary.totalAssets !== 1 ? 's' : ''}</div>
    </div>
  </div>

  <div class="section">
    <h2>Risk Assessment</h2>
    <div class="risk-score ${this.getRiskClass(data.summary)}">
      ${this.calculateOverallRisk(data.summary)}/100
    </div>
    <p style="text-align: center; font-size: 18px;">
      <strong>${data.summary.totalVulnerabilities}</strong> vulnerabilities found
    </p>
  </div>

  <div class="section">
    <h2>Vulnerability Breakdown</h2>
    <table>
      <tr>
        <th>Severity</th>
        <th>Count</th>
        <th>Percentage</th>
      </tr>
      ${data.summary.criticalCount > 0 ? `<tr><td class="badge-critical" style="color: white;">Critical</td><td>${data.summary.criticalCount}</td><td>${((data.summary.criticalCount / data.summary.totalVulnerabilities) * 100).toFixed(1)}%</td></tr>` : ''}
      ${data.summary.highCount > 0 ? `<tr><td class="badge-high" style="color: white;">High</td><td>${data.summary.highCount}</td><td>${((data.summary.highCount / data.summary.totalVulnerabilities) * 100).toFixed(1)}%</td></tr>` : ''}
      ${data.summary.mediumCount > 0 ? `<tr><td class="badge-medium" style="color: white;">Medium</td><td>${data.summary.mediumCount}</td><td>${((data.summary.mediumCount / data.summary.totalVulnerabilities) * 100).toFixed(1)}%</td></tr>` : ''}
      ${data.summary.lowCount > 0 ? `<tr><td class="badge-low" style="color: white;">Low</td><td>${data.summary.lowCount}</td><td>${((data.summary.lowCount / data.summary.totalVulnerabilities) * 100).toFixed(1)}%</td></tr>` : ''}
      ${data.summary.infoCount > 0 ? `<tr><td class="badge-info" style="color: white;">Informational</td><td>${data.summary.infoCount}</td><td>${((data.summary.infoCount / data.summary.totalVulnerabilities) * 100).toFixed(1)}%</td></tr>` : ''}
    </table>
  </div>

  <div class="section">
    <h2>📋 Executive Summary</h2>
    <pre style="white-space: pre-wrap; background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 3px solid #667eea;">${sections.executiveSummary}</pre>
  </div>

  <div class="section">
    <h2>✅ Strategic Recommendations</h2>
    ${sections.recommendations}
  </div>

  <div class="section">
    <h2>🔍 Detailed Findings</h2>
    ${sections.technicalFindings}
  </div>

  <div class="footer">
    <p>Report generated by Spectra Security Platform • Powered by AI Analysis</p>
    <p>© ${new Date().getFullYear()} • Confidential and Proprietary</p>
  </div>
</body>
</html>`;
  }

  private generateFallbackExecutiveSummary(data: ReportData): string {
    const assetNames = data.assets.map(a => a.name).join(', ');
    const topVulns = data.vulnerabilities.slice(0, 3).map(v => `${v.title} on ${v.assets.name}`).join('; ');

    return `
      <p>This security assessment evaluated ${data.summary.totalAssets} assets (${assetNames}) through ${data.summary.totalScans} comprehensive scans, identifying ${data.summary.totalVulnerabilities} total security findings across all severity levels.</p>
      <p>The assessment revealed ${data.summary.criticalCount} critical and ${data.summary.highCount} high severity vulnerabilities that require immediate attention. Key findings include: ${topVulns}. These vulnerabilities represent significant security risks that must be addressed to prevent potential exploitation by threat actors.</p>
      <p>The overall security posture requires immediate remediation action, particularly for the critical and high severity findings. Priority must be given to addressing these vulnerabilities within the next 7-30 days based on severity level.</p>
      <p>The organization must establish a structured vulnerability management program with defined SLAs for remediation based on severity levels, along with regular security assessments to maintain a strong security posture.</p>
    `;
  }

  private generateFallbackRecommendations(data: ReportData): string {
    return `
      <ol>
        <li><strong>Immediate Remediation:</strong> Address all ${data.summary.criticalCount} critical vulnerabilities within 7 days as they pose immediate risk to the organization.</li>
        <li><strong>High Priority Fixes:</strong> Remediate ${data.summary.highCount} high severity findings within 30 days to significantly reduce risk exposure.</li>
        <li><strong>Vulnerability Management Program:</strong> Establish formal processes for tracking, prioritizing, and remediating security findings.</li>
        <li><strong>Security Awareness Training:</strong> Implement regular training programs to reduce human-factor vulnerabilities.</li>
        <li><strong>Patch Management:</strong> Implement automated patch management to ensure timely updates of all systems and applications.</li>
        <li><strong>Security Monitoring:</strong> Deploy continuous monitoring solutions to detect and respond to security incidents in real-time.</li>
        <li><strong>Regular Assessments:</strong> Conduct quarterly security assessments to maintain visibility into your security posture.</li>
      </ol>
    `;
  }

  private formatRecommendations(text: string): string {
    // If already formatted as HTML, return as-is
    if (text.includes('<ol>') || text.includes('<li>')) {
      return text;
    }

    // Convert numbered list to HTML
    const lines = text.split('\n').filter(line => line.trim());
    let html = '<ol style="line-height: 1.8;">';

    for (const line of lines) {
      const match = line.match(/^\d+\.\s*(.+)$/);
      if (match) {
        html += `<li style="margin-bottom: 10px;">${match[1]}</li>`;
      }
    }

    html += '</ol>';
    return html;
  }

  /**
   * Calculate overall risk score based on vulnerability counts
   */
  private calculateOverallRisk(summary: any): number {
    const weights = {
      critical: 40,
      high: 25,
      medium: 15,
      low: 5,
      info: 1
    };

    const totalWeight =
      (summary.criticalCount * weights.critical) +
      (summary.highCount * weights.high) +
      (summary.mediumCount * weights.medium) +
      (summary.lowCount * weights.low) +
      (summary.infoCount * weights.info);

    // Normalize to 0-100 scale
    const maxScore = 100;
    const score = Math.min(totalWeight, maxScore);

    return Math.round(score);
  }

  /**
   * Get risk class for styling
   */
  private getRiskClass(summary: any): string {
    const score = this.calculateOverallRisk(summary);

    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'info';
  }
}
