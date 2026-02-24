/**
 * Source Code Scanner Service
 * Crawls target websites, extracts JavaScript sources, and uses Ollama LLM
 * to detect sensitive information (API keys, passwords, credentials, secrets).
 */

import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ScanTarget {
  url: string;
  depth?: number;          // how many levels of pages to crawl (default 2)
  maxPages?: number;       // max pages to crawl (default 30)
  includeInline?: boolean; // scan inline <script> blocks too (default true)
  customPrompt?: string;   // user-defined AI prompt for what to extract
}

export interface JSSource {
  url: string;
  size: number;
  type: 'external' | 'inline';
  snippet: string;         // first 200 chars preview
}

export interface SecretFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;            // e.g. 'API_KEY', 'PASSWORD', 'AWS_SECRET', etc.
  value: string;           // the actual secret (masked partially)
  context: string;         // surrounding code
  sourceUrl: string;
  line?: number;
  recommendation: string;
}

export interface ScanResult {
  id: string;
  targetUrl: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  pagesScanned: number;
  jsFilesFound: number;
  jsSources: JSSource[];
  findings: SecretFinding[];
  summary?: string;
  error?: string;
}

// ── Persistent store (file-backed + in-memory cache) ───────────────────
const scanStore = new Map<string, ScanResult>();
const STORE_DIR = path.join(process.cwd(), 'data', 'source-scans');

function ensureStoreDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    logger.info(`[SourceScanner] Created scan store directory: ${STORE_DIR}`);
  }
}

function persistScan(scan: ScanResult) {
  try {
    ensureStoreDir();
    fs.writeFileSync(
      path.join(STORE_DIR, `${scan.id}.json`),
      JSON.stringify(scan),
      'utf-8'
    );
  } catch (err: any) {
    logger.warn(`[SourceScanner] Failed to persist scan ${scan.id}: ${err.message}`);
  }
}

function loadAllScans(): void {
  try {
    ensureStoreDir();
    const files = fs.readdirSync(STORE_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(STORE_DIR, file), 'utf-8');
        const scan: ScanResult = JSON.parse(raw);
        scanStore.set(scan.id, scan);
      } catch {}
    }
    if (files.length > 0) {
      logger.info(`[SourceScanner] Loaded ${scanStore.size} persisted scans from disk`);
    }
  } catch (err: any) {
    logger.warn(`[SourceScanner] Failed to load persisted scans: ${err.message}`);
  }
}

// Load persisted scans on startup
loadAllScans();

export class SourceScannerService {
  private ollamaUrl: string;
  private model: string;
  private timeoutMs: number;

  constructor() {
    this.ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/generate';
    this.model = process.env.OLLAMA_MODEL || 'hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16';
    this.timeoutMs = parseInt(process.env.OLLAMA_TIMEOUT || '120000', 10);
  }

  /** Get a scan result by ID */
  getScan(scanId: string): ScanResult | undefined {
    return scanStore.get(scanId);
  }

