import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

interface ShodanExposure {
  ip: string | null;
  port: number | null;
  transport: string | null;
  product: string | null;
  version: string | null;
  org: string | null;
  hostnames: string[];
  domains: string[];
  matchedValues?: string[];
  matchReason?: 'exact_ip' | 'exact_domain' | 'subdomain_domain';
  timestamp: string | null;
  raw: any;
}

interface AssessmentResult {
  target: string;
  overallRiskScore: number;
  executiveSummary: string;
  keyFindings: string[];
  recommendedActions: string[];
  exposures: Array<{
    relevanceScore: number;
    riskScore: number;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
    reason: string;
    ip: string | null;
    port: number | null;
    service: string | null;
    organization: string | null;
    hostnames: string[];
    matchedValues: string[];
    matchReason: 'exact_ip' | 'exact_domain' | 'subdomain_domain';
    timestamp: string | null;
    raw: any;
  }>;
}

class ShodanAssessmentService {
  private ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/generate';
  private ollamaModel = process.env.OLLAMA_MODEL || 'hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16';

  async assessTarget(tenantId: string, targetInput: string): Promise<AssessmentResult> {
    const target = this.normalizeTarget(targetInput);

    const shodanKey = await this.getTenantShodanKey(tenantId);
    if (!shodanKey) {
      throw new Error('No SHODAN integration API key configured for this tenant');
    }

    const exposures = await this.fetchShodanExposures(shodanKey, target);
    const capped = exposures.slice(0, 100);

    if (capped.length === 0) {
      return {
        target,
        overallRiskScore: 0,
        executiveSummary: 'No exposed Shodan results found for this target.',
        keyFindings: [],
        recommendedActions: ['Continue monitoring for newly exposed services'],
        exposures: [],
      };
    }

    const llmAssessment = await this.assessWithOllama(target, capped).catch((error: any) => {
      logger.warn(`[SHODAN-ASSESS] Ollama assessment fallback: ${error.message}`);
      return null;
    });

    if (llmAssessment) {
      return llmAssessment;
    }

    return this.heuristicAssessment(target, capped);
  }

  private normalizeTarget(value: string): string {
    const trimmed = value.trim();
    const withoutProtocol = trimmed.replace(/^https?:\/\//i, '');
    return withoutProtocol.split('/')[0].toLowerCase();
  }

  private isIp(value: string): boolean {
    return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value);
  }

