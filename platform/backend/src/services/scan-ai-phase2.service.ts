/**
 * Phase-2 AI Analysis Service
 * Generates semantic scan intent for Nuclei execution
 * Outputs ONLY tags, scopes, severities - NO filesystem paths
 */

import { logger } from '../utils/logger';
import { AssetContext, AIScanIntent, ScanProfile } from '../types/scan-orchestration.types';

export class ScanAIPhase2Service {
  private ollamaUrl: string;
  private model: string;
  private timeout: number;
  private enabled: boolean;

  constructor() {
    this.ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/generate';
    this.model = process.env.OLLAMA_MODEL || 'hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16';
    this.timeout = parseInt(process.env.OLLAMA_TIMEOUT || '30000');
    this.enabled = process.env.AI_ANALYSIS_ENABLED === 'true';
  }

  /**
   * Generate scan intent from asset context
   */
  async generateScanIntent(
    context: AssetContext,
    profile: ScanProfile
  ): Promise<AIScanIntent> {
    if (!this.enabled) {
      logger.warn('[PHASE-2-AI] AI analysis disabled, using fallback');
      return this.getFallbackIntent(context, profile);
    }

    try {
      const prompt = this.generatePrompt(context, profile);
      const response = await this.callOllama(prompt);
      const parsed = this.parseResponse(response);

      logger.info(`[PHASE-2-AI] Generated intent: ${parsed.scan_intent.vulnerability_tags.length} tags, ${parsed.scan_intent.scan_scopes.length} scopes`);
      return parsed;
    } catch (error: any) {
      logger.error(`[PHASE-2-AI] AI analysis failed: ${error.message}`);
      return this.getFallbackIntent(context, profile);
    }
  }

  /**
   * Generate AI prompt for Phase-2 analysis
   */
  private generatePrompt(context: AssetContext, profile: ScanProfile): string {
    const techStack = JSON.stringify(context.technologies, null, 2);
    const surface = JSON.stringify(context.surface, null, 2);
    const security = JSON.stringify(context.security, null, 2);

    return `You are a cybersecurity scan orchestrator. Based on the asset context below, generate a semantic scan intent for Nuclei vulnerability scanner.

TARGET: ${context.target}
SCAN PROFILE: ${profile}

DISCOVERED TECHNOLOGIES:
${techStack}

ATTACK SURFACE:
${surface}

SECURITY FEATURES:
${security}

INSTRUCTIONS:
1. Output ONLY semantic vulnerability classes as tags - NEVER template filenames, paths, or CVE IDs
2. Valid tag examples: sqli, xss, lfi, rfi, ssti, xxe, ssrf, auth-bypass, file-upload, misconfig, exposure
3. INVALID tag examples (DO NOT OUTPUT): CVE-2023-1234, wordpress-plugin.yaml, http/cves/php/, backup-files
4. Use standard scopes: http-vulnerabilities, http-misconfiguration, http-exposures, http-cves, http-default-logins
5. For ${profile} profile: ${this.getProfileGuidance(profile)}
6. Consider the technology stack to recommend relevant tags
7. Consider attack surface (forms, auth, file uploads) to recommend tests

CRITICAL TAG RULES (MANDATORY):
- Tags MUST be semantic vulnerability classes (e.g., "sqli", "xss", "auth-bypass")
- Tags MUST NOT contain: '/', '-' (except in standard names like "auth-bypass"), '*', '.yaml', '.yml'
- Tags MUST NOT be CVE IDs (CVE-YYYY-NNNNN)
- Tags MUST NOT be template filenames or paths
- Tags MUST be lowercase, alphanumeric, with optional hyphens

CRITICAL SAFETY RULES:
- NEVER generate SQL payloads or exploit code
- NEVER generate filesystem paths
- Only assess feasibility and discover parameter NAMES
- Parameter names only (e.g., "id", "search", "q") - NO values, NO payloads

SQL INJECTION ASSESSMENT (CRITICAL LOGIC):
- SQL injection testing MUST be enabled if ANY of the following exist:
  * Dynamic parameters in URLs (MANDATORY TRIGGER)
  * Forms that submit data (MANDATORY TRIGGER)
  * POST body parameters detected (MANDATORY TRIGGER)
  * API endpoints that accept input (MANDATORY TRIGGER)
- Database technology detection (MySQL, PostgreSQL, MSSQL, etc.) ONLY increases confidence and refines techniques
- NEVER disable SQLi testing solely due to lack of database fingerprinting
- If parameters exist, SQLi MUST be included in vulnerability_tags
- Recommend technique types: error-based, boolean-based, time-based (time-based only for DEEP profile)
- Output confidence level: low (no DB detected), medium (DB + few params), high (DB + many params)

PARAMETER DISCOVERY:
- If forms/parameters detected, list likely injectable parameter NAMES
- Examples: id, search, q, query, page, user, product_id, category
- NO payloads, NO values, NAMES ONLY

OUTPUT FORMAT (strict JSON):
{
  "scan_intent": {
    "vulnerability_tags": ["tag1", "tag2", "tag3"],
    "scan_scopes": ["scope1", "scope2"],
    "severity_levels": ["info", "low", "medium", "high", "critical"],
    "deep_scan_recommended": false
  },
  "rationale": {
    "key_factors": ["factor1", "factor2"],
    "confidence": "high"
  },
  "sqli_assessment": {
    "likely": true,
    "confidence": "high",
    "reasons": ["reason1", "reason2"],
    "recommended_techniques": ["error-based", "boolean-based"]
  },
  "candidate_parameters": ["param1", "param2"]
}

Generate the scan intent JSON now:`;
  }

