import { spawn } from 'child_process';
import { parseStringPromise } from 'xml2js';
import { logger } from '../utils/logger';

interface NmapPort {
  port: number;
  protocol: string;
  state: string;
  service: string | null;
  product: string | null;
  version: string | null;
}

interface NmapAssessmentResult {
  target: string;
  overallRiskScore: number;
  executiveSummary: string;
  keyFindings: string[];
  recommendedActions: string[];
  ports: Array<{
    riskScore: number;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
    reason: string;
    port: number;
    protocol: string;
    state: string;
    service: string | null;
    product: string | null;
    version: string | null;
  }>;
}

class NmapAssessmentService {
  private ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/generate';
  private ollamaModel = process.env.OLLAMA_MODEL || 'hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16';

  async assessTarget(targetInput: string): Promise<NmapAssessmentResult> {
    const target = this.normalizeTarget(targetInput);
    this.validateTarget(target);

    const ports = await this.runNmap(target);
    if (ports.length === 0) {
      return {
        target,
        overallRiskScore: 0,
        executiveSummary: 'No open ports were identified by Nmap for this target.',
        keyFindings: [],
        recommendedActions: ['Continue periodic network exposure monitoring'],
        ports: [],
      };
    }

    const llmAssessment = await this.assessWithOllama(target, ports).catch((error: any) => {
      logger.warn(`[NMAP-ASSESS] Ollama assessment fallback: ${error.message}`);
      return null;
    });

    return llmAssessment || this.heuristicAssessment(target, ports);
  }

  private normalizeTarget(value: string): string {
    const trimmed = value.trim();
    const withoutProtocol = trimmed.replace(/^https?:\/\//i, '');
    return withoutProtocol.split('/')[0].toLowerCase();
  }

  private validateTarget(target: string): void {
    const domainOrIp = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+|(?:\d{1,3}\.){3}\d{1,3})$/i;
    if (!domainOrIp.test(target)) {
      throw new Error('Invalid target format. Use domain or IPv4 only.');
    }
  }

  private async runNmap(target: string): Promise<NmapPort[]> {
    const args = ['-Pn', '-sV', '--top-ports', '200', '--open', '-oX', '-', target];
    return new Promise((resolve, reject) => {
      const proc = spawn('nmap', args, {
        env: process.env,
      });

      let stdout = '';
      let stderr = '';
      const timeoutMs = 120000;
      const timer = setTimeout(() => {
        try {
          proc.kill('SIGTERM');
        } catch {
          // ignore
        }
        reject(new Error('Nmap scan timed out'));
      }, timeoutMs);

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to start nmap: ${err.message}`));
      });

      proc.on('close', async (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          return reject(new Error(`nmap exited with code ${code}: ${stderr.slice(0, 300)}`));
        }
        try {
          const parsed = await parseStringPromise(stdout);
          const ports = this.extractPorts(parsed);
          resolve(ports);
        } catch (err: any) {
          reject(new Error(`Failed to parse nmap XML: ${err.message}`));
        }
      });
    });
  }

  private extractPorts(xml: any): NmapPort[] {
    const hosts = xml?.nmaprun?.host || [];
    const all: NmapPort[] = [];

    for (const host of hosts) {
      const ports = host?.ports?.[0]?.port || [];
      for (const p of ports) {
        const state = p?.state?.[0]?.$?.state || 'unknown';
        if (state !== 'open') continue;
        all.push({
          port: parseInt(p?.$?.portid || '0', 10),
          protocol: p?.$?.protocol || 'tcp',
          state,
          service: p?.service?.[0]?.$?.name || null,
          product: p?.service?.[0]?.$?.product || null,
          version: p?.service?.[0]?.$?.version || null,
        });
      }
    }
    return all;
  }

  private async assessWithOllama(target: string, ports: NmapPort[]): Promise<NmapAssessmentResult> {
    const prompt = `
You are a senior pentest analyst.
Assess Nmap open port findings for target "${target}".
Return STRICT JSON:
{
  "overallRiskScore": number (0-100),
  "executiveSummary": string,
  "keyFindings": string[],
  "recommendedActions": string[],
  "ports": [
    {
      "index": number,
      "riskScore": number (0-100),
      "severity": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"INFO",
      "reason": string
    }
  ]
}
Data:
${JSON.stringify(ports)}
`;

    const response = await fetch(this.ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.ollamaModel,
        prompt,
        stream: false,
        options: { temperature: 0.2 },
      }),
    });
    if (!response.ok) throw new Error(`Ollama API returned ${response.status}`);

    const data = await response.json();
    const parsed = this.parseJsonFromText(data?.response || '');
    if (!parsed) throw new Error('Failed to parse Ollama JSON output');

    const scored = (Array.isArray(parsed.ports) ? parsed.ports : [])
      .map((x: any) => {
        const idx = typeof x.index === 'number' ? x.index : -1;
        const p = ports[idx];
        if (!p) return null;
        return {
          riskScore: this.clampScore(x.riskScore),
          severity: this.normalizeSeverity(x.severity),
          reason: typeof x.reason === 'string' ? x.reason : 'No rationale provided',
          ...p,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.riskScore - a.riskScore);

    return {
      target,
      overallRiskScore: this.clampScore(parsed.overallRiskScore),
      executiveSummary: typeof parsed.executiveSummary === 'string' ? parsed.executiveSummary : 'Assessment complete.',
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings.slice(0, 8) : [],
      recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions.slice(0, 8) : [],
      ports: scored as any,
    };
  }

  private heuristicAssessment(target: string, ports: NmapPort[]): NmapAssessmentResult {
    const scored = ports
      .map((p) => {
        let riskScore = 10;
        let reason = 'Open service detected';
        const serviceText = `${p.service || ''} ${p.product || ''} ${p.version || ''}`.toLowerCase();

        if ([22, 3389, 445, 2375, 5432, 3306, 27017, 6379, 9200].includes(p.port)) {
          riskScore += 40;
          reason = 'Sensitive remote/administrative or database service exposed';
        }
        if (['ftp', 'telnet', 'vnc'].some((x) => serviceText.includes(x))) {
          riskScore += 25;
          reason = 'Legacy or weakly secured service exposed';
        }
        if (serviceText.includes('openssh') && /6\./.test(serviceText)) {
          riskScore += 15;
          reason = 'Potentially outdated SSH version exposed';
        }

        riskScore = Math.min(100, riskScore);
        return {
          ...p,
          riskScore,
          severity: this.normalizeSeverity(
            riskScore >= 85 ? 'CRITICAL' : riskScore >= 70 ? 'HIGH' : riskScore >= 45 ? 'MEDIUM' : riskScore >= 25 ? 'LOW' : 'INFO'
          ),
          reason,
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore);

    const overallRiskScore = Math.round(
      scored.slice(0, 10).reduce((sum, x) => sum + x.riskScore, 0) / Math.max(1, Math.min(10, scored.length))
    );

    return {
      target,
      overallRiskScore,
      executiveSummary: 'Heuristic Nmap assessment generated because Ollama analysis was unavailable.',
      keyFindings: scored.slice(0, 6).map((x) => `${x.port}/${x.protocol} ${x.service || 'unknown'} - ${x.reason}`),
      recommendedActions: [
        'Restrict unnecessary externally exposed ports via firewall/security groups',
        'Harden remote access services and enforce MFA where possible',
        'Patch and upgrade exposed service versions',
      ],
      ports: scored,
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

export const nmapAssessmentService = new NmapAssessmentService();
