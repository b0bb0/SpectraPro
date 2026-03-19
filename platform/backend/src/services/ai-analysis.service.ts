/**
 * AI Analysis Service
 * Handles vulnerability analysis using Ollama/Llama LLM
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { Severity } from '@prisma/client';

interface AnalysisResult {
  analysis: string;
  recommendations: string[];
  riskScore: number;
}

interface Vulnerability {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  cvssScore?: number | null;
  cveId?: string | null;
  category?: string | null;
  tags?: string[];
}

export class AIAnalysisService {
  private ollamaUrl: string;
  private model: string;
  private timeout: number;
  private enabled: boolean;

  constructor() {
    this.ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/generate';
    this.model = process.env.OLLAMA_MODEL || 'hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16';
    this.timeout = parseInt(process.env.OLLAMA_TIMEOUT || '30000');
    this.enabled = process.env.AI_ANALYSIS_ENABLED !== 'false';
  }

  /**
   * Analyze a single vulnerability
   */
  async analyzeVulnerability(vuln: Vulnerability): Promise<AnalysisResult> {
    if (!this.enabled) {
      return this.generateFallbackAnalysis(vuln);
    }

    try {
      const prompt = this.generatePrompt(vuln);
      const response = await this.callOllama(prompt);
      return this.parseAnalysisResponse(response, vuln);
    } catch (error: any) {
      logger.error(`AI analysis failed for ${vuln.id}: ${error.message}`);
      return this.generateFallbackAnalysis(vuln);
    }
  }

  /**
   * Analyze multiple vulnerabilities and store results
   */
  async analyzeMultipleVulnerabilities(vulns: Vulnerability[]): Promise<void> {
    logger.info(`Starting AI analysis for ${vulns.length} vulnerabilities`);

    for (const vuln of vulns) {
      try {
        const analysis = await this.analyzeVulnerability(vuln);

        await prisma.vulnerabilities.update({
          where: { id: vuln.id },
          data: {
            aiAnalysis: analysis.analysis,
            aiRecommendations: analysis.recommendations,
            riskScore: analysis.riskScore,
            analyzedAt: new Date(),
            analysisVersion: this.model,
          },
        });

        logger.info(`Analyzed vulnerability ${vuln.id} - Risk: ${analysis.riskScore}`);
      } catch (error: any) {
        logger.error(`Failed to analyze and store ${vuln.id}: ${error.message}`);
      }
    }

    logger.info(`Completed AI analysis for ${vulns.length} vulnerabilities`);
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.response || '';
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Ollama API request timed out');
      }
      throw error;
    }
  }

  /**
   * Generate analysis prompt
   */
  private generatePrompt(vuln: Vulnerability): string {
    const severityText = vuln.severity.toLowerCase();
    const cvssInfo = vuln.cvssScore ? ` with CVSS score ${vuln.cvssScore.toFixed(1)}` : '';
    const cveInfo = vuln.cveId ? ` (${vuln.cveId})` : '';

    return `You are a cybersecurity expert analyzing a vulnerability. Provide a concise analysis.

Vulnerability: ${vuln.title}${cveInfo}
Severity: ${severityText}${cvssInfo}
Description: ${vuln.description}
${vuln.category ? `Category: ${vuln.category}` : ''}
${vuln.tags && vuln.tags.length > 0 ? `Tags: ${vuln.tags.join(', ')}` : ''}

Provide:
1. ANALYSIS: A brief analysis of the security impact and potential exploitation (2-3 sentences)
2. RECOMMENDATIONS: List 3-5 specific, actionable steps to remediate this vulnerability (one per line, numbered)

Format your response exactly as:
ANALYSIS:
[Your analysis here]

RECOMMENDATIONS:
1. [First recommendation]
2. [Second recommendation]
3. [Third recommendation]
[etc.]`;
  }

  /**
   * Parse AI response
   */
  private parseAnalysisResponse(response: string, vuln: Vulnerability): AnalysisResult {
    let analysis = '';
    let recommendations: string[] = [];

    try {
      // Split response into analysis and recommendations sections
      const sections = response.split(/RECOMMENDATIONS?:/i);

      if (sections.length > 0) {
        const analysisSection = sections[0].replace(/ANALYSIS?:/i, '').trim();
        analysis = analysisSection;
      }

      if (sections.length > 1) {
        const recsSection = sections[1].trim();
        // Extract numbered recommendations
        const matches = recsSection.match(/^\d+\.\s*(.+)$/gm);
        if (matches) {
          recommendations = matches.map(line => line.replace(/^\d+\.\s*/, '').trim());
        }
      }

      // Fallback if parsing failed
      if (!analysis) {
        analysis = response.substring(0, 500);
      }

      if (recommendations.length === 0) {
        recommendations = this.generateDefaultRecommendations(vuln);
      }
    } catch (error) {
      logger.error('Failed to parse AI response, using defaults');
      analysis = response.substring(0, 500);
      recommendations = this.generateDefaultRecommendations(vuln);
    }

    const riskScore = this.calculateRiskScore(vuln);

    return {
      analysis,
      recommendations,
      riskScore,
    };
  }

  /**
   * Calculate risk score based on severity and CVSS
   */
  private calculateRiskScore(vuln: Vulnerability): number {
    // Base score from CVSS if available
    if (vuln.cvssScore) {
      return vuln.cvssScore * 10; // Convert 0-10 to 0-100
    }

    // Otherwise base on severity
    const severityScores: Record<string, number> = {
      CRITICAL: 95,
      HIGH: 75,
      MEDIUM: 50,
      LOW: 25,
      INFO: 10,
    };

    return severityScores[vuln.severity] || 50;
  }

  /**
   * Generate fallback analysis when AI is unavailable
   */
  private generateFallbackAnalysis(vuln: Vulnerability): AnalysisResult {
    const severityDescriptions: Record<string, string> = {
      CRITICAL: 'This critical vulnerability poses an immediate and severe risk to system security and should be addressed urgently.',
      HIGH: 'This high-severity vulnerability represents a significant security risk and should be prioritized for remediation.',
      MEDIUM: 'This medium-severity vulnerability should be addressed as part of regular security maintenance.',
      LOW: 'This low-severity vulnerability has limited impact but should be remediated when possible.',
      INFO: 'This informational finding provides awareness of potential security considerations.',
    };

    const analysis = severityDescriptions[vuln.severity] || severityDescriptions.MEDIUM;

    return {
      analysis,
      recommendations: this.generateDefaultRecommendations(vuln),
      riskScore: this.calculateRiskScore(vuln),
    };
  }

  /**
   * Generate default recommendations
   */
  private generateDefaultRecommendations(vuln: Vulnerability): string[] {
    const recommendations: string[] = [
      'Review the vulnerability details and assess the impact on your environment',
      'Check if patches or updates are available from the vendor',
      'Implement security controls to mitigate the risk',
    ];

    if (vuln.cvssScore && vuln.cvssScore >= 7) {
      recommendations.unshift('Prioritize immediate remediation due to high severity');
    }

    if (vuln.cveId) {
      recommendations.push(`Research CVE ${vuln.cveId} for additional context and solutions`);
    }

    return recommendations;
  }
}
