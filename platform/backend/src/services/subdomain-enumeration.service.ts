/**
 * Subdomain Enumeration Service
 * Uses Sublist3r for comprehensive subdomain discovery
 */

import { spawn, ChildProcess } from 'child_process';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface EnumerationResult {
  subdomains: string[];
  count: number;
  duration: number;
}

interface Sublist3rRunner {
  command: string;
  prefixArgs: string[];
  displayName: string;
}

class SubdomainEnumerationService {
  private readonly timeout: number;
  private readonly maxSubdomains: number;
  private readonly activeProcesses = new Map<string, ChildProcess>();
  private resolvedRunner: Sublist3rRunner | null | undefined;
  private resolveRunnerPromise: Promise<Sublist3rRunner | null> | null = null;

  constructor() {
    this.timeout = parseInt(process.env.EXPOSURE_SCAN_TIMEOUT || '120000'); // 2 minutes default
    this.maxSubdomains = parseInt(process.env.EXPOSURE_MAX_SUBDOMAINS || '500');
  }

  killProcess(scanId: string): boolean {
    const proc = this.activeProcesses.get(scanId);
    if (!proc) return false;
    try {
      if (proc.pid) {
        try {
          if (process.platform !== 'win32') {
            process.kill(-proc.pid, 'SIGTERM');
          }
        } catch {
          // ignore group kill failures
        }
        proc.kill('SIGTERM');
      }
    } catch {
      // ignore kill errors
    } finally {
      this.activeProcesses.delete(scanId);
    }
    return true;
  }

  /**
   * Check if Sublist3r is installed
   */
  async checkSublist3rInstalled(): Promise<boolean> {
    const runner = await this.resolveSublist3rRunner();
    if (!runner) {
      logger.warn('[EXPOSURE] Sublist3r not found');
      return false;
    }

    return true;
  }

