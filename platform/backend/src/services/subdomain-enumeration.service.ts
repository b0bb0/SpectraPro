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

class SubdomainEnumerationService {
  private readonly timeout: number;
  private readonly maxSubdomains: number;
  private readonly activeProcesses = new Map<string, ChildProcess>();

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
    return new Promise((resolve) => {
      const process = spawn('sublist3r', ['-h']);

      process.on('error', () => {
        logger.warn('[EXPOSURE] Sublist3r not found');
        resolve(false);
      });

      process.on('close', (code) => {
        resolve(code === 0);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        process.kill();
        resolve(false);
      }, 5000);
    });
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

      // Spawn Sublist3r process
      // sublist3r -d domain.com -o output.txt
      const sublist3rProcess = spawn('sublist3r', [
        '-d', domain,
        '-o', outputFile,
      ]);
      this.activeProcesses.set(scanId, sublist3rProcess);

      // Capture stdout
      sublist3rProcess.stdout.on('data', (data) => {
        const output = data.toString();
        logger.debug(`[EXPOSURE ${scanId}] Sublist3r output: ${output.substring(0, 200)}`);

        // Parse subdomains from output (Sublist3r prints them as it finds them)
        const lines = output.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && trimmed.includes('.') && !trimmed.includes(' ')) {
            subdomains.add(trimmed);
          }
        }
      });

      // Capture stderr
      sublist3rProcess.stderr.on('data', (data) => {
        logger.debug(`[EXPOSURE ${scanId}] Sublist3r stderr: ${data.toString()}`);
      });

      // Handle completion
      sublist3rProcess.on('close', (code) => {
        this.activeProcesses.delete(scanId);
        if (completed) return;
        completed = true;

        logger.info(`[EXPOSURE ${scanId}] Sublist3r completed with code ${code}`);

        // Read output file if it exists
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

            // Clean up
            fs.unlinkSync(outputFile);
          } catch (error) {
            logger.error(`[EXPOSURE ${scanId}] Error reading output file:`, error);
          }
        }

        const duration = Date.now() - startTime;
        const uniqueSubdomains = Array.from(subdomains);

        // Enforce max subdomains limit
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

      // Handle errors
      sublist3rProcess.on('error', (error) => {
        this.activeProcesses.delete(scanId);
        if (completed) return;
        completed = true;

        logger.error(`[EXPOSURE ${scanId}] Sublist3r process error:`, error);
        reject(new Error(`Sublist3r execution failed: ${error.message}`));
      });

      // Timeout protection
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

      // Cleanup timeout on completion
      sublist3rProcess.on('close', () => {
        clearTimeout(timeoutHandle);
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
}

export const subdomainEnumerationService = new SubdomainEnumerationService();