  private async getTenantShodanKey(tenantId: string): Promise<string | null> {
    if (process.env.SHODAN_API_KEY) {
      return process.env.SHODAN_API_KEY;
    }
    const integration = await prisma.tool_integrations.findFirst({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { type: 'SHODAN' },
          { provider: { contains: 'shodan', mode: 'insensitive' } },
          { name: { contains: 'shodan', mode: 'insensitive' } },
        ],
        authValue: { not: null },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        authValue: true,
      },
    });

    return integration?.authValue || null;
  }

  private async fetchShodanExposures(apiKey: string, target: string): Promise<ShodanExposure[]> {
    const isIpTarget = this.isIp(target);
    const url = new URL('https://api.shodan.io/shodan/host/search');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('query', isIpTarget ? `ip:${target}` : `hostname:${target}`);
    url.searchParams.set('minify', 'false');
    url.searchParams.set('page', '1');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shodan API error ${response.status}: ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    const matches = Array.isArray(data?.matches) ? data.matches : [];

    const mapped: ShodanExposure[] = matches.map((m: any) => ({
      ip: m.ip_str || null,
      port: typeof m.port === 'number' ? m.port : null,
      transport: m.transport || null,
      product: m.product || null,
      version: m.version || null,
      org: m.org || null,
      hostnames: Array.isArray(m.hostnames) ? m.hostnames : [],
      domains: Array.isArray(m.domains) ? m.domains : [],
      timestamp: m.timestamp || null,
      raw: m,
    }));

    // Strict domain/IP attribution to avoid unrelated shared-host/CDN noise.
    return mapped
      .map((exp) => this.withMatchContext(exp, target, isIpTarget))
      .filter((exp): exp is ShodanExposure => !!exp);
  }

  private withMatchContext(
    exposure: ShodanExposure,
    target: string,
    isIpTarget: boolean
  ): ShodanExposure | null {
    if (isIpTarget) {
      if (exposure.ip !== target) return null;
      return {
        ...exposure,
        matchedValues: [target],
        matchReason: 'exact_ip',
      };
    }

    const normalizedTarget = target.toLowerCase();
    const candidates = [...exposure.hostnames, ...exposure.domains]
      .filter(Boolean)
      .map((value) => value.toLowerCase().replace(/\.$/, ''));

    const matched = candidates.filter(
      (value) => value === normalizedTarget || value.endsWith(`.${normalizedTarget}`)
    );

    if (matched.length === 0) {
      return null;
    }

    return {
      ...exposure,
      matchedValues: Array.from(new Set(matched)),
      matchReason: matched.some((v) => v === normalizedTarget) ? 'exact_domain' : 'subdomain_domain',
    };
  }

  private async assessWithOllama(target: string, exposures: ShodanExposure[]): Promise<AssessmentResult> {
    const prompt = `
You are a senior offensive security analyst.
Assess internet-exposed services for target "${target}" from Shodan.
Return STRICT JSON only with this exact schema:
{
  "overallRiskScore": number (0-100),
  "executiveSummary": string,
  "keyFindings": string[],
  "recommendedActions": string[],
  "exposures": [
    {
      "index": number,
      "relevanceScore": number (0-100),
      "riskScore": number (0-100),
      "severity": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"INFO",
      "reason": string
    }
  ]
}

Prioritize truly risky exposures (auth endpoints, remote admin, old software, unusual open services).
Discard noise by giving low relevance.
Data:
${JSON.stringify(exposures)}
`;

    const response = await fetch(this.ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.ollamaModel,
        prompt,
        stream: false,
        options: {
          temperature: 0.2,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API returned ${response.status}`);
    }

    const data = await response.json();
    const rawText = data?.response || '';
    const parsed = this.parseJsonFromText(rawText);
    if (!parsed) {
      throw new Error('Failed to parse Ollama JSON output');
    }

    const scored = (Array.isArray(parsed.exposures) ? parsed.exposures : [])
      .map((x: any) => {
        const idx = typeof x.index === 'number' ? x.index : -1;
        const base = exposures[idx];
        if (!base) return null;
        return {
          relevanceScore: this.clampScore(x.relevanceScore),
          riskScore: this.clampScore(x.riskScore),
          severity: this.normalizeSeverity(x.severity),
          reason: typeof x.reason === 'string' ? x.reason : 'No rationale provided',
          ip: base.ip,
          port: base.port,
          service: base.product || base.transport,
          organization: base.org,
          hostnames: base.hostnames,
          matchedValues: base.matchedValues || [],
          matchReason: base.matchReason || 'subdomain_domain',
          timestamp: base.timestamp,
          raw: base.raw,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore || b.riskScore - a.riskScore);

    return {
      target,
      overallRiskScore: this.clampScore(parsed.overallRiskScore),
      executiveSummary: typeof parsed.executiveSummary === 'string' ? parsed.executiveSummary : 'Assessment complete.',
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings.slice(0, 8) : [],
      recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions.slice(0, 8) : [],
      exposures: scored as any,
    };
  }

  private heuristicAssessment(target: string, exposures: ShodanExposure[]): AssessmentResult {
    const scored = exposures
      .map((exp) => {
        let score = 10;
        let reason = 'Standard exposed service';
        const serviceText = `${exp.product || ''} ${exp.version || ''}`.toLowerCase();

        if ([22, 3389, 5900, 2375, 27017, 9200].includes(exp.port || -1)) {
          score += 35;
          reason = 'Potentially sensitive remote service exposed';
        }
        if (serviceText.includes('ftp') || serviceText.includes('telnet')) {
          score += 25;
          reason = 'Legacy/insecure service exposure';
        }
        if (serviceText.includes('apache/2.2') || serviceText.includes('openssh_6.')) {
          score += 20;
          reason = 'Outdated software version appears exposed';
        }

        const relevance = Math.min(100, score);
        return {
          relevanceScore: relevance,
          riskScore: relevance,
          severity: this.normalizeSeverity(
            relevance >= 85 ? 'CRITICAL' : relevance >= 70 ? 'HIGH' : relevance >= 45 ? 'MEDIUM' : relevance >= 25 ? 'LOW' : 'INFO'
          ),
          reason,
          ip: exp.ip,
          port: exp.port,
          service: exp.product || exp.transport,
          organization: exp.org,
          hostnames: exp.hostnames,
          matchedValues: exp.matchedValues || [],
          matchReason: exp.matchReason || 'subdomain_domain',
          timestamp: exp.timestamp,
          raw: exp.raw,
        };
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    const overallRiskScore = Math.round(
      scored.slice(0, 10).reduce((sum, s) => sum + s.riskScore, 0) / Math.max(1, Math.min(10, scored.length))
    );

    return {
      target,
      overallRiskScore,
      executiveSummary: 'Heuristic assessment generated because Ollama analysis was unavailable.',
      keyFindings: scored.slice(0, 5).map((s) => `${s.ip || 'unknown'}:${s.port || 'n/a'} - ${s.reason}`),
      recommendedActions: [
        'Restrict internet exposure of remote admin and management ports',
        'Patch outdated service versions',
        'Apply network ACL/WAF controls and continuous monitoring',
      ],
      exposures: scored,
    };
  }

  private parseJsonFromText(text: string): any | null {
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      // continue
    }

    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }

  private clampScore(value: any): number {
    const n = typeof value === 'number' ? value : parseInt(String(value || 0), 10);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private normalizeSeverity(value: any): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' {
    const v = String(value || '').toUpperCase();
    if (v === 'CRITICAL' || v === 'HIGH' || v === 'MEDIUM' || v === 'LOW' || v === 'INFO') return v;
    return 'INFO';
  }
}

export const shodanAssessmentService = new ShodanAssessmentService();