  /**
   * Enumerate subdomains for a given domain using Sublist3r
   */
  async enumerateSubdomains(domain: string, scanId: string): Promise<EnumerationResult> {
    const startTime = Date.now();
    const outputDir = path.join(os.tmpdir(), 'spectra-exposure');
    const outputFile = path.join(outputDir, `${scanId}.txt`);

    // Create temp directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    logger.info(`[EXPOSURE ${scanId}] Starting subdomain enumeration for ${domain}`);

    return new Promise((resolve, reject) => {
      const subdomains = new Set<string>();
      let completed = false;
      this.spawnSublist3rProcess(['-d', domain, '-o', outputFile])
        .then((sublist3rProcess) => {
          this.activeProcesses.set(scanId, sublist3rProcess);

          sublist3rProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            logger.debug(`[EXPOSURE ${scanId}] Sublist3r output: ${output.substring(0, 200)}`);

            const lines = output.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed && trimmed.includes('.') && !trimmed.includes(' ')) {
                subdomains.add(trimmed);
              }
            }
          });

          sublist3rProcess.stderr?.on('data', (data) => {
            logger.debug(`[EXPOSURE ${scanId}] Sublist3r stderr: ${data.toString()}`);
          });

          sublist3rProcess.on('close', (code) => {
            this.activeProcesses.delete(scanId);
            if (completed) return;
            completed = true;

            logger.info(`[EXPOSURE ${scanId}] Sublist3r completed with code ${code}`);

            if (fs.existsSync(outputFile)) {
              try {
                const content = fs.readFileSync(outputFile, 'utf-8');
                const lines = content.split('\n');
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed && trimmed.includes('.')) {
                    subdomains.add(trimmed);
                  }
                }

                fs.unlinkSync(outputFile);
              } catch (error) {
                logger.error(`[EXPOSURE ${scanId}] Error reading output file:`, error);
              }
            }

            const duration = Date.now() - startTime;
            const uniqueSubdomains = Array.from(subdomains);

            if (uniqueSubdomains.length > this.maxSubdomains) {
              logger.warn(`[EXPOSURE ${scanId}] Found ${uniqueSubdomains.length} subdomains, limiting to ${this.maxSubdomains}`);
              uniqueSubdomains.splice(this.maxSubdomains);
            }

            logger.info(`[EXPOSURE ${scanId}] Found ${uniqueSubdomains.length} unique subdomains in ${duration}ms`);

            resolve({
              subdomains: uniqueSubdomains,
              count: uniqueSubdomains.length,
              duration: Math.round(duration / 1000),
            });
          });

          sublist3rProcess.on('error', (error) => {
            this.activeProcesses.delete(scanId);
            if (completed) return;
            completed = true;

            logger.error(`[EXPOSURE ${scanId}] Sublist3r process error:`, error);
            reject(new Error(`Sublist3r execution failed: ${error.message}`));
          });

          const timeoutHandle = setTimeout(() => {
            if (completed) return;
            completed = true;

            logger.warn(`[EXPOSURE ${scanId}] Sublist3r timeout after ${this.timeout}ms`);
            sublist3rProcess.kill();

            const duration = Date.now() - startTime;
            const uniqueSubdomains = Array.from(subdomains);

            resolve({
              subdomains: uniqueSubdomains,
              count: uniqueSubdomains.length,
              duration: Math.round(duration / 1000),
            });
          }, this.timeout);

          sublist3rProcess.on('close', () => {
            clearTimeout(timeoutHandle);
          });
        })
        .catch((error) => {
          if (completed) return;
          completed = true;
          reject(error);
        });
    });
  }

  /**
   * Validate domain format
   */
  validateDomain(domain: string): { valid: boolean; normalized: string; error?: string } {
    // Remove protocol if present
    let normalized = domain.trim().toLowerCase();
    normalized = normalized.replace(/^https?:\/\//, '');
    normalized = normalized.replace(/^www\./, '');
    normalized = normalized.replace(/\/.*$/, ''); // Remove path

    // Basic domain validation
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;

    if (!domainRegex.test(normalized)) {
      return {
        valid: false,
        normalized,
        error: 'Invalid domain format',
      };
    }

    // Reject IP addresses
    const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    if (ipRegex.test(normalized)) {
      return {
        valid: false,
        normalized,
        error: 'IP addresses are not supported',
      };
    }

    // Reject wildcards
    if (normalized.includes('*')) {
      return {
        valid: false,
        normalized,
        error: 'Wildcard domains are not supported',
      };
    }

    // Max length check
    if (normalized.length > 253) {
      return {
        valid: false,
        normalized,
        error: 'Domain name too long',
      };
    }

    return {
      valid: true,
      normalized,
    };
  }

  /**
   * Deduplicate and normalize subdomain list
   */
  deduplicateSubdomains(subdomains: string[]): string[] {
    const uniqueSet = new Set<string>();

    for (const subdomain of subdomains) {
      let normalized = subdomain.trim().toLowerCase();
      normalized = normalized.replace(/^https?:\/\//, '');
      normalized = normalized.replace(/\/.*$/, '');

      if (normalized && normalized.includes('.')) {
        uniqueSet.add(normalized);
      }
    }

    return Array.from(uniqueSet).sort();
  }

  private async spawnSublist3rProcess(args: string[]): Promise<ChildProcess> {
    const runner = await this.resolveSublist3rRunner();
    if (!runner) {
      throw new Error(
        'Sublist3r is not installed or not available in PATH. Set SUBLIST3R_PATH or install the tool.'
      );
    }

    logger.info(`[EXPOSURE] Using Sublist3r runner: ${runner.displayName}`);
    return spawn(runner.command, [...runner.prefixArgs, ...args], {
      detached: process.platform !== 'win32',
    });
  }

  private async resolveSublist3rRunner(): Promise<Sublist3rRunner | null> {
    if (this.resolvedRunner !== undefined) {
      return this.resolvedRunner;
    }

    if (this.resolveRunnerPromise) {
      return this.resolveRunnerPromise;
    }

    this.resolveRunnerPromise = (async () => {
      for (const candidate of this.getSublist3rCandidates()) {
        if (await this.probeSublist3rCandidate(candidate)) {
          this.resolvedRunner = candidate;
          logger.info(`[EXPOSURE] Resolved Sublist3r runner: ${candidate.displayName}`);
          return candidate;
        }
      }

      this.resolvedRunner = null;
      return null;
    })();

    try {
      return await this.resolveRunnerPromise;
    } finally {
      this.resolveRunnerPromise = null;
    }
  }

  private getSublist3rCandidates(): Sublist3rRunner[] {
    const envPath = process.env.SUBLIST3R_PATH?.trim();
    const candidates: Sublist3rRunner[] = [];

    if (envPath) {
      candidates.push({
        command: envPath,
        prefixArgs: [],
        displayName: envPath,
      });
    }

    candidates.push(
      { command: 'sublist3r', prefixArgs: [], displayName: 'sublist3r' },
      { command: '/opt/homebrew/bin/sublist3r', prefixArgs: [], displayName: '/opt/homebrew/bin/sublist3r' },
      { command: '/usr/local/bin/sublist3r', prefixArgs: [], displayName: '/usr/local/bin/sublist3r' },
      { command: '/usr/bin/sublist3r', prefixArgs: [], displayName: '/usr/bin/sublist3r' },
      { command: 'python3', prefixArgs: ['-m', 'sublist3r'], displayName: 'python3 -m sublist3r' },
      { command: 'python', prefixArgs: ['-m', 'sublist3r'], displayName: 'python -m sublist3r' },
    );

    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      const key = `${candidate.command} ${candidate.prefixArgs.join(' ')}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private async probeSublist3rCandidate(candidate: Sublist3rRunner): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      let timeoutHandle: NodeJS.Timeout;
      const proc = spawn(candidate.command, [...candidate.prefixArgs, '-h'], {
        stdio: 'ignore',
      });

      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        if (proc.exitCode === null) {
          try {
            proc.kill();
          } catch {
            // ignore probe cleanup failures
          }
        }
        resolve(result);
      };

      proc.on('error', () => finish(false));
      proc.on('close', (code) => finish(code === 0));

      timeoutHandle = setTimeout(() => finish(false), 5000);
    });
  }
}

export const subdomainEnumerationService = new SubdomainEnumerationService();