  /**
   * Get profile-specific guidance with AI strictness levels
   */
  private getProfileGuidance(profile: ScanProfile): string {
    switch (profile) {
      case 'FAST':
        return `Be STRICT. Only recommend tags/scopes for HIGH-CONFIDENCE, CRITICAL vulnerabilities.
        - Prioritize exploitability and impact
        - Skip low-signal tests
        - Only recommend deep_scan if critical auth issues detected
        - Severity: high, critical ONLY`;
      case 'BALANCED':
        return `Be BALANCED. Recommend tags/scopes for all relevant vulnerabilities but use AI judgment to filter noise.
        - Consider asset context and technology stack
        - Include all severities but deprioritize low-confidence findings in rationale
        - Recommend deep_scan if moderate risk indicators present
        - Severity: all levels (AI-filtered based on confidence)`;
      case 'DEEP':
        return `Be PERMISSIVE. Recommend tags/scopes for comprehensive coverage including edge cases.
        - Include all potential vulnerability classes
        - Recommend deep_scan if ANY authentication or sensitive functionality detected
        - Consider advanced attack vectors (time-based SQLi, blind XXE, etc.)
        - Severity: all levels (exhaustive)`;
      default:
        return 'Balanced approach with medium to critical vulnerabilities';
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
          options: {
            temperature: 0.7,
            top_p: 0.9,
          },
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
        throw new Error('Ollama API request timed out');
      }
      throw error;
    }
  }

  /**
   * Parse AI response to extract JSON
   */
  private parseResponse(response: string): AIScanIntent {
    try {
      // Extract JSON from response (may be wrapped in markdown or text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (!parsed.scan_intent || !parsed.rationale) {
        throw new Error('Invalid AI response structure');
      }

      return parsed as AIScanIntent;
    } catch (error) {
      logger.error('[PHASE-2-AI] Failed to parse AI response, using fallback');
      throw error;
    }
  }

  /**
   * Get fallback intent when AI unavailable
   * FIXED: SQLi tags now added based on parameter detection, not just DB tech
   */
  private getFallbackIntent(context: AssetContext, profile: ScanProfile): AIScanIntent {
    const tags: string[] = [];
    const scopes: string[] = ['http-vulnerabilities', 'http-misconfiguration'];
    const factors: string[] = [];

    // FIXED ORDERING: Parameter Discovery FIRST
    const candidateParameters = this.discoverParameters(context);

    // Check if we have any parameters (critical for SQLi decision)
    const hasParameters = context.surface.parameters.length > 0 ||
                         context.surface.hasForms ||
                         context.surface.hasApi ||
                         candidateParameters.length > 0;

    // Technology-based tags
    if (context.technologies.language === 'php') {
      tags.push('lfi', 'rfi', 'misconfiguration');
      scopes.push('http-cves');
      factors.push('PHP backend detected');
    }

    if (context.technologies.cms === 'wordpress') {
      tags.push('wordpress', 'cms');
      factors.push('WordPress CMS detected');
    }

    // Attack surface tags
    if (context.surface.hasForms) {
      tags.push('xss', 'csrf');
      factors.push('Forms detected on site');
    }

    if (context.surface.hasAuth) {
      tags.push('auth-bypass', 'weak-auth');
      scopes.push('http-default-logins');
      factors.push('Authentication system detected');
    }

    if (context.surface.hasFileUpload) {
      tags.push('file-upload', 'rce');
      factors.push('File upload functionality detected');
    }

    if (context.surface.hasApi) {
      tags.push('api');
      factors.push('API endpoints detected');
    }

    // CRITICAL FIX: Add SQLi tag if parameters detected (mandatory)
    if (hasParameters) {
      tags.push('sqli');
      if (candidateParameters.length > 0) {
        factors.push(`SQLi testing enabled - ${candidateParameters.length} parameters discovered`);
      } else {
        factors.push('SQLi testing enabled - dynamic parameters detected');
      }
    }

    // Default minimal set if nothing detected
    if (tags.length === 0) {
      tags.push('misconfiguration', 'exposure');
      scopes.push('http-exposures');
      factors.push('Using baseline security checks');
    }

    // Severity based on profile
    const severityLevels = this.getSeverityForProfile(profile);

    // SQLi Assessment (with parameter context)
    const sqliAssessment = this.assessSQLiFeasibility(context, profile, candidateParameters);

    return {
      scan_intent: {
        vulnerability_tags: Array.from(new Set(tags)),
        scan_scopes: Array.from(new Set(scopes)),
        severity_levels: severityLevels,
        deep_scan_recommended: profile === 'DEEP',
      },
      rationale: {
        key_factors: factors,
        confidence: 'medium',
      },
      sqli_assessment: sqliAssessment,
      candidate_parameters: candidateParameters.length > 0 ? candidateParameters : undefined,
    };
  }

  /**
   * Assess SQLi Feasibility (Rule-Based Fallback)
   * SAFETY: Only assesses likelihood, never generates payloads
   * FIXED: Parameters are now MANDATORY trigger - database detection only refines confidence
   */
  private assessSQLiFeasibility(
    context: AssetContext,
    profile: ScanProfile,
    discoveredParams: string[]
  ): {
    likely: boolean;
    confidence: 'low' | 'medium' | 'high';
    reasons: string[];
    recommended_techniques: ('error-based' | 'boolean-based' | 'time-based')[];
  } {
    const reasons: string[] = [];
    const techniques: ('error-based' | 'boolean-based' | 'time-based')[] = [];
    let likely = false;
    let confidence: 'low' | 'medium' | 'high' = 'low';

    // Check for database indicators (ONLY used for confidence, NOT gating)
    const hasDatabaseTech = context.technologies.language === 'php' ||
                            context.technologies.language === 'asp' ||
                            context.technologies.language === 'jsp' ||
                            context.technologies.language === 'python' ||
                            context.technologies.language === 'ruby' ||
                            context.technologies.language === 'node';

    // Check for dynamic parameters (MANDATORY TRIGGER)
    const hasDynamicParams = context.surface.parameters.length > 0 ||
                            context.surface.hasForms ||
                            context.surface.hasApi ||
                            discoveredParams.length > 0;

    // Count of injectable parameters
    const paramCount = Math.max(
      context.surface.parameters.length,
      discoveredParams.length
    );

    // CRITICAL FIX: Parameters MUST trigger SQLi testing regardless of DB detection
    if (hasDynamicParams) {
      likely = true;

      // Database detection ONLY affects confidence level
      if (hasDatabaseTech && paramCount >= 5) {
        confidence = 'high';
        reasons.push('Backend language typically uses databases');
        reasons.push(`${paramCount} injectable parameters discovered`);
        techniques.push('error-based', 'boolean-based');
      } else if (hasDatabaseTech && paramCount >= 2) {
        confidence = 'high';
        reasons.push('Backend language typically uses databases');
        reasons.push('Multiple dynamic parameters detected');
        techniques.push('error-based', 'boolean-based');
      } else if (hasDatabaseTech) {
        confidence = 'medium';
        reasons.push('Backend language suggests database usage');
        reasons.push('Dynamic parameters detected in URL or forms');
        techniques.push('error-based', 'boolean-based');
      } else {
        // Parameters exist but NO database tech detected
        confidence = 'low';
        reasons.push('Dynamic parameters detected (testing enabled)');
        reasons.push('Database technology not fingerprinted - using generic SQLi tests');
        techniques.push('error-based'); // Still test with error-based
      }

      // Time-based only for DEEP profile (more aggressive)
      if (profile === 'DEEP') {
        techniques.push('time-based');
      }
    } else {
      // No parameters detected - SQLi not feasible
      likely = false;
      confidence = 'low';
      reasons.push('No dynamic parameters detected');
    }

    return { likely, confidence, reasons, recommended_techniques: techniques };
  }

  /**
   * Discover Candidate Parameters (Rule-Based Fallback)
   * SAFETY: Returns parameter NAMES only - NO payloads, NO values
   * ENHANCED: More aggressive parameter discovery for comprehensive SQLi testing
   */
  private discoverParameters(context: AssetContext): string[] {
    const parameters = new Set<string>();

    // Extract from surface parameters (if available)
    if (context.surface.parameters.length > 0) {
      context.surface.parameters.forEach(param => {
        // Only add if it looks like a parameter name (not a full query string)
        if (param && param.length < 50 && !param.includes('=')) {
          parameters.add(param);
        }
      });
    }

    // Common injectable parameter names (comprehensive list)
    const commonParams = [
      'id', 'search', 'q', 'query', 'page', 'user', 'product', 'category', 'article',
      'post', 'item', 'view', 'file', 'path', 'url', 'redirect', 'return', 'next',
      'sort', 'order', 'filter', 'limit', 'offset', 'lang', 'language', 'locale',
      'name', 'email', 'username', 'password', 'token', 'action', 'type', 'mode'
    ];

    // Add common params if forms OR API detected (more aggressive)
    if (context.surface.hasForms || context.surface.hasApi) {
      commonParams.forEach(param => parameters.add(param));
    }

    // Add common params if ANY endpoints detected
    if (context.surface.endpoints.length > 0) {
      // Add base set for any dynamic site
      ['id', 'search', 'q', 'page', 'filter'].forEach(param => parameters.add(param));
    }

    // Limit to reasonable number (increased from 10 to 15)
    return Array.from(parameters).slice(0, 15);
  }

  /**
   * Get severity levels for scan profile
   */
  private getSeverityForProfile(profile: ScanProfile): string[] {
    switch (profile) {
      case 'FAST':
        return ['high', 'critical'];
      case 'BALANCED':
      case 'DEEP':
        return ['info', 'low', 'medium', 'high', 'critical'];
      default:
        return ['medium', 'high', 'critical'];
    }
  }
}

export const scanAIPhase2Service = new ScanAIPhase2Service();