  /** List all scans */
  listScans(): ScanResult[] {
    return Array.from(scanStore.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  /**
   * Start a new source scan (runs async in background).
   * Returns the scan ID immediately.
   */
  startScan(target: ScanTarget): string {
    const scanId = randomUUID();
    const scan: ScanResult = {
      id: scanId,
      targetUrl: target.url,
      startedAt: new Date().toISOString(),
      status: 'running',
      pagesScanned: 0,
      jsFilesFound: 0,
      jsSources: [],
      findings: [],
    };
    scanStore.set(scanId, scan);
    persistScan(scan);

    // Fire-and-forget the actual crawl
    this.executeScan(scanId, target).catch((err) => {
      logger.error(`Source scan ${scanId} failed:`, err);
      const s = scanStore.get(scanId);
      if (s) {
        s.status = 'failed';
        s.error = err.message || String(err);
        s.completedAt = new Date().toISOString();
        persistScan(s);
      }
    });

    return scanId;
  }

  /**
   * Core scan execution: crawl pages → extract JS → analyse with Ollama
   */
  private async executeScan(scanId: string, target: ScanTarget): Promise<void> {
    const scan = scanStore.get(scanId)!;
    const maxPages = target.maxPages || 30;
    const maxDepth = target.depth || 2;
    const includeInline = target.includeInline !== false;

    const baseUrl = new URL(target.url);
    const visited = new Set<string>();
    const queue: Array<{ url: string; depth: number }> = [{ url: target.url, depth: 0 }];
    const allJsSources: Map<string, string> = new Map(); // url → content
    const inlineScripts: Array<{ pageUrl: string; content: string }> = [];

    logger.info(`[SourceScanner] Starting crawl of ${target.url} (maxPages=${maxPages}, depth=${maxDepth})`);

    // ── Phase 1: Crawl & collect JS ────────────────────────────────────
    while (queue.length > 0 && visited.size < maxPages) {
      const item = queue.shift()!;
      const normalised = this.normaliseUrl(item.url);
      if (visited.has(normalised)) continue;
      visited.add(normalised);

      try {
        const html = await this.fetchPage(item.url);
        if (!html) continue;
        scan.pagesScanned = visited.size;

        // Extract JS references — multiple patterns for robustness
        const jsUrls = new Set<string>();

        // Pattern 1: <script src="..."> (any attribute order)
        for (const m of html.matchAll(/<script[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
          const u = this.resolveUrl(item.url, m[1]);
          if (u) jsUrls.add(u);
        }
        // Pattern 2: <script data-src="...">
        for (const m of html.matchAll(/<script[^>]*\bdata-src\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
          const u = this.resolveUrl(item.url, m[1]);
          if (u) jsUrls.add(u);
        }
        // Pattern 3: <link ... as="script" href="...">  (preloaded scripts)
        for (const m of html.matchAll(/<link[^>]*\bas\s*=\s*["']script["'][^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
          const u = this.resolveUrl(item.url, m[1]);
          if (u) jsUrls.add(u);
        }
        // Pattern 4: Any .js or .mjs URL in the HTML (catches dynamic loaders, JSON-LD refs, etc.)
        for (const m of html.matchAll(/["']((?:https?:)?\/\/[^"'\s]+\.(?:js|mjs)(?:\?[^"'\s]*)?)["']/gi)) {
          const u = this.resolveUrl(item.url, m[1]);
          if (u) jsUrls.add(u);
        }

        // Fetch each JS file
        for (const jsUrl of jsUrls) {
          if (allJsSources.has(jsUrl)) continue;
          try {
            const jsContent = await this.fetchPage(jsUrl);
            if (jsContent && jsContent.length > 0) {
              allJsSources.set(jsUrl, jsContent);
              scan.jsSources.push({
                url: jsUrl,
                size: jsContent.length,
                type: 'external',
                snippet: jsContent.substring(0, 200),
              });
            }
          } catch { /* skip unreachable JS */ }
        }

        // Extract inline <script>...</script> blocks
        if (includeInline) {
          const inlineMatches = html.matchAll(/<script(?![^>]+src=)[^>]*>([\s\S]*?)<\/script>/gi);
          for (const m of inlineMatches) {
            const content = m[1].trim();
            if (content.length > 20) {
              inlineScripts.push({ pageUrl: item.url, content });
            }
          }
        }

        // Find links to crawl deeper
        if (item.depth < maxDepth) {
          const linkMatches = html.matchAll(/href=["']([^"'#]+)["']/gi);
          for (const lm of linkMatches) {
            const linkUrl = this.resolveUrl(item.url, lm[1]);
            if (linkUrl && this.isSameOrigin(linkUrl, baseUrl) && !visited.has(this.normaliseUrl(linkUrl))) {
              queue.push({ url: linkUrl, depth: item.depth + 1 });
            }
          }
        }
      } catch (err: any) {
        logger.warn(`[SourceScanner] Failed to fetch ${item.url}: ${err.message}`);
      }
    }

    scan.jsFilesFound = allJsSources.size + inlineScripts.length;
    scan.jsSources = [
      ...scan.jsSources,
      ...inlineScripts.map((s, i) => ({
        url: `${s.pageUrl}#inline-${i}`,
        size: s.content.length,
        type: 'inline' as const,
        snippet: s.content.substring(0, 200),
      })),
    ];

    logger.info(`[SourceScanner] Crawl done: ${visited.size} pages, ${allJsSources.size} external JS, ${inlineScripts.length} inline scripts`);
    persistScan(scan); // persist after crawl

    // ── Phase 2: Regex pre-scan (fast, no LLM) ────────────────────────
    const regexFindings = this.regexPreScan(allJsSources, inlineScripts);
    scan.findings.push(...regexFindings);
    persistScan(scan); // persist after regex scan

    // ── Phase 2b: TruffleHog filesystem scan ────────────────────────
    try {
      const trufflehogFindings = await this.runTrufflehogScan(allJsSources, inlineScripts, target.url);
      // Deduplicate against regex findings
      for (const f of trufflehogFindings) {
        const isDupe = scan.findings.some(
          (existing) => existing.value === f.value && existing.sourceUrl === f.sourceUrl
        );
        if (!isDupe) scan.findings.push(f);
      }
      logger.info(`[SourceScanner] TruffleHog found ${trufflehogFindings.length} secrets (${trufflehogFindings.length - scan.findings.length + regexFindings.length + trufflehogFindings.length} after dedup)`);
      persistScan(scan);
    } catch (err: any) {
      logger.warn(`[SourceScanner] TruffleHog scan skipped: ${err.message}`);
    }

    // ── Phase 3: Ollama deep analysis ──────────────────────────────────
    // Send JS in chunks to Ollama for semantic analysis
    const allChunks = this.buildChunks(allJsSources, inlineScripts);
    logger.info(`[SourceScanner] Sending ${allChunks.length} chunks to Ollama for deep analysis`);

    for (let i = 0; i < allChunks.length; i++) {
      try {
        const aiFindings = await this.analyzeChunkWithOllama(allChunks[i], target.customPrompt);
        // Deduplicate against regex findings
        for (const f of aiFindings) {
          const isDupe = scan.findings.some(
            (existing) => existing.value === f.value && existing.sourceUrl === f.sourceUrl
          );
          if (!isDupe) scan.findings.push(f);
        }
      } catch (err: any) {
        logger.warn(`[SourceScanner] Ollama chunk ${i + 1}/${allChunks.length} failed: ${err.message}`);
      }
    }

    // Sort findings by severity
    const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    scan.findings.sort((a, b) => (sevOrder[a.severity] ?? 5) - (sevOrder[b.severity] ?? 5));

    // Generate summary
    scan.summary = this.generateSummary(scan);
    scan.status = 'completed';
    scan.completedAt = new Date().toISOString();
    persistScan(scan);

    logger.info(`[SourceScanner] Scan ${scanId} complete: ${scan.findings.length} findings`);
  }

  /**
   * Fast regex-based pre-scan for common secret patterns
   */
  private regexPreScan(
    externalJS: Map<string, string>,
    inlineScripts: Array<{ pageUrl: string; content: string }>
  ): SecretFinding[] {
    const patterns: Array<{
      name: string;
      type: string;
      severity: SecretFinding['severity'];
      regex: RegExp;
      recommendation: string;
    }> = [
      { name: 'AWS Access Key', type: 'AWS_KEY', severity: 'critical', regex: /AKIA[0-9A-Z]{16}/g, recommendation: 'Rotate this AWS access key immediately and remove from source code.' },
      { name: 'AWS Secret Key', type: 'AWS_SECRET', severity: 'critical', regex: /(?:aws_secret_access_key|aws_secret)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi, recommendation: 'Rotate AWS secret key and use environment variables.' },
      { name: 'Google API Key', type: 'GOOGLE_API_KEY', severity: 'high', regex: /AIza[0-9A-Za-z_-]{35}/g, recommendation: 'Restrict this Google API key to specific APIs and referrers.' },
      { name: 'GitHub Token', type: 'GITHUB_TOKEN', severity: 'critical', regex: /gh[pousr]_[A-Za-z0-9_]{36,255}/g, recommendation: 'Revoke this GitHub token immediately.' },
      { name: 'Slack Token', type: 'SLACK_TOKEN', severity: 'high', regex: /xox[baprs]-[0-9]+-[0-9]+-[A-Za-z0-9]+/g, recommendation: 'Revoke Slack token and regenerate.' },
      { name: 'Stripe Key', type: 'STRIPE_KEY', severity: 'critical', regex: /sk_live_[0-9a-zA-Z]{24,}/g, recommendation: 'Rotate Stripe secret key immediately.' },
      { name: 'Stripe Publishable', type: 'STRIPE_PUB', severity: 'low', regex: /pk_live_[0-9a-zA-Z]{24,}/g, recommendation: 'Verify Stripe publishable key restrictions.' },
      { name: 'JWT Token', type: 'JWT', severity: 'high', regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, recommendation: 'Hardcoded JWT detected. Verify it is not a long-lived session token.' },
      { name: 'Private Key', type: 'PRIVATE_KEY', severity: 'critical', regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, recommendation: 'Remove private key from client-side code immediately.' },
      { name: 'Basic Auth Header', type: 'BASIC_AUTH', severity: 'high', regex: /[Aa]uthorization['":\s]+Basic\s+[A-Za-z0-9+/=]{10,}/g, recommendation: 'Remove hardcoded Basic Auth credentials.' },
      { name: 'Bearer Token', type: 'BEARER_TOKEN', severity: 'high', regex: /[Aa]uthorization['":\s]+Bearer\s+[A-Za-z0-9._-]{20,}/g, recommendation: 'Remove hardcoded Bearer token from client code.' },
      { name: 'Password Assignment', type: 'PASSWORD', severity: 'high', regex: /(?:password|passwd|pwd)\s*[:=]\s*["']([^"']{4,})["']/gi, recommendation: 'Never store passwords in client-side JavaScript.' },
      { name: 'API Key Assignment', type: 'API_KEY', severity: 'high', regex: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*["']([^"']{8,})["']/gi, recommendation: 'Move API keys to server-side environment variables.' },
      { name: 'Database URL', type: 'DATABASE_URL', severity: 'critical', regex: /(?:mongodb|postgres|mysql|redis):\/\/[^\s"']{10,}/gi, recommendation: 'Database connection strings must never appear in frontend code.' },
      { name: 'Firebase Config', type: 'FIREBASE', severity: 'medium', regex: /(?:apiKey|authDomain|databaseURL|storageBucket)\s*:\s*["'][^"']+["']/g, recommendation: 'Ensure Firebase security rules are properly configured.' },
      { name: 'SendGrid Key', type: 'SENDGRID_KEY', severity: 'critical', regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, recommendation: 'Revoke SendGrid API key and use server-side only.' },
      { name: 'Twilio Credentials', type: 'TWILIO', severity: 'high', regex: /(?:twilio|TWILIO).*(?:SK|AC)[a-f0-9]{32}/gi, recommendation: 'Move Twilio credentials to server-side.' },
      { name: 'Mailgun Key', type: 'MAILGUN_KEY', severity: 'high', regex: /key-[0-9a-zA-Z]{32}/g, recommendation: 'Revoke Mailgun key and rotate.' },
      { name: 'Internal IP/Endpoint', type: 'INTERNAL_ENDPOINT', severity: 'medium', regex: /https?:\/\/(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})[:/][^\s"')]+/g, recommendation: 'Internal network endpoints exposed in client code.' },
      { name: 'Hardcoded Secret', type: 'SECRET', severity: 'high', regex: /(?:secret|SECRET|client_secret|CLIENT_SECRET)\s*[:=]\s*["']([^"']{8,})["']/g, recommendation: 'Remove hardcoded secrets from client code.' },
    ];

    const findings: SecretFinding[] = [];

    const scanSource = (sourceUrl: string, content: string) => {
      const lines = content.split('\n');
      for (const pattern of patterns) {
        // Reset regex state
        pattern.regex.lastIndex = 0;
        let match;
        while ((match = pattern.regex.exec(content)) !== null) {
          // Find line number
          const beforeMatch = content.substring(0, match.index);
          const lineNum = beforeMatch.split('\n').length;

          // Get context (surrounding lines)
          const startLine = Math.max(0, lineNum - 2);
          const endLine = Math.min(lines.length, lineNum + 2);
          const context = lines.slice(startLine, endLine).join('\n');

          const rawValue = match[1] || match[0];

          findings.push({
            id: randomUUID(),
            severity: pattern.severity,
            type: pattern.type,
            value: rawValue,
            context: context.substring(0, 500),
            sourceUrl,
            line: lineNum,
            recommendation: pattern.recommendation,
          });
        }
      }
    };

    for (const [url, content] of externalJS) {
      scanSource(url, content);
    }
    for (const script of inlineScripts) {
      scanSource(`${script.pageUrl}#inline`, script.content);
    }

    logger.info(`[SourceScanner] Regex pre-scan found ${findings.length} potential secrets`);
    return findings;
  }

  /**
   * Build chunks of JS source for Ollama (max ~4000 chars each)
   */
  private buildChunks(
    externalJS: Map<string, string>,
    inlineScripts: Array<{ pageUrl: string; content: string }>
  ): Array<{ sourceUrl: string; content: string }> {
    const CHUNK_SIZE = 4000;
    const chunks: Array<{ sourceUrl: string; content: string }> = [];

    const addChunks = (url: string, content: string) => {
      if (content.length <= CHUNK_SIZE) {
        chunks.push({ sourceUrl: url, content });
      } else {
        for (let i = 0; i < content.length; i += CHUNK_SIZE) {
          chunks.push({
            sourceUrl: `${url}#chunk-${Math.floor(i / CHUNK_SIZE)}`,
            content: content.substring(i, i + CHUNK_SIZE),
          });
        }
      }
    };

    for (const [url, content] of externalJS) addChunks(url, content);
    for (const s of inlineScripts) addChunks(`${s.pageUrl}#inline`, s.content);

    // Limit to 50 chunks max to avoid extremely long scans
    return chunks.slice(0, 50);
  }

  /**
   * Send a JS chunk to Ollama for deep secret detection
   */
  private async analyzeChunkWithOllama(
    chunk: { sourceUrl: string; content: string },
    customPrompt?: string
  ): Promise<SecretFinding[]> {
    const userInstruction = customPrompt
      ? `\nADDITIONAL USER INSTRUCTIONS:\n${customPrompt}\n`
      : '';

    const prompt = [
      'You are a security auditor specialized in finding exposed secrets in JavaScript source code.',
      'Analyze the following JavaScript code and find ALL sensitive information including:',
      '- API keys, tokens, secrets, credentials',
      '- Hardcoded passwords or usernames',
      '- Database connection strings',
      '- Private keys or certificates',
      '- Internal URLs, IPs, or debug endpoints',
      '- OAuth client secrets',
      '- Encryption keys',
      '- Any other sensitive data that should not be in client-side code',
      userInstruction,
      '',
      'Return STRICT JSON only (no markdown, no commentary):',
      '{',
      '  "findings": [',
      '    {',
      '      "severity": "critical"|"high"|"medium"|"low"|"info",',
      '      "type": "API_KEY"|"PASSWORD"|"TOKEN"|"SECRET"|"DATABASE_URL"|"PRIVATE_KEY"|"INTERNAL_ENDPOINT"|"CREDENTIAL"|"OTHER",',
      '      "value": "the actual secret value found",',
      '      "context": "the line or snippet where it was found",',
      '      "recommendation": "specific fix recommendation"',
      '    }',
      '  ]',
      '}',
      '',
      'If no secrets found, return: { "findings": [] }',
      '',
      `Source URL: ${chunk.sourceUrl}`,
      '',
      'JavaScript code:',
      '```',
      chunk.content,
      '```',
    ].join('\n');

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          format: 'json',
          prompt,
          stream: false,
          options: { temperature: 0.1, top_p: 0.9 },
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Ollama ${response.status}`);

      const data = await response.json();
      const text = (data?.response || '').trim();

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        const s = text.indexOf('{');
        const e = text.lastIndexOf('}');
        if (s >= 0 && e > s) parsed = JSON.parse(text.slice(s, e + 1));
        else return [];
      }

      const rawFindings = Array.isArray(parsed?.findings) ? parsed.findings : [];
      return rawFindings.map((f: any) => ({
        id: randomUUID(),
        severity: f.severity || 'medium',
        type: f.type || 'OTHER',
        value: f.value || '',
        context: (f.context || '').substring(0, 500),
        sourceUrl: chunk.sourceUrl,
        recommendation: f.recommendation || 'Review and remove sensitive data from client-side code.',
      }));
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error('Ollama timeout');
      throw err;
    } finally {
      clearTimeout(tid);
    }
  }

  // ── TruffleHog integration ─────────────────────────────────────────────

  /**
   * Write collected JS to a temp directory, run `trufflehog filesystem`, parse results.
   */
  private async runTrufflehogScan(
    externalJS: Map<string, string>,
    inlineScripts: Array<{ pageUrl: string; content: string }>,
    targetUrl: string,
  ): Promise<SecretFinding[]> {
    // Check if trufflehog is installed
    const trufflehogPath = await this.findTrufflehog();
    if (!trufflehogPath) {
      logger.info('[SourceScanner] TruffleHog not installed — skipping filesystem secret scan');
      return [];
    }

    // Write JS files to a temp directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spectra-th-'));
    const fileMap = new Map<string, string>(); // localPath → sourceUrl

    try {
      let fileIdx = 0;
      for (const [url, content] of externalJS) {
        const safeName = `ext_${fileIdx++}_${url.split('/').pop()?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'script.js'}`;
        const filePath = path.join(tmpDir, safeName);
        fs.writeFileSync(filePath, content, 'utf-8');
        fileMap.set(filePath, url);
      }
      for (let i = 0; i < inlineScripts.length; i++) {
        const filePath = path.join(tmpDir, `inline_${i}.js`);
        fs.writeFileSync(filePath, inlineScripts[i].content, 'utf-8');
        fileMap.set(filePath, `${inlineScripts[i].pageUrl}#inline-${i}`);
      }

      // Run TruffleHog
      const output = await new Promise<string>((resolve, reject) => {
        execFile(
          trufflehogPath,
          ['filesystem', tmpDir, '--json', '--no-update'],
          { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
          (err, stdout, stderr) => {
            if (stderr) logger.debug(`[SourceScanner] TruffleHog stderr: ${stderr.substring(0, 300)}`);
            // TruffleHog exits 0 on success even with findings
            if (err && !stdout) return reject(err);
            resolve(stdout || '');
          },
        );
      });

      // Parse JSONL output
      const findings: SecretFinding[] = [];
      for (const line of output.split('\n')) {
        if (!line.trim()) continue;
        try {
          const raw = JSON.parse(line);
          const detectorName: string = raw.DetectorName || raw.detectorName || 'Unknown';
          const rawValue: string = raw.Raw || raw.raw || '';
          const verified: boolean = raw.Verified || raw.verified || false;
          const sourceMeta = raw.SourceMetadata || raw.sourceMetadata || {};
          const fileData = sourceMeta.Data || sourceMeta.data || {};
          const fsData = fileData.Filesystem || fileData.filesystem || {};
          const localFile: string = fsData.file || '';
          const lineNum: number = fsData.line || 0;

          // Map local path back to original URL
          const sourceUrl = fileMap.get(localFile) || targetUrl;

          findings.push({
            id: randomUUID(),
            severity: this.classifyTrufflehogSeverity(detectorName, verified),
            type: detectorName.toUpperCase(),
            value: rawValue,
            context: `Detected by TruffleHog (${verified ? 'verified' : 'unverified'})`,
            sourceUrl,
            line: lineNum || undefined,
            recommendation: `Rotate this ${detectorName} credential immediately. Remove it from client-side code and store in a server-side secrets manager.`,
          });
        } catch {
          // skip unparseable lines
        }
      }

      logger.info(`[SourceScanner] TruffleHog raw output: ${findings.length} findings from ${fileMap.size} files`);
      return findings;
    } finally {
      // Cleanup temp directory
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  /**
   * Locate the trufflehog binary, return path or null if not installed.
   */
  private findTrufflehog(): Promise<string | null> {
    return new Promise((resolve) => {
      execFile('which', ['trufflehog'], (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(null);
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  /**
   * Map TruffleHog detector names to severity levels.
   */
  private classifyTrufflehogSeverity(detector: string, verified: boolean): SecretFinding['severity'] {
    const d = detector.toLowerCase();
    const criticalDetectors = ['aws', 'github', 'gitlab', 'gcp', 'azure', 'stripe', 'privatekey', 'sendgrid'];
    const highDetectors = ['slack', 'twilio', 'mailgun', 'heroku', 'digitalocean', 'npm', 'pypi', 'docker', 'jdbc', 'firebase'];

    for (const key of criticalDetectors) {
      if (d.includes(key)) return verified ? 'critical' : 'high';
    }
    for (const key of highDetectors) {
      if (d.includes(key)) return verified ? 'high' : 'medium';
    }
    return verified ? 'medium' : 'low';
  }

  // ── Helper methods ─────────────────────────────────────────────────────

  private async fetchPage(url: string): Promise<string | null> {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/javascript,text/javascript,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!resp.ok) {
        logger.warn(`[SourceScanner] HTTP ${resp.status} for ${url}`);
        return null;
      }
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('image') || ct.includes('font') || ct.includes('video') || ct.includes('audio') || ct.includes('octet-stream') || ct.includes('woff') || ct.includes('wasm')) {
        return null;
      }
      const text = await resp.text();
      return text;
    } catch (err: any) {
      logger.warn(`[SourceScanner] Fetch failed ${url}: ${err.message}`);
      return null;
    } finally {
      clearTimeout(tid);
    }
  }

  private resolveUrl(base: string, relative: string): string | null {
    try {
      if (relative.startsWith('data:') || relative.startsWith('blob:') || relative.startsWith('javascript:')) return null;
      return new URL(relative, base).href;
    } catch {
      return null;
    }
  }

  private isSameOrigin(url: string, base: URL): boolean {
    try {
      return new URL(url).hostname === base.hostname;
    } catch {
      return false;
    }
  }

  private normaliseUrl(url: string): string {
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname}`.replace(/\/$/, '');
    } catch {
      return url;
    }
  }

  private maskSecret(value: string): string {
    if (!value || value.length < 6) return value;
    const show = Math.min(4, Math.floor(value.length / 4));
    return value.substring(0, show) + '●'.repeat(Math.min(12, value.length - show * 2)) + value.substring(value.length - show);
  }

  private generateSummary(scan: ScanResult): string {
    const counts: Record<string, number> = {};
    for (const f of scan.findings) {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
    }
    const parts = [];
    if (counts.critical) parts.push(`${counts.critical} CRITICAL`);
    if (counts.high) parts.push(`${counts.high} HIGH`);
    if (counts.medium) parts.push(`${counts.medium} MEDIUM`);
    if (counts.low) parts.push(`${counts.low} LOW`);
    if (counts.info) parts.push(`${counts.info} INFO`);

    return `Scanned ${scan.pagesScanned} pages, found ${scan.jsFilesFound} JS sources. ${scan.findings.length} secrets detected: ${parts.join(', ') || 'none'}.`;
  }
}

export const sourceScannerService = new SourceScannerService();
